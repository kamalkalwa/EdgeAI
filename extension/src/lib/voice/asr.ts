/**
 * Automatic Speech Recognition — Whisper (ADR-009)
 *
 * Uses transformers.js whisper-tiny.en (40MB ONNX) for transcription.
 * WebGPU acceleration where available (required on iOS Safari — no SharedArrayBuffer).
 *
 * Pipeline:
 *   getUserMedia → audio chunks → VAD filter → Whisper → transcript
 *   → intent classification → route to store or RAG/LLM
 */

import { pipeline, type AutomaticSpeechRecognitionPipeline, env } from '@huggingface/transformers';
import type { VoiceIntent, VoiceTranscript } from '@/lib/types';
import { SileroVAD, decodeAudioToFloat32, splitIntoFrames } from './vad';

env.allowLocalModels = false;
env.useBrowserCache = true;

const SAMPLE_RATE = 16_000;

// transformers.js v3 pipeline() has deeply polymorphic overloads that cause TS2590
// ("union type too complex to represent") when device/dtype literals are inferred.
// Casting to a simple signature bypasses overload resolution entirely.
type SimplePipeline = (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
const callPipeline = pipeline as unknown as SimplePipeline;

export class WhisperASR {
  private pipe: AutomaticSpeechRecognitionPipeline | null = null;
  private readonly modelId = 'Xenova/whisper-tiny.en';

  async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) return;

    this.pipe = (await callPipeline('automatic-speech-recognition', this.modelId, {
      progress_callback: onProgress
        ? (info: Record<string, unknown>) => {
            if (typeof info['progress'] === 'number') onProgress(Math.round(info['progress']));
          }
        : undefined,
      dtype: 'fp32',
      device: navigator.gpu ? 'webgpu' : 'wasm',
    })) as AutomaticSpeechRecognitionPipeline;
  }

  /**
   * Transcribe a Float32Array of 16kHz mono audio.
   */
  async transcribe(audio: Float32Array): Promise<string> {
    if (!this.pipe) throw new Error('Whisper model not loaded');

    // sampling_rate removed — not a valid option in transformers.js v3 ASR pipeline calls
    const result = await this.pipe(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'english',
      task: 'transcribe',
    });

    const text = Array.isArray(result) ? result[0]?.text : result?.text;
    return (text ?? '').trim();
  }
}

// ─── Intent Classification ────────────────────────────────────────────────────
// Rule-based classifier — no LLM call needed for common intents.
// This makes voice notes instantaneous even if the LLM isn't loaded.

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: VoiceIntent }> = [
  { pattern: /^(note that|remember|add note|write down|make a note)\s/i, intent: 'note' },
  { pattern: /^(search for|find|look up|search)\s/i, intent: 'search' },
  { pattern: /^(remind me|set reminder|reminder)\s/i, intent: 'remind' },
  { pattern: /^(what|how|why|who|when|where|can you|explain|tell me)/i, intent: 'ask' },
];

export function classifyIntent(transcript: string): VoiceIntent {
  const normalized = transcript.trim().toLowerCase();

  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(normalized)) return intent;
  }

  // Default to ask if none match
  return 'unknown';
}

export function buildVoiceTranscript(transcript: string): VoiceTranscript {
  const intent = classifyIntent(transcript);
  return {
    text: transcript,
    intent,
    confidence: intent === 'unknown' ? 0.5 : 0.9,
  };
}

// ─── Voice Session Manager ────────────────────────────────────────────────────

export interface VoiceSessionCallbacks {
  onTranscript: (transcript: VoiceTranscript) => void;
  onError: (error: Error) => void;
  onStateChange?: (state: 'recording' | 'processing' | 'idle') => void;
}

export class VoiceSession {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private asr: WhisperASR;
  private vad: SileroVAD;
  private audioChunks: Blob[] = [];
  private isRecording = false;

  constructor(asr: WhisperASR, vad: SileroVAD) {
    this.asr = asr;
    this.vad = vad;
  }

  async start(callbacks: VoiceSessionCallbacks): Promise<void> {
    if (this.isRecording) return;

    console.log('[EdgeAI Voice] Requesting microphone access…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    console.log('[EdgeAI Voice] Microphone access granted, tracks:', this.stream.getAudioTracks().length);

    this.audioChunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
        console.log(`[EdgeAI Voice] Audio chunk received: ${e.data.size} bytes (total chunks: ${this.audioChunks.length})`);
      }
    };

    this.mediaRecorder.onstop = async () => {
      callbacks.onStateChange?.('processing');
      try {
        console.log(`[EdgeAI Voice] Recording stopped. Processing ${this.audioChunks.length} chunks…`);

        if (this.audioChunks.length === 0) {
          callbacks.onError(new Error('No audio captured — recording was too short'));
          callbacks.onStateChange?.('idle');
          return;
        }

        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log(`[EdgeAI Voice] Audio blob: ${blob.size} bytes`);
        const arrayBuffer = await blob.arrayBuffer();
        const audio = await decodeAudioToFloat32(arrayBuffer, SAMPLE_RATE);
        console.log(`[EdgeAI Voice] Decoded audio: ${audio.length} samples (${(audio.length / SAMPLE_RATE).toFixed(1)}s)`);

        // VAD check: does this audio contain speech?
        let hasSpeech = false;
        if (this.vad.isLoaded) {
          for (const frame of splitIntoFrames(audio)) {
            if (await this.vad.isSpeech(frame)) {
              hasSpeech = true;
              break;
            }
          }
          console.log(`[EdgeAI Voice] VAD result: ${hasSpeech ? 'speech detected' : 'no speech'}`);
        } else {
          hasSpeech = true; // fallback: always transcribe if VAD not loaded
          console.log('[EdgeAI Voice] VAD not loaded, skipping — will transcribe anyway');
        }

        if (!hasSpeech) {
          callbacks.onError(new Error('No speech detected'));
          callbacks.onStateChange?.('idle');
          return;
        }

        console.log('[EdgeAI Voice] Running Whisper transcription…');
        const text = await this.asr.transcribe(audio);
        console.log(`[EdgeAI Voice] Whisper result: "${text}"`);

        if (text.length > 2) {
          callbacks.onTranscript(buildVoiceTranscript(text));
        } else {
          callbacks.onError(new Error('No speech detected'));
        }
      } catch (err) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
      callbacks.onStateChange?.('idle');
    };

    // Record in 3-second chunks to enable streaming-ish experience
    this.mediaRecorder.start(3000);
    this.isRecording = true;
    callbacks.onStateChange?.('recording');
    console.log('[EdgeAI Voice] MediaRecorder started (3s timeslice)');
  }

  stop(): void {
    if (!this.isRecording) return;
    this.mediaRecorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.isRecording = false;
  }

  get active(): boolean {
    return this.isRecording;
  }
}
