/**
 * Vector Store — Orama (MVP) (ADR-003)
 *
 * Orama provides:
 * - BM25 full-text search (built-in)
 * - HNSW approximate nearest neighbor vector search (built-in)
 * - RRF hybrid search (built-in, we bypass and use our own for control)
 * - ~500KB bundle, TypeScript-native, no WASM cold-start
 *
 * Persistence: Orama is in-memory. We serialize to IndexedDB via raw IDB
 * and reload on startup. At >50K chunks, migrate to PGlite+pgvector.
 */

import { create, insertMultiple, search, remove, getByID, type AnyOrama } from '@orama/orama';
import type { Chunk, SearchFilters } from '@/lib/types';

// Orama schema for chunks
const CHUNK_SCHEMA = {
  id: 'string',
  documentId: 'string',
  content: 'string',
  source: 'string',
  documentTitle: 'string',
  sourcePath: 'string',
  createdAt: 'number',
  charOffset: 'number',
  charEnd: 'number',
  sectionHeading: 'string',
} as const;

type OramaChunk = {
  id: string;
  documentId: string;
  content: string;
  source: string;
  documentTitle: string;
  sourcePath: string;
  createdAt: number;
  charOffset: number;
  charEnd: number;
  sectionHeading: string;
};

const IDB_STORE_NAME = 'orama-vector-store';
const IDB_DB_NAME = 'edgeai-vector';
const IDB_VERSION = 1;

export class VectorStore {
  private db: AnyOrama | null = null;
  // id → embedding vector (384 floats) for ANN search
  private embeddings = new Map<string, number[]>();
  // id → OramaChunk (for persistence: re-populates Orama index on restart)
  private oramaChunks = new Map<string, OramaChunk>();
  private idb: IDBDatabase | null = null;

  async init(): Promise<void> {
    this.db = create({
      schema: CHUNK_SCHEMA,
      components: {
        tokenizer: {
          stemming: false,       // preserve exact technical terms
        },
      },
    });

    // Load persisted data from IndexedDB
    await this.loadFromIDB();
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async addChunks(chunks: Chunk[]): Promise<void> {
    if (!this.db) throw new Error('VectorStore not initialized');

    const newOramaChunks: OramaChunk[] = chunks.map((c) => ({
      id: c.id,
      documentId: c.documentId,
      content: c.content,
      source: c.metadata.source,
      documentTitle: c.metadata.documentTitle,
      sourcePath: c.metadata.sourcePath ?? '',
      createdAt: c.metadata.createdAt,
      charOffset: c.metadata.charOffset,
      charEnd: c.metadata.charEnd,
      sectionHeading: c.metadata.sectionHeading ?? '',
    }));

    await insertMultiple(this.db, newOramaChunks);

    // Keep in-memory maps in sync so persistToIDB has everything it needs
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const oramaChunk = newOramaChunks[i];
      if (!chunk || !oramaChunk) continue;

      this.oramaChunks.set(chunk.id, oramaChunk);

      if (chunk.embedding && chunk.embedding.length > 0) {
        this.embeddings.set(chunk.id, chunk.embedding);
      }
    }

    // Persist to IDB asynchronously (don't block indexing)
    this.persistToIDB().catch(console.error);
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    if (!this.db) return;

    // Exact match via in-memory map — no 10K limit, no fuzzy BM25 overhead
    const toDelete = [...this.oramaChunks.values()]
      .filter((c) => c.documentId === documentId)
      .map((c) => c.id);

    for (const id of toDelete) {
      await remove(this.db, id);
      this.embeddings.delete(id);
      this.oramaChunks.delete(id);
    }

    await this.persistToIDB().catch(console.error);
  }

  // ── Search ───────────────────────────────────────────────────────────────────

  async searchBm25(
    query: string,
    limit = 20,
    filters?: SearchFilters
  ): Promise<Array<Chunk & { id: string }>> {
    if (!this.db) return [];

    const where = buildOramaFilter(filters);

    const results = await search(this.db, {
      term: query,
      limit,
      ...(where ? { where } : {}),
    });

    return results.hits.map((hit) => oramaHitToChunk(hit));
  }

