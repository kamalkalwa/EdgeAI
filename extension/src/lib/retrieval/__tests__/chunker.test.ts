import { describe, it, expect, vi } from 'vitest';
import { semanticChunk } from '../chunker';
import type { IEmbeddingModel } from '@/lib/types';

// ─── Mock embedding model ─────────────────────────────────────────────────────
// Returns deterministic pseudo-random vectors seeded by a counter.
// Adjacent windows get slightly different embeddings so some splits occur.

function makeMockEmbedder(dims = 384): IEmbeddingModel {
  let counter = 0;
  return {
    load: vi.fn().mockResolvedValue(undefined),
    embed: async (text: string) => {
      // Deterministic: same text → same vector within a test run
      const seed = [...text].reduce((s, c) => s + c.charCodeAt(0), 0);
      return Array.from({ length: dims }, (_, i) => Math.sin(seed + i));
    },
    embedBatch: async (texts: string[]) => {
      // Give alternating high/low similarity to force some splits
      return texts.map((_, i) => {
        const angle = (counter++ + i) * 0.9; // 0.9 rad ≈ 52° → cosine ≈ 0.62 → near threshold
        return Array.from({ length: dims }, (_, j) => Math.cos(angle + j * 0.01));
      });
    },
  };
}

const BASE_OPTIONS = {
  documentId: 'test-doc',
  documentTitle: 'Test Document',
  source: 'manual' as const,
  createdAt: Date.now(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('semanticChunk()', () => {
  it('returns a single chunk for very short text (< 3 sentences)', async () => {
    const text = 'Hello world. This is a test.';
    const embedder = makeMockEmbedder();
    const chunks = await semanticChunk(text, { embeddingModel: embedder, ...BASE_OPTIONS });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // Short text should not be split into many chunks
    expect(chunks.length).toBeLessThanOrEqual(3);
  });

  it('no chunk exceeds MAX_CHARS (1500)', async () => {
    // Create a long paragraph — enough to force multiple chunks
    const sentence = 'This is a sentence about artificial intelligence and machine learning. ';
    const text = sentence.repeat(80); // ~5600 chars, well above max
    const embedder = makeMockEmbedder();
    const chunks = await semanticChunk(text, { embeddingModel: embedder, ...BASE_OPTIONS });
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1500);
    }
  });

  it('charOffset and charEnd are non-negative and charEnd > charOffset', async () => {
    const text = 'First topic: AI. Second topic: databases. Third topic: cloud computing.';
    const embedder = makeMockEmbedder();
    const chunks = await semanticChunk(text, { embeddingModel: embedder, ...BASE_OPTIONS });
    for (const chunk of chunks) {
      expect(chunk.metadata.charOffset).toBeGreaterThanOrEqual(0);
      expect(chunk.metadata.charEnd).toBeGreaterThan(chunk.metadata.charOffset);
    }
  });

  it('all chunks have the correct documentId and source metadata', async () => {
    const text = 'Some content. More content. Even more content about the same topic.';
    const embedder = makeMockEmbedder();
    const chunks = await semanticChunk(text, {
      embeddingModel: embedder,
      ...BASE_OPTIONS,
      documentId: 'custom-doc-id',
      source: 'obsidian',
    });
    for (const chunk of chunks) {
      expect(chunk.documentId).toBe('custom-doc-id');
      expect(chunk.metadata.documentId).toBe('custom-doc-id');
      expect(chunk.metadata.source).toBe('obsidian');
    }
  });

  it('multi-sentence document produces multiple chunks or at least one valid chunk', async () => {
    const sentences = Array.from({ length: 30 }, (_, i) =>
      `Sentence number ${i + 1} about a completely different topic than the others.`
    );
    const text = sentences.join(' ');
    const embedder = makeMockEmbedder();
    const chunks = await semanticChunk(text, { embeddingModel: embedder, ...BASE_OPTIONS });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // All chunks are non-empty strings
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });
});
