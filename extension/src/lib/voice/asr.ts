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

    // whisper-tiny.en is English-only — do NOT pass `language` or `task`
    // (those options are only valid for multilingual models like whisper-tiny).
    const result = await this.pipe(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
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
  onPartialTranscript?: (text: string) => void;
  onError: (error: Error) => void;
  onStateChange?: (state: 'recording' | 'processing' | 'idle') => void;
}

// How many consecutive silent 1s chunks before auto-stopping
const SILENCE_CHUNKS_TO_STOP = 2;
const CHUNK_TIMESLICE_MS = 1000;

export class VoiceSession {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private asr: WhisperASR;
  private vad: SileroVAD;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private isTranscribing = false;
  private lastTranscript = '';
  private silentChunkCount = 0;
  private callbacks: VoiceSessionCallbacks | null = null;

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
    console.log('[EdgeAI Voice] Microphone access granted');

    this.audioChunks = [];
    this.lastTranscript = '';
    this.silentChunkCount = 0;
    this.callbacks = callbacks;
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
        this.processChunksIncrementally();
      }
    };

    this.mediaRecorder.onstop = () => {
      // Final transcript: use whatever the last partial produced
      const finalText = this.lastTranscript;
      if (finalText.length > 2) {
        callbacks.onTranscript(buildVoiceTranscript(finalText));
      } else if (this.audioChunks.length > 0) {
        callbacks.onError(new Error('No speech detected'));
      }
      callbacks.onStateChange?.('idle');
    };

    this.mediaRecorder.start(CHUNK_TIMESLICE_MS);
    this.isRecording = true;
    callbacks.onStateChange?.('recording');
    console.log(`[EdgeAI Voice] MediaRecorder started (${CHUNK_TIMESLICE_MS}ms timeslice)`);
  }

  /**
   * Process accumulated audio chunks through Whisper incrementally.
   * Each call transcribes the full accumulated buffer and sends only
   * new text as a partial transcript.
   */
  private async processChunksIncrementally(): Promise<void> {
    // Skip if a transcription is already in progress (avoid parallel Whisper calls)
    if (this.isTranscribing || !this.callbacks) return;
    this.isTranscribing = true;

    try {
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      const audio = await decodeAudioToFloat32(arrayBuffer, SAMPLE_RATE);

      // VAD: check the latest chunk for silence to enable auto-stop
      if (this.vad.isLoaded) {
        const chunkSamples = CHUNK_TIMESLICE_MS * (SAMPLE_RATE / 1000); // 1s = 16000 samples
        const latestAudio = audio.slice(-chunkSamples);
        let chunkHasSpeech = false;
        for (const frame of splitIntoFrames(latestAudio)) {
          if (await this.vad.isSpeech(frame)) {
            chunkHasSpeech = true;
            break;
          }
        }
        if (chunkHasSpeech) {
          this.silentChunkCount = 0;
        } else {
          this.silentChunkCount++;
          console.log(`[EdgeAI Voice] Silent chunk (${this.silentChunkCount}/${SILENCE_CHUNKS_TO_STOP})`);
          if (this.silentChunkCount >= SILENCE_CHUNKS_TO_STOP && this.lastTranscript.length > 0) {
            console.log('[EdgeAI Voice] Auto-stopping after silence');
            this.stop();
            return;
          }
        }
      }

      // Transcribe the full accumulated buffer
      const text = await this.asr.transcribe(audio);
      console.log(`[EdgeAI Voice] Partial: "${text}"`);

      if (text.length > 2 && text !== this.lastTranscript) {
        this.lastTranscript = text;
        this.callbacks.onPartialTranscript?.(text);
      }
    } catch (err) {
      console.warn('[EdgeAI Voice] Incremental transcription error:', err);
    } finally {
      this.isTranscribing = false;
    }

    // If more chunks arrived while we were transcribing, process again
    if (this.isRecording && this.audioChunks.length > 0) {
      // Use a short delay to avoid tight loops
      setTimeout(() => this.processChunksIncrementally(), 100);
    }
  }

  stop(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.mediaRecorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  get active(): boolean {
    return this.isRecording;
  }
}
