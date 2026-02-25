/**
 * Semantic Chunker (ADR-004)
 *
 * Algorithm:
 * 1. Split to sentences via compromise.js (handles abbreviations, quotes, etc.)
 * 2. Group into windows of 3 sentences
 * 3. Embed each window with bge-small-en-v1.5 (~3ms/sentence)
 * 4. Compute cosine similarity between adjacent windows
 * 5. Cut where similarity < SPLIT_THRESHOLD or chunk > MAX_CHARS
 * 6. Apply 15% overlap: last 2 sentences of chunk N → start of chunk N+1
 * 7. Tag each chunk with metadata (source, page, section, char offset)
 */

import nlp from 'compromise';
import type { Chunk, ChunkMetadata, DocumentSource, IEmbeddingModel } from '@/lib/types';
import { nanoid } from '@/lib/utils';

const SPLIT_THRESHOLD = 0.6;   // cosine sim below this = new topic → split
const MAX_CHARS = 1500;        // hard cap per chunk
const WINDOW_SIZE = 3;         // sentences per embedding window
const OVERLAP_SENTENCES = 2;   // sentences from end of chunk N to start of N+1

interface ChunkerOptions {
  embeddingModel: IEmbeddingModel;
  documentId: string;
  documentTitle: string;
  source: DocumentSource;
  sourcePath?: string;
  createdAt: number;
}

export async function semanticChunk(
  text: string,
  options: ChunkerOptions
): Promise<Chunk[]> {
  const { embeddingModel, documentId, documentTitle, source, sourcePath, createdAt } = options;

  // ── 1. Split to sentences ─────────────────────────────────────────────────
  const sentences = splitToSentences(text);
  if (sentences.length === 0) return [];
  if (sentences.length <= WINDOW_SIZE) {
    // Short document — single chunk
    return [makeChunk(text, 0, text.length, options, 0)];
  }

  // ── 2. Build windows of WINDOW_SIZE sentences ─────────────────────────────
  const windows: string[] = [];
  for (let i = 0; i <= sentences.length - WINDOW_SIZE; i++) {
    windows.push(sentences.slice(i, i + WINDOW_SIZE).join(' '));
  }

  // ── 3. Embed all windows in batch ─────────────────────────────────────────
  const embeddings = await embeddingModel.embedBatch(windows);

  // ── 4. Compute cosine similarities between adjacent windows ───────────────
  const similarities: number[] = [];
  for (let i = 0; i < embeddings.length - 1; i++) {
    const emb = embeddings[i];
    const nextEmb = embeddings[i + 1];
    if (emb && nextEmb) {
      similarities.push(cosineSimilarity(emb, nextEmb));
    }
  }

  // ── 5. Find split points ──────────────────────────────────────────────────
  const splitPoints = new Set<number>([0]);

  let currentChunkStart = 0;
  let currentLength = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i] ?? '';
    currentLength += sentence.length + 1;

    const isLowSimilarity = i < similarities.length && (similarities[i] ?? 1) < SPLIT_THRESHOLD;
    const isTooLong = currentLength > MAX_CHARS;

    if ((isLowSimilarity || isTooLong) && i > currentChunkStart) {
      splitPoints.add(i);
      currentChunkStart = i;
      currentLength = sentence.length + 1;
    }
  }

  // ── 6. Build chunks from split points with 15% overlap ───────────────────
  const sortedSplits = [...splitPoints].sort((a, b) => a - b);
  const chunks: Chunk[] = [];

  for (let si = 0; si < sortedSplits.length; si++) {
    const start = sortedSplits[si] ?? 0;
    const end = si + 1 < sortedSplits.length ? (sortedSplits[si + 1] ?? sentences.length) : sentences.length;

    // Add overlap from previous chunk (last OVERLAP_SENTENCES sentences)
    const overlapStart = si > 0 ? Math.max(start - OVERLAP_SENTENCES, sortedSplits[si - 1] ?? 0) : start;

    const chunkSentences = sentences.slice(overlapStart, end);
    const content = chunkSentences.join(' ').trim();

    if (content.length === 0) continue;

    // Calculate char offset in original text
    const charOffset = sentences.slice(0, overlapStart).join(' ').length;
    const charEnd = charOffset + content.length;

    chunks.push(makeChunk(content, charOffset, charEnd, options, chunks.length));
  }

  return chunks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitToSentences(text: string): string[] {
  const doc = nlp(text);
  const sentences = doc.sentences().out('array') as string[];
  return sentences
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 10); // skip very short fragments
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function makeChunk(
  content: string,
  charOffset: number,
  charEnd: number,
  options: ChunkerOptions,
  index: number
): Chunk {
  const metadata: ChunkMetadata = {
    documentId: options.documentId,
    documentTitle: options.documentTitle,
    source: options.source,
    sourcePath: options.sourcePath,
    charOffset,
    charEnd,
    createdAt: options.createdAt,
  };

  return {
    id: nanoid(),
    documentId: options.documentId,
    content,
    metadata,
  };
}
