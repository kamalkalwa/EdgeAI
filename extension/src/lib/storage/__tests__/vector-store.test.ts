// Must be first — patches global indexedDB before any module import
import 'fake-indexeddb/auto';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStore, cosineSimilarity } from '../vector-store';
import type { Chunk } from '@/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChunk(id: string, documentId: string, content: string, embedding?: number[]): Chunk {
  return {
    id,
    documentId,
    content,
    embedding: embedding ?? Array.from({ length: 384 }, () => Math.random()),
    metadata: {
      documentId,
      documentTitle: `Doc ${documentId}`,
      source: 'manual',
      charOffset: 0,
      charEnd: content.length,
      createdAt: Date.now(),
    },
  };
}

/** Delete the IDB database used by VectorStore between tests for isolation */
async function deleteVectorIDB(store: VectorStore): Promise<void> {
  store.close(); // close open connection so deleteDatabase isn't blocked
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('edgeai-vector');
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve(); // best-effort
    req.onblocked = () => resolve(); // shouldn't happen after close()
  });
}

// ─── cosineSimilarity (pure) ─────────────────────────────────────────────────

describe('cosineSimilarity()', () => {
  it('identical vectors → 1', () => {
    const v = [1, 0, 0, 1];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('orthogonal vectors → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('opposite vectors → -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('zero vector → 0 (no division by zero)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('mismatched lengths → 0', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
});

// ─── VectorStore integration ──────────────────────────────────────────────────

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(async () => {
    store = new VectorStore();
    await store.init();
  });

  afterEach(async () => {
    await deleteVectorIDB(store);
  });

  it('starts empty — searchBm25 returns []', async () => {
    const results = await store.searchBm25('machine learning');
    expect(results).toEqual([]);
  });

  it('starts empty — searchVector returns []', async () => {
    const embedding = Array.from({ length: 384 }, () => 0.1);
    const results = await store.searchVector(embedding);
    expect(results).toEqual([]);
  });

  it('addChunks — BM25 search finds added content', async () => {
    const chunk = makeChunk('c1', 'doc1', 'Transformer architecture and attention mechanisms');
    await store.addChunks([chunk]);

    const results = await store.searchBm25('transformer attention');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe('c1');
    expect(results[0]?.content).toBe(chunk.content);
  });

  it('addChunks — vector search finds semantically similar content', async () => {
    // Use a known embedding for the chunk
    const targetEmbedding = Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0));
    const chunk = makeChunk('c2', 'doc1', 'Neural network inference', targetEmbedding);
    await store.addChunks([chunk]);

    // Query with the same embedding — cosine similarity = 1
    const results = await store.searchVector(targetEmbedding);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe('c2');
  });

  it('deleteByDocumentId — removes all chunks for that document', async () => {
    const c1 = makeChunk('c3', 'doc-to-delete', 'Content A');
    const c2 = makeChunk('c4', 'doc-to-delete', 'Content B');
    const c3 = makeChunk('c5', 'doc-keep', 'Content C keep this');
    await store.addChunks([c1, c2, c3]);

    await store.deleteByDocumentId('doc-to-delete');

    const all = await store.searchBm25('Content');
    const ids = all.map(r => r.id);
    expect(ids).not.toContain('c3');
    expect(ids).not.toContain('c4');
    expect(ids).toContain('c5');
  });

  it('persist + reload round-trip — data survives simulated restart', async () => {
    const embedding = Array.from({ length: 384 }, (_, i) => (i === 1 ? 1 : 0));
    const chunk = makeChunk('c6', 'doc-persist', 'Persistent knowledge about quarterly results', embedding);
    await store.addChunks([chunk]);

    // Simulate extension restart: create a fresh VectorStore instance
    // It will call loadFromIDB() which should restore both Orama index + embeddings
    const store2 = new VectorStore();
    await store2.init();

    const bm25 = await store2.searchBm25('quarterly results');
    expect(bm25.length).toBeGreaterThan(0);
    expect(bm25[0]?.id).toBe('c6');

    const vector = await store2.searchVector(embedding);
    expect(vector.length).toBeGreaterThan(0);
    expect(vector[0]?.id).toBe('c6');

    store2.close(); // close before afterEach runs deleteVectorIDB
  });

  it('addChunks without embeddings — BM25 works, vector search skips those chunks', async () => {
    const chunk: Chunk = {
      id: 'c7',
      documentId: 'doc-no-embed',
      content: 'Chunk without embedding data',
      // embedding intentionally omitted
      metadata: {
        documentId: 'doc-no-embed',
        documentTitle: 'No Embed Doc',
        source: 'manual',
        charOffset: 0,
        charEnd: 30,
        createdAt: Date.now(),
      },
    };
    await store.addChunks([chunk]);

    const bm25 = await store.searchBm25('embedding data');
    expect(bm25.length).toBeGreaterThan(0);

    // Vector search with a non-zero query embedding — won't match since no embedding stored
    const queryVec = Array.from({ length: 384 }, () => 0.5);
    const vector = await store.searchVector(queryVec);
    expect(vector.every(r => r.id !== 'c7')).toBe(true);
  });
});
