import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnDeviceSpeechSession, onDeviceSupport, installLanguage, joinResults } from '../on-device-speech';

type Result = { isFinal: boolean; 0: { transcript: string } };
const result = (transcript: string, isFinal = false): Result => ({ isFinal, 0: { transcript } });

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static available = vi.fn();
  static install = vi.fn();

  lang = '';
  continuous = false;
  interimResults = false;
  processLocally = false;
  onresult: ((e: { results: Result[] }) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startedWith: unknown = null;
  stopCalls = 0;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start(track?: unknown) {
    this.startedWith = track;
  }
  stop() {
    this.stopCalls++;
  }
  // Test helpers
  emit(...results: Result[]) {
    this.onresult?.({ results });
  }
  end() {
    this.onend?.();
  }
}

const track = { stop: vi.fn() };
const getUserMedia = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  FakeRecognition.available.mockReset();
  FakeRecognition.install.mockReset();
  track.stop.mockReset();
  getUserMedia.mockReset().mockResolvedValue({ getAudioTracks: () => [track], getTracks: () => [track] });
  vi.stubGlobal('SpeechRecognition', FakeRecognition);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function callbacks() {
  return { onPartial: vi.fn(), onFinal: vi.fn(), onError: vi.fn() };
}

async function started(cb = callbacks()) {
  const session = new OnDeviceSpeechSession('en-US');
  await session.start(cb);
  const rec = FakeRecognition.instances[0]!;
  return { session, rec, cb };
}

describe('onDeviceSupport', () => {
  it('maps Chrome availability to ready / needs-download / unsupported', async () => {
    FakeRecognition.available.mockResolvedValueOnce('available');
    expect(await onDeviceSupport('en-US')).toBe('ready');
    FakeRecognition.available.mockResolvedValueOnce('downloadable');
    expect(await onDeviceSupport('hi-IN')).toBe('needs-download');
    FakeRecognition.available.mockResolvedValueOnce('downloading');
    expect(await onDeviceSupport('hi-IN')).toBe('needs-download');
    FakeRecognition.available.mockResolvedValueOnce('unavailable');
    expect(await onDeviceSupport('ar-SA')).toBe('unsupported');
  });

  it('only ever asks about on-device recognition', async () => {
    FakeRecognition.available.mockResolvedValue('available');
    await onDeviceSupport('en-IN');
    expect(FakeRecognition.available).toHaveBeenCalledWith({ langs: ['en-IN'], processLocally: true });
  });

  it('is unsupported on browsers without the on-device API', async () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', class {});
    expect(await onDeviceSupport('en-US')).toBe('unsupported');
  });

  it('is unsupported when Chrome rejects the language tag', async () => {
    FakeRecognition.available.mockRejectedValue(new DOMException('bad tag', 'SyntaxError'));
    expect(await onDeviceSupport('not a tag')).toBe('unsupported');
  });
});

describe('installLanguage', () => {
  it('installs the on-device pack and reports failure as false', async () => {
    FakeRecognition.install.mockResolvedValueOnce(true);
    expect(await installLanguage('en-US')).toBe(true);
    expect(FakeRecognition.install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
    FakeRecognition.install.mockRejectedValueOnce(new Error('offline'));
    expect(await installLanguage('en-US')).toBe(false);
  });
});

describe('joinResults', () => {
  it('joins every result, trimming Chrome’s leading spaces', () => {
    expect(joinResults([result('Draft a reply', true), result(' say Monday works ')])).toBe('Draft a reply say Monday works');
    expect(joinResults([result('  ')])).toBe('');
  });
});

describe('OnDeviceSpeechSession', () => {
  it('records on-device from our own echo-cancelled mic track', async () => {
    const { rec } = await started();
    expect(rec.processLocally).toBe(true);
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.lang).toBe('en-US');
    expect(rec.startedWith).toBe(track);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({ echoCancellation: true, noiseSuppression: true }),
    });
  });

  it('shows words as they come and stops 2 s after the last one', async () => {
    const { rec, cb } = await started();
    rec.emit(result('What are'));
    vi.advanceTimersByTime(1500);
    rec.emit(result('What are the main points'));
    vi.advanceTimersByTime(1900);
    expect(rec.stopCalls).toBe(0);
    vi.advanceTimersByTime(100);
    expect(rec.stopCalls).toBe(1);
    expect(cb.onPartial).toHaveBeenLastCalledWith('What are the main points');

    rec.emit(result('What are the main points?', true));
    rec.end();
    expect(cb.onFinal).toHaveBeenCalledWith('What are the main points?');
    expect(track.stop).toHaveBeenCalled();
  });

  it('gives up after 5 s of silence', async () => {
    const { rec, cb } = await started();
    vi.advanceTimersByTime(5000);
    expect(rec.stopCalls).toBe(1);
    rec.end();
    expect(cb.onFinal).not.toHaveBeenCalled();
    expect(cb.onError).toHaveBeenCalledWith(new Error('No speech detected'));
  });

  it('keeps the last words when stopped by hand mid-sentence', async () => {
    const { session, rec, cb } = await started();
    rec.emit(result('Summarize this'));
    session.stop();
    session.stop();
    expect(rec.stopCalls).toBe(1);
    rec.end();
    expect(cb.onFinal).toHaveBeenCalledWith('Summarize this');
  });

  it('reports a blocked mic in words the popup sends to the mic-grant tab', async () => {
    const { rec, cb } = await started();
    rec.onerror?.({ error: 'not-allowed' });
    rec.end();
    expect(cb.onError).toHaveBeenCalledTimes(1);
    expect(cb.onError.mock.calls[0]![0].message).toMatch(/Microphone access denied/);
    expect(cb.onFinal).not.toHaveBeenCalled();
  });

  it('releases the mic when Chrome refuses to start', async () => {
    const start = vi.spyOn(FakeRecognition.prototype, 'start').mockImplementation(() => {
      throw new DOMException('already started', 'InvalidStateError');
    });
    await expect(new OnDeviceSpeechSession('en-US').start(callbacks())).rejects.toThrow('already started');
    expect(track.stop).toHaveBeenCalled();
    start.mockRestore();
  });
});