  async searchVector(
    queryEmbedding: number[],
    limit = 20,
    filters?: SearchFilters
  ): Promise<Array<Chunk & { id: string }>> {
    if (!this.db || this.embeddings.size === 0) return [];

    // Simple brute-force cosine similarity for MVP
    // Replace with hnswlib-wasm at >50K chunks
    const scored = await this.bruteForceANN(queryEmbedding, limit * 2, filters);

    return scored
      .slice(0, limit)
      .map(({ id }) => {
        // Direct O(1) Orama lookup — avoids the dead chunkCache that was here before
        const doc = getByID(this.db!, id) as OramaChunk | undefined;
        if (!doc) return null;
        return oramaHitToChunk({ id, document: doc });
      })
      .filter((c): c is Chunk & { id: string } => c !== null);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async bruteForceANN(
    queryEmbedding: number[],
    topK: number,
    _filters?: SearchFilters
  ): Promise<Array<{ id: string; score: number }>> {
    const scores: Array<{ id: string; score: number }> = [];

    for (const [id, emb] of this.embeddings) {
      scores.push({ id, score: cosineSimilarity(queryEmbedding, emb) });
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /** Close the raw IDB connection. Call before deleting the database in tests. */
  close(): void {
    this.idb?.close();
    this.idb = null;
  }

  // ── IDB Persistence ──────────────────────────────────────────────────────────

  private async openIDB(): Promise<IDBDatabase> {
    if (this.idb) return this.idb;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };

      req.onsuccess = (e) => {
        this.idb = (e.target as IDBOpenDBRequest).result;
        resolve(this.idb);
      };

      req.onerror = () => reject(req.error);
    });
  }

  private async persistToIDB(): Promise<void> {
    const db = await this.openIDB();
    const data = {
      embeddings: Object.fromEntries(this.embeddings),
      // Persisting OramaChunks lets us rebuild the Orama BM25 index on restart.
      // Without this, every extension restart loses all searchable text.
      oramaChunks: Object.fromEntries(this.oramaChunks),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.put(JSON.stringify(data), 'state');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async loadFromIDB(): Promise<void> {
    try {
      const db = await this.openIDB();

      const raw = await new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(IDB_STORE_NAME);
        const req = store.get('state');
        req.onsuccess = () => resolve(req.result as string | null);
        req.onerror = () => reject(req.error);
      });

      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        embeddings: Record<string, number[]>;
        oramaChunks?: Record<string, OramaChunk>;
      };

      // Restore embeddings
      for (const [id, emb] of Object.entries(parsed.embeddings)) {
        this.embeddings.set(id, emb);
      }

      // Restore Orama index from persisted OramaChunks (fixes BUG-1: blank Orama on restart)
      if (parsed.oramaChunks) {
        const chunks = Object.values(parsed.oramaChunks);
        if (chunks.length > 0) {
          await insertMultiple(this.db!, chunks);
          for (const chunk of chunks) {
            this.oramaChunks.set(chunk.id, chunk);
          }
        }
      }
    } catch (err) {
      console.warn('[VectorStore] Failed to load from IDB:', err);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function buildOramaFilter(filters?: SearchFilters): Record<string, unknown> | undefined {
  if (!filters) return undefined;

  const where: Record<string, unknown> = {};

  if (filters.sources && filters.sources.length > 0) {
    where['source'] = { in: filters.sources };
  }
  if (filters.dateFrom !== undefined) {
    where['createdAt'] = { gte: filters.dateFrom };
  }
  if (filters.dateTo !== undefined) {
    where['createdAt'] = { ...(where['createdAt'] as object ?? {}), lte: filters.dateTo };
  }

  return Object.keys(where).length > 0 ? where : undefined;
}

function oramaHitToChunk(hit: { id: string; document: unknown }): Chunk & { id: string } {
  const doc = hit.document as OramaChunk;
  return {
    id: hit.id,
    documentId: doc.documentId,
    content: doc.content,
    metadata: {
      documentId: doc.documentId,
      documentTitle: doc.documentTitle,
      source: doc.source as Chunk['metadata']['source'],
      sourcePath: doc.sourcePath || undefined,
      charOffset: doc.charOffset,
      charEnd: doc.charEnd,
      sectionHeading: doc.sectionHeading || undefined,
      createdAt: doc.createdAt,
    },
  };
}
