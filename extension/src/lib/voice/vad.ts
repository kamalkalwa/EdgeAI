/**
 * Voice Activity Detection — Silero VAD (ADR-009)
 *
 * Silero VAD is a ~2MB ONNX model that scores whether a 32ms audio frame
 * contains speech. VoiceSession uses it to find segment boundaries so that
 * Moonshine transcribes each utterance exactly once, and to auto-stop.
 *
 * The model is stateful: an LSTM carry-over tensor flows from one frame to
 * the next, so frames must be fed in order and the state reset per session.
 *
 * Usage:
 *   const vad = new SileroVAD();
 *   await vad.load();
 *   vad.reset();                                     // at the start of each recording
 *   const hasSpeech = await vad.isSpeech(frame512);  // consecutive frames, in order
 */

import { AutoModel, Tensor, env, type PreTrainedModel } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// Silero VAD expects 16kHz mono audio frames of 512 samples (~32ms)
const FRAME_SAMPLES = 512;
const SAMPLE_RATE = 16_000;
const STATE_SHAPE = [2, 1, 128];

// Hysteresis as in Silero's reference utils: a frame starts speech above the
// upper threshold and only ends it below the lower one, so the dips between
// syllables don't cut a sentence into pieces.
const SPEECH_START_THRESHOLD = 0.5;
const SPEECH_END_THRESHOLD = 0.35;

// The model's raw signature: { input: [1, 512], sr: int64 scalar, state: [2, 1, 128] }
//   → { output: [1, 1] speech probability, stateN: next state }
type VadInputs = { input: Tensor; sr: Tensor; state: Tensor };
type VadOutputs = { output: Tensor; stateN: Tensor };
type VadModel = (inputs: VadInputs) => Promise<VadOutputs>;

export class SileroVAD {
  private model: VadModel | null = null;
  private state: Tensor = SileroVAD.freshState();
  private speaking = false;
  private readonly sampleRate = new Tensor('int64', new BigInt64Array([BigInt(SAMPLE_RATE)]), []);
  private readonly modelId = 'onnx-community/silero-vad';

  async load(): Promise<void> {
    if (this.model) return;

    const model: PreTrainedModel = await AutoModel.from_pretrained(this.modelId, {
      // The repo ships only onnx/model.onnx — no config.json — so the config
      // is supplied inline and transformers.js wraps the graph as a raw model.
      config: { model_type: 'custom' } as never,
      dtype: 'fp32',
      device: 'wasm',   // VAD is tiny — WASM is fast enough and avoids GPU contention
      // No progress_callback on purpose: with one, transformers.js first HEADs
      // every expected file (including the absent config.json → 404) to size a
      // progress bar. The download is 2 MB; a bar is not worth a failed request.
    });
    this.model = model as unknown as VadModel;
    this.reset();
  }

  /** Clears the LSTM state. Call before feeding the first frame of a recording. */
  reset(): void {
    this.state = SileroVAD.freshState();
    this.speaking = false;
  }

  /**
   * Returns true if the audio frame likely contains speech.
   * @param audioData Float32Array at 16kHz, exactly FRAME_SAMPLES long
   */
  async isSpeech(audioData: Float32Array): Promise<boolean> {
    if (!this.model) throw new Error('VAD model not loaded');
    if (audioData.length !== FRAME_SAMPLES) {
      throw new Error(`VAD expects ${FRAME_SAMPLES} samples, got ${audioData.length}`);
    }

    const { output, stateN } = await this.model({
      input: new Tensor('float32', audioData, [1, FRAME_SAMPLES]),
      sr: this.sampleRate,
      state: this.state,
    });
    this.state = stateN;

    const probability = Number(output.data[0]);
    this.speaking = probability > (this.speaking ? SPEECH_END_THRESHOLD : SPEECH_START_THRESHOLD);
    return this.speaking;
  }

  get isLoaded(): boolean {
    return this.model !== null;
  }

  private static freshState(): Tensor {
    return new Tensor('float32', new Float32Array(STATE_SHAPE.reduce((a, b) => a * b, 1)), STATE_SHAPE);
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
