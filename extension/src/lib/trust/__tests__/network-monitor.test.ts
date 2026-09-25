import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  categorizeRequest, formatEntryUrl, sanitizeEntries, toNetworkEntry,
  type NetworkEntry, type ResourceTimingLike,
} from '../network-monitor';
import { reportNetworkRequests } from '../request-reporter';

const ORIGIN = 1_758_000_000_000.25; // performance.timeOrigin has sub-millisecond precision
const HF = 'https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/onnx/model.onnx';

const timing = (over: Partial<ResourceTimingLike> = {}): ResourceTimingLike => ({
  name: HF, startTime: 1234.5, initiatorType: 'fetch', responseStatus: 200, ...over,
});

const entry = (i: number, over: Partial<NetworkEntry> = {}): NetworkEntry => ({
  id: `offscreen:${ORIGIN}:${i}:${HF}`, url: HF, timestamp: i, statusCode: 200,
  initiatorType: 'fetch', context: 'offscreen', category: 'model_download', ...over,
});

describe('toNetworkEntry', () => {
  it('turns a resource-timing entry into a log entry', () => {
    expect(toNetworkEntry(timing(), 'offscreen', ORIGIN)).toEqual({
      id: `offscreen:${ORIGIN}:1234.5:${HF}`,
      url: HF,
      timestamp: Math.round(ORIGIN + 1234.5),
      statusCode: 200,
      initiatorType: 'fetch',
      context: 'offscreen',
      category: 'model_download',
    });
  });

  it('logs failed and blocked requests with status 0', () => {
    // Chrome reports these with responseStatus 0; engines without the field omit it.
    expect(toNetworkEntry(timing({ responseStatus: 0 }), 'popup', ORIGIN)?.statusCode).toBe(0);
    expect(toNetworkEntry(timing({ responseStatus: undefined }), 'popup', ORIGIN)?.statusCode).toBe(0);
  });

  it('skips what never leaves the device: packaged files, blob: and data: URLs', () => {
    expect(toNetworkEntry(timing({ name: 'chrome-extension://abc/ort/ort-wasm-simd-threaded.wasm' }), 'offscreen', ORIGIN)).toBeNull();
    expect(toNetworkEntry(timing({ name: 'blob:chrome-extension://abc/0f1e' }), 'offscreen', ORIGIN)).toBeNull();
    expect(toNetworkEntry(timing({ name: 'data:text/plain,hi' }), 'offscreen', ORIGIN)).toBeNull();
  });

  it('keeps two fetches of the same URL apart, and a reloaded page apart from its last run', () => {
    const first = toNetworkEntry(timing({ startTime: 10 }), 'offscreen', ORIGIN);
    const again = toNetworkEntry(timing({ startTime: 20 }), 'offscreen', ORIGIN);
    const reloaded = toNetworkEntry(timing({ startTime: 10 }), 'offscreen', ORIGIN + 60_000);
    expect(new Set([first?.id, again?.id, reloaded?.id]).size).toBe(3);
  });

  it('fills in a missing initiator type', () => {
    expect(toNetworkEntry(timing({ initiatorType: '' }), 'popup', ORIGIN)?.initiatorType).toBe('other');
  });
});

describe('categorizeRequest', () => {
  it('counts Hugging Face and its download mirrors as model downloads', () => {
    expect(categorizeRequest(HF)).toBe('model_download');
    expect(categorizeRequest('https://cdn-lfs-us-1.huggingface.co/repos/ab/cd/params_shard_0.bin?x=1')).toBe('model_download');
    expect(categorizeRequest('https://cas-bridge.xethub.hf.co/xet-bridge-us/abc')).toBe('model_download');
  });

  it('does not let look-alike hosts pass as model downloads', () => {
    expect(categorizeRequest('https://huggingface.co.evil.example/steal')).toBe('other');
    expect(categorizeRequest('https://example.com/?ref=huggingface.co')).toBe('other');
    expect(categorizeRequest('https://nothuggingface.co/x')).toBe('other');
  });

  it('reports every other host as other, including the model-library URL the build must never hit', () => {
    expect(categorizeRequest('https://api.openai.com/v1/chat/completions')).toBe('other');
    expect(categorizeRequest('https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/x.wasm')).toBe('other');
  });

  it('survives malformed URLs', () => {
    expect(categorizeRequest('not a url')).toBe('other');
  });
});

