import { describe, it, expect } from 'vitest';
import { sanitizeAuditEntries, type AuditEntry } from '../audit-log';

const chat: AuditEntry = {
  id: 'r1',
  timestamp: 1_758_000_000_000,
  type: 'chat_query',
  query: 'What did the article say about WebGPU?',
  retrievedChunks: [{ documentTitle: 'Test article', source: 'webpage', score: 0.82 }],
  responsePreview: 'It said a small model runs on an ordinary laptop.',
};

describe('sanitizeAuditEntries', () => {
  it('keeps well-formed entries of every type', () => {
    const entries: AuditEntry[] = [
      chat,
      { id: 's1', timestamp: 2, type: 'search', query: 'webgpu', retrievedChunks: [] },
      { id: 'i1', timestamp: 3, type: 'document_index', documentTitle: 'Test article' },
      { id: 'd1', timestamp: 4, type: 'document_delete', documentTitle: 'Test article' },
    ];
    expect(sanitizeAuditEntries(entries)).toEqual(entries);
  });

  it('drops malformed entries and anything that is not a list', () => {
    expect(sanitizeAuditEntries(chat)).toEqual([]);
    expect(sanitizeAuditEntries(undefined)).toEqual([]);
    expect(sanitizeAuditEntries([
      null,
      'chat',
      { ...chat, id: 7 },
      { ...chat, timestamp: '2026-09-25' },
      { ...chat, type: 'page_view' },
    ])).toEqual([]);
  });

  it('keeps only the known fields, and only retrieved passages the panel can show', () => {
    const [kept] = sanitizeAuditEntries([{
      ...chat,
      query: 42,
      extra: 'not logged',
      retrievedChunks: [...chat.retrievedChunks!, { documentTitle: 'No score', source: 'pdf' }, null],
    }]);
    expect(kept).toEqual({
      id: 'r1', timestamp: chat.timestamp, type: 'chat_query',
      retrievedChunks: chat.retrievedChunks, responsePreview: chat.responsePreview,
    });
  });
});
