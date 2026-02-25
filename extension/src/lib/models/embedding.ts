/**
 * Embedding + Re-ranking Models via transformers.js (ADR-002)
 *
 * Models:
 * - Embeddings: bge-small-en-v1.5 (33MB, 384-dim, ~3-6ms/sentence)
 * - Re-ranker:  ms-marco-MiniLM-L-6-v2 int8 (22MB, ~200-500ms for 10 candidates)
 *
 * Both use transformers.js ONNX runtime with WebGPU acceleration where available.
 */

import {
  pipeline,
  FeatureExtractionPipeline,
  TextClassificationPipeline,
  env,
} from '@huggingface/transformers';

// Configure transformers.js to use local cache (Chrome Cache API via service worker)
env.allowLocalModels = false;
env.useBrowserCache = true;

// transformers.js v3 pipeline() has deeply polymorphic overloads that cause TS2590
// ("union type too complex to represent") when device/dtype literals are inferred.
// Casting to a simple signature bypasses overload resolution entirely.
type SimplePipeline = (task: string, model: string, opts?: Record<string, unknown>) => Promise<unknown>;
const callPipeline = pipeline as unknown as SimplePipeline;

export class EmbeddingModel {
  private pipe: FeatureExtractionPipeline | null = null;
  private readonly modelId = 'Xenova/bge-small-en-v1.5';

  async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) return;

    const progressCallback = onProgress
      ? (info: Record<string, unknown>) => {
          if (typeof info['progress'] === 'number') onProgress(Math.round(info['progress']));
        }
      : undefined;

    // Use WASM backend only — requesting 'webgpu' causes ONNX Runtime to load its
    // JSEP (WebGPU) execution-provider module via a dynamically-imported blob: URL,
    // which Chrome MV3 CSP blocks in extension pages ('blob:' is not allowed in
    // script-src for extension pages). WASM is fast enough for bge-small-en-v1.5
    // (33MB) and avoids GPU contention with web-llm which uses WebGPU for the LLM.
    this.pipe = (await callPipeline('feature-extraction', this.modelId, {
      progress_callback: progressCallback,
      dtype: 'fp32',
      device: 'wasm',
    })) as FeatureExtractionPipeline;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0] ?? [];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.pipe) throw new Error('Embedding model not loaded');

    // Process in batches of 32 to avoid OOM on large documents
    const BATCH_SIZE = 32;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const output = await this.pipe(batch, { pooling: 'mean', normalize: true });

      // output is a Tensor2D [batch_size, embedding_dim]
      const array = output.tolist() as number[][];
      results.push(...array);
    }

    return results;
  }
}

export class RerankerModel {
  private pipe: TextClassificationPipeline | null = null;
  private readonly modelId = 'Xenova/ms-marco-MiniLM-L-6-v2';

  async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) return;

    this.pipe = (await callPipeline('text-classification', this.modelId, {
      progress_callback: onProgress
        ? (info: Record<string, unknown>) => {
            if (typeof info['progress'] === 'number') onProgress(Math.round(info['progress']));
          }
        : undefined,
      dtype: 'int8',
      device: 'wasm', // reranker is small enough — WASM is fine and avoids GPU contention
    })) as TextClassificationPipeline;
  }

  /**
   * Returns relevance scores for each passage given the query.
   * Higher = more relevant. Scores are raw logits (not normalized).
   */
  async rerank(query: string, passages: string[]): Promise<number[]> {
    if (!this.pipe) throw new Error('Reranker model not loaded');
    if (passages.length === 0) return [];

    // ms-marco cross-encoder takes [query, passage] pairs
    const pairs = passages.map((passage) => `${query} [SEP] ${passage}`);

    // top_k: null returns all labels — cast to bypass TS strict number | undefined constraint
    type PipeCall = (inputs: string[], opts?: Record<string, unknown>) => Promise<unknown>;
    const outputs = await (this.pipe as unknown as PipeCall)(pairs, { top_k: null });

    // Extract score for the "relevant" class (label_1 or the higher-scoring label)
    const scores = (Array.isArray(outputs) ? outputs : [outputs]).map((result) => {
      const resultArr = Array.isArray(result) ? result : [result];
      // Find score for positive relevance label
      const positive = resultArr.find(
        (r: { label: string; score: number }) =>
          r.label === 'LABEL_1' || r.label === '1' || r.score > 0.5
      );
      return positive?.score ?? (resultArr[0]?.score ?? 0);
    });

    return scores;
  }
}
