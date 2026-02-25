// Must be first — patches global indexedDB before any module import
import 'fake-indexeddb/auto';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentStore } from '../document-store';
import type { DocumentMetadata } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDoc(id: string, overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    id,
    title: `Document ${id}`,
    source: 'manual',
    sourcePath: `/notes/${id}.md`,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    charCount: 500,
    chunkCount: 3,
    ...overrides,
  };
}

let store: DocumentStore;

beforeEach(async () => {
  store = new DocumentStore();
  await store.open();
});

afterEach(async () => {
  // Close and delete the Dexie database to isolate tests
  await (store as unknown as { db: { delete(): Promise<void> } }).db.delete();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DocumentStore', () => {
  it('starts empty — listDocuments returns []', async () => {
    const docs = await store.listDocuments();
    expect(docs).toEqual([]);
  });

  it('addDocument + getDocument round-trip', async () => {
    const doc = makeDoc('doc-1');
    await store.addDocument(doc);
    const retrieved = await store.getDocument('doc-1');
    expect(retrieved).toMatchObject({ id: 'doc-1', title: 'Document doc-1' });
  });

  it('listDocuments returns all added documents', async () => {
    await store.addDocument(makeDoc('doc-a'));
    await store.addDocument(makeDoc('doc-b'));
    await store.addDocument(makeDoc('doc-c'));
    const docs = await store.listDocuments();
    expect(docs).toHaveLength(3);
    const ids = docs.map(d => d.id);
    expect(ids).toContain('doc-a');
    expect(ids).toContain('doc-b');
    expect(ids).toContain('doc-c');
  });

  it('listDocuments is ordered by updatedAt descending', async () => {
    await store.addDocument(makeDoc('old', { updatedAt: 1000 }));
    await store.addDocument(makeDoc('new', { updatedAt: 9999 }));
    await store.addDocument(makeDoc('mid', { updatedAt: 5000 }));
    const docs = await store.listDocuments();
    expect(docs[0]?.id).toBe('new');
    expect(docs[1]?.id).toBe('mid');
    expect(docs[2]?.id).toBe('old');
  });

  it('deleteDocument removes the entry', async () => {
    await store.addDocument(makeDoc('to-delete'));
    await store.deleteDocument('to-delete');
    const retrieved = await store.getDocument('to-delete');
    expect(retrieved).toBeUndefined();
    const list = await store.listDocuments();
    expect(list.map(d => d.id)).not.toContain('to-delete');
  });

  it('documentExists finds document by sourcePath', async () => {
    const doc = makeDoc('doc-src', { sourcePath: '/vault/my-note.md' });
    await store.addDocument(doc);
    const found = await store.documentExists('/vault/my-note.md');
    expect(found).toBeDefined();
    expect(found?.id).toBe('doc-src');
  });

  it('documentExists returns undefined for unknown sourcePath', async () => {
    const result = await store.documentExists('/does/not/exist.md');
    expect(result).toBeUndefined();
  });

  it('getStats sums chunkCount and charCount correctly', async () => {
    await store.addDocument(makeDoc('s1', { chunkCount: 10, charCount: 1000 }));
    await store.addDocument(makeDoc('s2', { chunkCount: 20, charCount: 2000 }));
    await store.addDocument(makeDoc('s3', { chunkCount: 5,  charCount: 500  }));
    const stats = await store.getStats();
    expect(stats.documentCount).toBe(3);
    expect(stats.totalChunks).toBe(35);
    expect(stats.totalChars).toBe(3500);
  });

  it('addDocument with same id overwrites (put semantics)', async () => {
    await store.addDocument(makeDoc('dup', { title: 'Original' }));
    await store.addDocument(makeDoc('dup', { title: 'Updated' }));
    const list = await store.listDocuments();
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe('Updated');
  });
});