describe('sanitizeEntries', () => {
  it('keeps well-formed entries and recomputes the category rather than trusting it', () => {
    const claimsModel = entry(1, { url: 'https://api.example.com/collect', category: 'model_download' });
    expect(sanitizeEntries([claimsModel])).toEqual([{ ...claimsModel, category: 'other' }]);
  });

  it('drops malformed entries and anything that is not a list', () => {
    expect(sanitizeEntries(undefined)).toEqual([]);
    expect(sanitizeEntries({ 0: entry(1) })).toEqual([]);
    expect(sanitizeEntries([
      null,
      42,
      entry(1, { url: 'chrome-extension://abc/x.js' }),
      { ...entry(2), statusCode: '200' },
      { ...entry(3), id: undefined },
    ])).toEqual([]);
  });

  it('keeps only the known fields', () => {
    const [kept] = sanitizeEntries([{ ...entry(1), extra: 'x' }]);
    expect(Object.keys(kept ?? {}).sort()).toEqual(
      ['category', 'context', 'id', 'initiatorType', 'statusCode', 'timestamp', 'url'],
    );
  });
});

describe('formatEntryUrl', () => {
  it('splits host and path from the file name, so a row can shorten the path and keep the name', () => {
    expect(formatEntryUrl('https://huggingface.co/mlc-ai/Phi/resolve/main/params_shard_65.bin'))
      .toEqual({ path: 'huggingface.co/mlc-ai/Phi/resolve/main/', file: 'params_shard_65.bin' });
    expect(formatEntryUrl('https://example.com/search?q=local+ai'))
      .toEqual({ path: 'example.com/', file: 'search?q=local+ai' });
    expect(formatEntryUrl('https://example.com/')).toEqual({ path: 'example.com/', file: '' });
    expect(formatEntryUrl('not a url')).toEqual({ path: '', file: 'not a url' });
  });
});

describe('reportNetworkRequests', () => {
  type Callback = (list: { getEntries: () => ResourceTimingLike[] }) => void;
  let observed: { callback: Callback; options: unknown } | undefined;

  class FakeObserver {
    constructor(callback: Callback) { observed = { callback, options: undefined }; }
    observe(options: unknown) { observed!.options = options; }
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    observed = undefined;
  });

  it('watches resource timing, including requests made before it started', () => {
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    reportNetworkRequests('popup', () => {});
    expect(observed?.options).toEqual({ type: 'resource', buffered: true });
  });

  it('delivers the network requests of each batch, tagged with the page that made them', () => {
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    const deliver = vi.fn();
    reportNetworkRequests('offscreen', deliver);

    observed!.callback({ getEntries: () => [timing(), timing({ name: 'chrome-extension://abc/assets/popup.js' })] });
    expect(deliver).toHaveBeenCalledTimes(1);
    const [delivered] = deliver.mock.calls[0] as [NetworkEntry[]];
    expect(delivered.map((e) => [e.url, e.context])).toEqual([[HF, 'offscreen']]);
  });

  it('stays quiet when a batch holds only packaged files', () => {
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    const deliver = vi.fn();
    reportNetworkRequests('popup', deliver);
    observed!.callback({ getEntries: () => [timing({ name: 'chrome-extension://abc/assets/popup.js' })] });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('does nothing where PerformanceObserver does not exist', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    expect(() => reportNetworkRequests('popup', () => {})).not.toThrow();
  });
});
