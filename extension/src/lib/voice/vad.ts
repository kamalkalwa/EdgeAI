/**
 * Voice Activity Detection — Silero VAD (ADR-009)
 *
 * Silero VAD is a ~1MB ONNX model that detects whether audio frames
 * contain speech. Running it before Whisper reduces Whisper calls by 60-80%.
 *
 * Usage:
 *   const vad = new SileroVAD();
 *   await vad.load();
 *   const hasSpeech = await vad.isSpeech(float32AudioFrame);
 */

import { pipeline, type AudioClassificationPipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// transformers.js v3 pipeline() has deeply polymorphic overloads that cause TS2590.
// Casting to a simple signature bypasses overload resolution entirely.
type SimplePipeline = (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
const callPipeline = pipeline as unknown as SimplePipeline;

// Silero VAD expects 16kHz mono audio frames of 512 samples (~32ms)
const FRAME_SAMPLES = 512;
const SAMPLE_RATE = 16_000;
const SPEECH_THRESHOLD = 0.5;   // probability above this = speech

export class SileroVAD {
  private pipe: AudioClassificationPipeline | null = null;
  private readonly modelId = 'Xenova/silero-vad';

  async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) return;

    this.pipe = (await callPipeline('audio-classification', this.modelId, {
      progress_callback: onProgress
        ? (info: Record<string, unknown>) => {
            if (typeof info['progress'] === 'number') onProgress(Math.round(info['progress']));
          }
        : undefined,
      dtype: 'fp32',
      device: 'wasm',   // VAD is tiny — WASM is fast enough and avoids GPU contention
    })) as AudioClassificationPipeline;
  }

  /**
   * Returns true if the audio frame likely contains speech.
   * @param audioData Float32Array at 16kHz, exactly FRAME_SAMPLES long
   */
  async isSpeech(audioData: Float32Array): Promise<boolean> {
    if (!this.pipe) throw new Error('VAD model not loaded');
    if (audioData.length !== FRAME_SAMPLES) {
      throw new Error(`VAD expects ${FRAME_SAMPLES} samples, got ${audioData.length}`);
    }

    // Cast the pipe call to bypass AudioClassificationPipeline's strict overloads.
    // The model returns [{ label: 'speech', score: 0.9 }, { label: 'non-speech', score: 0.1 }].
    type VADResult = { label: string; score: number };
    const callPipe = this.pipe as unknown as (audio: Float32Array) => Promise<VADResult[]>;
    const result = await callPipe(audioData);
    const speechResult = result.find((r) => r.label === 'speech');
    return (speechResult?.score ?? 0) > SPEECH_THRESHOLD;
  }

  get isLoaded(): boolean {
    return this.pipe !== null;
  }
}

// ─── Audio Frame Extraction ───────────────────────────────────────────────────

/**
 * Split a Float32Array of audio into FRAME_SAMPLES-sized chunks.
 * Used to process a MediaRecorder chunk through VAD.
 */
export function* splitIntoFrames(
  audio: Float32Array,
  frameSamples = FRAME_SAMPLES
): Generator<Float32Array> {
  for (let offset = 0; offset + frameSamples <= audio.length; offset += frameSamples) {
    yield audio.slice(offset, offset + frameSamples);
  }
}

/**
 * Decodes raw audio ArrayBuffer (from MediaRecorder) to 16kHz mono Float32.
 */
export async function decodeAudioToFloat32(
  audioBuffer: ArrayBuffer,
  targetSampleRate = SAMPLE_RATE
): Promise<Float32Array> {
  const audioCtx = new OfflineAudioContext(1, 1, targetSampleRate);
  const decoded = await audioCtx.decodeAudioData(audioBuffer.slice(0));

  // Resample if needed
  if (decoded.sampleRate === targetSampleRate) {
    return decoded.getChannelData(0);
  }

  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate
  );
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0);

  const resampled = await offlineCtx.startRendering();
  return resampled.getChannelData(0);
}
