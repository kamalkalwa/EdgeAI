import { describe, it, expect } from 'vitest';
import { categorizeRequest, isOwnRequest, appendEntry, formatEntryUrl, type NetworkEntry } from '../network-monitor';

const EXT = 'chrome-extension://abcdefghijklmnop';

describe('isOwnRequest', () => {
  it('accepts requests initiated by the extension itself', () => {
    expect(isOwnRequest('https://huggingface.co/x', EXT, EXT)).toBe(true);
  });

  it('rejects requests from web pages, other extensions and unknown initiators', () => {
    expect(isOwnRequest('https://news.example.com/api', 'https://news.example.com', EXT)).toBe(false);
    expect(isOwnRequest('https://api.openai.com/v1', 'chrome-extension://someotherextension', EXT)).toBe(false);
    expect(isOwnRequest('https://example.com/', undefined, EXT)).toBe(false);
  });

  it('ignores loads of the extension\'s own bundled files', () => {
    expect(isOwnRequest(`${EXT}/ort/ort-wasm-simd-threaded.wasm`, EXT, EXT)).toBe(false);
  });
});

describe('categorizeRequest', () => {
  it('classifies Hugging Face weight downloads as model_download', () => {
    expect(categorizeRequest('https://huggingface.co/Xenova/bge-small-en-v1.5/resolve/main/onnx/model.onnx')).toBe('model_download');
    expect(categorizeRequest('https://cdn-lfs-us-1.huggingface.co/repos/ab/cd/params_shard_0.bin?x=1')).toBe('model_download');
    expect(categorizeRequest('https://cas-bridge.xethub.hf.co/xet-bridge-us/abc')).toBe('model_download');
  });

  it('does not let look-alike hosts pass as model downloads', () => {
    expect(categorizeRequest('https://huggingface.co.evil.example/steal')).toBe('unknown');
    expect(categorizeRequest('https://example.com/?ref=huggingface.co')).toBe('unknown');
  });

  it('reports every other host as unknown, including the model-library URL the build must never hit', () => {
    expect(categorizeRequest('https://api.openai.com/v1/chat/completions')).toBe('unknown');
    expect(categorizeRequest('https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/x.wasm')).toBe('unknown');
  });

  it('marks loads of bundled extension files as extension_internal', () => {
    expect(categorizeRequest(`${EXT}/ort/ort-wasm-simd-threaded.wasm`)).toBe('extension_internal');
  });

  it('survives malformed URLs', () => {
    expect(categorizeRequest('not a url')).toBe('unknown');
  });
});

describe('appendEntry', () => {
  const entry = (i: number): NetworkEntry => ({
    id: String(i), url: `https://huggingface.co/${i}`, method: 'GET', type: 'xmlhttprequest',
    timestamp: i, statusCode: 200, responseSize: 0, initiator: EXT, category: 'model_download',
  });

  it('keeps the log capped at 1000 entries, dropping the oldest', () => {
    const log: NetworkEntry[] = [];
    for (let i = 0; i < 1005; i++) appendEntry(log, entry(i));
    expect(log).toHaveLength(1000);
    expect(log[0]?.id).toBe('5');
    expect(log[999]?.id).toBe('1004');
  });
});

describe('formatEntryUrl', () => {
  it('shows host + path and truncates long URLs', () => {
    expect(formatEntryUrl('https://huggingface.co/Xenova/x')).toBe('huggingface.co/Xenova/x');
    expect(formatEntryUrl('https://huggingface.co/' + 'a'.repeat(100), 30)).toHaveLength(30);
  });
});
