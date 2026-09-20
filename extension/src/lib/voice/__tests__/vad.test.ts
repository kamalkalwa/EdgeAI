import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake Silero graph: the "probability" is the first sample of the frame, and
// the state counts the frames it has seen so carry-over can be asserted.
type FakeTensor = { type: string; data: ArrayLike<number | bigint>; dims: number[] };
const calls: Array<{ input: FakeTensor; sr: FakeTensor; state: FakeTensor }> = [];
const callAt = (i: number) => calls[i]!;
vi.mock('@huggingface/transformers', () => {
  class Tensor {
    constructor(public type: string, public data: ArrayLike<number | bigint>, public dims: number[]) {}
  }
  const model = async (inputs: { input: Tensor; sr: Tensor; state: Tensor }) => {
    calls.push(inputs);
    const seen = Number(inputs.state.data[0]) + 1;
    return {
      output: new Tensor('float32', new Float32Array([Number(inputs.input.data[0])]), [1, 1]),
      stateN: new Tensor('float32', new Float32Array([seen]), inputs.state.dims),
    };
  };
  return {
    Tensor,
    env: {},
    AutoModel: { from_pretrained: vi.fn(async () => model) },
  };
});

import { AutoModel } from '@huggingface/transformers';
import { SileroVAD, splitIntoFrames } from '../vad';

const frame = (probability: number): Float32Array => {
  const f = new Float32Array(512);
  f[0] = probability;
  return f;
};

describe('SileroVAD', () => {
  let vad: SileroVAD;

  beforeEach(async () => {
    calls.length = 0;
    vad = new SileroVAD();
    await vad.load();
  });

  it('loads the raw graph with an inline config and no progress callback', () => {
    const [modelId, options] = vi.mocked(AutoModel.from_pretrained).mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(modelId).toBe('onnx-community/silero-vad');
    expect(options.config).toEqual({ model_type: 'custom' });
    expect(options.device).toBe('wasm');
    expect(options).not.toHaveProperty('progress_callback');
    expect(vad.isLoaded).toBe(true);
  });

  it('applies hysteresis: enters speech above 0.5, leaves it below 0.35', async () => {
    expect(await vad.isSpeech(frame(0.4))).toBe(false);   // not speaking, below start threshold
    expect(await vad.isSpeech(frame(0.6))).toBe(true);    // starts
    expect(await vad.isSpeech(frame(0.4))).toBe(true);    // dip between syllables keeps speech
    expect(await vad.isSpeech(frame(0.3))).toBe(false);   // ends
    expect(await vad.isSpeech(frame(0.4))).toBe(false);   // needs 0.5 again to restart
  });

  it('feeds the returned state into the next frame and clears it on reset', async () => {
    await vad.isSpeech(frame(0));
    await vad.isSpeech(frame(0));
    expect(Number(callAt(1).state.data[0])).toBe(1);

    vad.reset();
    await vad.isSpeech(frame(0.6));
    expect(Number(callAt(2).state.data[0])).toBe(0);
    expect(await vad.isSpeech(frame(0.4))).toBe(true);
    vad.reset();
    expect(await vad.isSpeech(frame(0.4))).toBe(false);   // reset also forgets "speaking"
  });

  it('rejects frames that are not 512 samples', async () => {
    await expect(vad.isSpeech(new Float32Array(480))).rejects.toThrow('512');
  });

  it('passes the sample rate as an int64 scalar', async () => {
    await vad.isSpeech(frame(0));
    const sr = callAt(0).sr;
    expect(sr.type).toBe('int64');
    expect(sr.data[0]).toBe(16000n);
    expect(sr.dims).toEqual([]);
  });
});

describe('splitIntoFrames', () => {
  it('yields whole 512-sample frames and drops the remainder', () => {
    const frames = [...splitIntoFrames(new Float32Array(512 * 3 + 100))];
    expect(frames).toHaveLength(3);
    expect(frames.every((f) => f.length === 512)).toBe(true);
  });
});
