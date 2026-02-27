/**
 * Automatic Speech Recognition — Moonshine (ADR-009)
 *
 * Uses transformers.js moonshine-tiny (ONNX) for transcription.
 * Moonshine's compute scales proportionally with audio length (no 30s padding).
 * WebGPU acceleration where available, WASM fallback.
 *
 * Pipeline:
 *   getUserMedia → audio chunks → VAD filter → Moonshine → transcript
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

export class MoonshineASR {
  private pipe: AutomaticSpeechRecognitionPipeline | null = null;
  private readonly modelId = 'onnx-community/moonshine-tiny-ONNX';

  async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) return;

    this.pipe = (await callPipeline('automatic-speech-recognition', this.modelId, {
      progress_callback: onProgress
        ? (info: Record<string, unknown>) => {
            if (typeof info['progress'] === 'number') onProgress(Math.round(info['progress']));
          }
        : undefined,
      // Moonshine is encoder-decoder — encoder needs fp32 for accuracy,
      // decoder can be quantized. Known issues with fp16/q4f16 decoder.
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: navigator.gpu ? 'q4' : 'q8',
      },
      device: navigator.gpu ? 'webgpu' : 'wasm',
    })) as AutomaticSpeechRecognitionPipeline;
  }

  /**
   * Transcribe a Float32Array of 16kHz mono audio.
   */
  async transcribe(audio: Float32Array): Promise<string> {
    if (!this.pipe) throw new Error('ASR model not loaded');

    // Moonshine scales proportionally with audio length — no chunk/stride options needed.
    const result = await this.pipe(audio);

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

// ─── VAD-Gated Segment Transcription ─────────────────────────────────────────
// Modeled after the official Moonshine web demo: VAD detects speech segments,
// each segment is transcribed exactly once (zero flickering). Text is append-only.

const CHUNK_TIMESLICE_MS = 250;

// VAD state machine timing (from Moonshine demo constants)
const VAD_CHECK_INTERVAL_MS = 250;
const MIN_SILENCE_DURATION_MS = 400;
const SPEECH_PAD_SAMPLES = Math.round(80 * (SAMPLE_RATE / 1000)); // 80ms = 1280 samples
const MIN_SPEECH_DURATION_SAMPLES = 4000; // 250ms minimum speech
const MAX_SEGMENT_SAMPLES = 30 * SAMPLE_RATE; // 30s max segment

// Auto-stop timing
const NO_SPEECH_TIMEOUT_MS = 3500;
const POST_SEGMENT_SILENCE_MS = 2000;

// Long-speech feedback: emit periodic partial every 3s for segments > 5s
const LONG_SPEECH_PARTIAL_MS = 3000;
const LONG_SPEECH_THRESHOLD_MS = 5000;

type VoiceState = 'waiting' | 'speech' | 'silence' | 'transcribing' | 'stopped';

export class VoiceSession {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private asr: MoonshineASR;
  private vad: SileroVAD;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private callbacks: VoiceSessionCallbacks | null = null;
  private processTimer: ReturnType<typeof setInterval> | null = null;

  // State machine
  private state: VoiceState = 'stopped';
  private isProcessing = false;

  // Segment tracking
  private completedSegments: string[] = [];
  private speechStartSample = 0;
  private lastVadCheckSample = 0;

  // Timing
  private silenceStartedAt = 0;
  private sessionStartedAt = 0;
  private waitingSince = 0;
  private lastLongSpeechPartialAt = 0;

  constructor(asr: MoonshineASR, vad: SileroVAD) {
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

    // Reset all state
    this.audioChunks = [];
    this.callbacks = callbacks;
    this.completedSegments = [];
    this.speechStartSample = 0;
    this.lastVadCheckSample = 0;
    this.silenceStartedAt = 0;
    this.isProcessing = false;
    this.lastLongSpeechPartialAt = 0;

    const now = Date.now();
    this.sessionStartedAt = now;
    this.waitingSince = now;
    this.state = 'waiting';

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    // Just buffer chunks — processing happens on the interval timer
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.audioChunks.push(e.data);
      }
    };

    // Final transcription on stop
    this.mediaRecorder.onstop = () => {
      this.doFinalTranscription();
    };

    this.mediaRecorder.start(CHUNK_TIMESLICE_MS);
    this.isRecording = true;
    callbacks.onStateChange?.('recording');
    console.log(`[EdgeAI Voice] Recording started (${CHUNK_TIMESLICE_MS}ms chunks, ${VAD_CHECK_INTERVAL_MS}ms VAD interval)`);

    // VAD-driven processing every 250ms
    this.processTimer = setInterval(() => {
      if (this.isRecording && this.audioChunks.length > 0) {
        this.processCycle();
      }
    }, VAD_CHECK_INTERVAL_MS);
  }

  /**
   * Runs every 250ms. Decodes audio, runs VAD on new frames,
   * drives the state machine. Transcription only happens when
   * a segment completes (silence detected) — not every cycle.
   */
  private async processCycle(): Promise<void> {
    if (this.isProcessing || this.state === 'stopped' || this.state === 'transcribing') return;
    if (this.audioChunks.length === 0) return;
    this.isProcessing = true;

    try {
      // ── Step 1: Decode full accumulated blob ──
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();
      const audio = await decodeAudioToFloat32(arrayBuffer, SAMPLE_RATE);

      // ── Step 2: VAD on new audio since last check ──
      const startSample = Math.max(0, this.lastVadCheckSample);
      const newAudio = audio.slice(startSample);
      this.lastVadCheckSample = audio.length;

      let hasSpeech = false;

      if (this.vad.isLoaded && newAudio.length > 0) {
        for (const frame of splitIntoFrames(newAudio)) {
          if (await this.vad.isSpeech(frame)) {
            hasSpeech = true;
            break;
          }
        }
      } else if (!this.vad.isLoaded) {
        // VAD not loaded — treat all audio as speech (user must manually stop)
        hasSpeech = true;
      }

      // ── Step 3: State machine transitions ──
      const now = Date.now();

      switch (this.state) {
        case 'waiting': {
          if (hasSpeech) {
            this.state = 'speech';
            this.speechStartSample = Math.max(0, startSample - SPEECH_PAD_SAMPLES);
            this.silenceStartedAt = 0;
            this.lastLongSpeechPartialAt = now;
            console.log(`[EdgeAI Voice] Speech started at sample ${this.speechStartSample}`);
          } else {
            // Check auto-stop timeouts
            const hasSegments = this.completedSegments.length > 0;
            const timeout = hasSegments ? POST_SEGMENT_SILENCE_MS : NO_SPEECH_TIMEOUT_MS;
            if (now - this.waitingSince >= timeout) {
              if (hasSegments) {
                console.log('[EdgeAI Voice] Auto-stop: silence after completed segments');
              } else {
                console.log('[EdgeAI Voice] Auto-stop: no speech detected');
                this.callbacks?.onError(new Error('No speech detected'));
              }
              this.stop();
            }
          }
          break;
        }

        case 'speech': {
          if (!hasSpeech) {
            this.state = 'silence';
            this.silenceStartedAt = now;
          } else {
            // Check max segment duration
            const segmentSamples = audio.length - this.speechStartSample;
            if (segmentSamples >= MAX_SEGMENT_SAMPLES) {
              console.log('[EdgeAI Voice] Max segment duration, force-transcribing');
              await this.transcribeSegment(audio, this.speechStartSample, audio.length);
              break;
            }

            // Long-speech periodic partial (every 3s for segments > 5s)
            const speechDurationMs = (segmentSamples / SAMPLE_RATE) * 1000;
            if (
              speechDurationMs > LONG_SPEECH_THRESHOLD_MS &&
              now - this.lastLongSpeechPartialAt >= LONG_SPEECH_PARTIAL_MS
            ) {
              this.lastLongSpeechPartialAt = now;
              await this.emitLongSpeechPartial(audio, this.speechStartSample, audio.length);
            }
          }
          break;
        }

        case 'silence': {
          if (hasSpeech) {
            // Speech resumed — false alarm
            this.state = 'speech';
            this.silenceStartedAt = 0;
          } else if (now - this.silenceStartedAt >= MIN_SILENCE_DURATION_MS) {
            // Segment complete — silence threshold met
            // Segment end ≈ where silence started (exclude trailing silence)
            const silenceSamples = Math.round(((now - this.silenceStartedAt) / 1000) * SAMPLE_RATE);
            const segmentEnd = Math.max(
              this.speechStartSample + MIN_SPEECH_DURATION_SAMPLES,
              audio.length - silenceSamples
            );
            await this.transcribeSegment(audio, this.speechStartSample, segmentEnd);
          }
          break;
        }
      }
    } catch (err) {
      console.warn('[EdgeAI Voice] Process cycle error:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Extract a segment from decoded audio and transcribe it exactly once.
   * The result is appended to completedSegments (append-only, no flickering).
   */
  private async transcribeSegment(
    audio: Float32Array,
    startSample: number,
    endSample: number
  ): Promise<void> {
    this.state = 'transcribing';

    const start = Math.max(0, startSample);
    const end = Math.min(audio.length, endSample);
    const segmentAudio = audio.slice(start, end);

    if (segmentAudio.length < MIN_SPEECH_DURATION_SAMPLES) {
      console.log(`[EdgeAI Voice] Segment too short (${segmentAudio.length} samples), skipping`);
      this.transitionToWaiting();
      return;
    }

    const durationS = (segmentAudio.length / SAMPLE_RATE).toFixed(1);
    console.log(`[EdgeAI Voice] Transcribing segment (${durationS}s)…`);

    try {
      const text = (await this.asr.transcribe(segmentAudio)).trim();

      if (text.length > 2) {
        this.completedSegments.push(text);
        const fullText = this.completedSegments.join(' ');
        console.log(`[EdgeAI Voice] Segment: "${text}" | Full: "${fullText}"`);
        this.callbacks?.onPartialTranscript?.(fullText);
      } else {
        console.log('[EdgeAI Voice] Segment transcription empty, skipping');
      }
    } catch (err) {
      console.warn('[EdgeAI Voice] Segment transcription error:', err);
    }

    this.transitionToWaiting();
  }

  /**
   * For long unbroken speech (>5s), transcribe in-progress audio every 3s
   * so the user sees feedback. Only the current segment may shift slightly —
   * all completed segments remain stable.
   */
  private async emitLongSpeechPartial(
    audio: Float32Array,
    startSample: number,
    endSample: number
  ): Promise<void> {
    const segmentAudio = audio.slice(startSample, endSample);
    const toTranscribe = segmentAudio.length > MAX_SEGMENT_SAMPLES
      ? segmentAudio.slice(-MAX_SEGMENT_SAMPLES)
      : segmentAudio;

    try {
      const text = (await this.asr.transcribe(toTranscribe)).trim();
      if (text.length > 2) {
        const fullText = this.completedSegments.length > 0
          ? this.completedSegments.join(' ') + ' ' + text
          : text;
        console.log(`[EdgeAI Voice] Long-speech partial: "${text}"`);
        this.callbacks?.onPartialTranscript?.(fullText);
      }
    } catch (err) {
      console.warn('[EdgeAI Voice] Long-speech partial error:', err);
    }
  }

  private transitionToWaiting(): void {
    this.state = 'waiting';
    this.waitingSince = Date.now();
    this.speechStartSample = 0;
    this.silenceStartedAt = 0;
    this.lastLongSpeechPartialAt = 0;
  }

  /**
   * Called when MediaRecorder stops. Transcribes any remaining in-progress
   * audio, then emits the final definitive result.
   */
  private async doFinalTranscription(): Promise<void> {
    if (!this.callbacks) return;
    this.callbacks.onStateChange?.('processing');

    try {
      // If there's pending speech audio (stopped mid-speech), transcribe it
      if (this.audioChunks.length > 0 && this.speechStartSample > 0) {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const audio = await decodeAudioToFloat32(arrayBuffer, SAMPLE_RATE);

        if (audio.length > this.speechStartSample) {
          const remaining = audio.slice(this.speechStartSample);
          if (remaining.length >= MIN_SPEECH_DURATION_SAMPLES) {
            const toTranscribe = remaining.length > MAX_SEGMENT_SAMPLES
              ? remaining.slice(-MAX_SEGMENT_SAMPLES)
              : remaining;
            const text = (await this.asr.transcribe(toTranscribe)).trim();
            if (text.length > 2) {
              this.completedSegments.push(text);
            }
          }
        }
      }

      // If no completed segments but we have audio, try transcribing all as last resort
      if (this.completedSegments.length === 0 && this.audioChunks.length > 0) {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        const audio = await decodeAudioToFloat32(arrayBuffer, SAMPLE_RATE);

        if (audio.length >= MIN_SPEECH_DURATION_SAMPLES) {
          const toTranscribe = audio.length > MAX_SEGMENT_SAMPLES
            ? audio.slice(-MAX_SEGMENT_SAMPLES)
            : audio;
          const text = (await this.asr.transcribe(toTranscribe)).trim();
          if (text.length > 2) {
            this.completedSegments.push(text);
          }
        }
      }

      // Emit final result
      const finalText = this.completedSegments.join(' ').trim();

      if (finalText.length > 2) {
        this.callbacks.onTranscript(buildVoiceTranscript(finalText));
      } else {
        this.callbacks.onError(new Error('No speech detected'));
      }
    } catch (err) {
      console.warn('[EdgeAI Voice] Final transcription error:', err);
      // Fallback: use whatever segments we already have
      const fallback = this.completedSegments.join(' ').trim();
      if (fallback.length > 2) {
        this.callbacks.onTranscript(buildVoiceTranscript(fallback));
      } else {
        this.callbacks.onError(new Error('No speech detected'));
      }
    } finally {
      this.callbacks?.onStateChange?.('idle');
    }
  }

  stop(): void {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.state = 'stopped';

    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
    this.mediaRecorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  get active(): boolean {
    return this.isRecording;
  }
}
