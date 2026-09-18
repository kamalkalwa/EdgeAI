/**
 * Embedding + Re-ranking Models via transformers.js (ADR-002)
 *
 * Models:
 * - Embeddings: bge-small-en-v1.5 (fp32, 130MB download, 384-dim)
 * - Re-ranker:  ms-marco-MiniLM-L-6-v2 int8 (22MB, ~200-500ms for 10 candidates)
 *
 * Embeddings run on WebGPU when available (WASM fallback); the reranker stays on
 * WASM — int8 gains nothing on the GPU and it would contend with the LLM.
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

// transformers.js pipeline() has deeply polymorphic overloads that cause TS2590
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

    // Embeddings are the indexing bottleneck, so they go on the GPU when it's
    // there. transformers.js 4 / ONNX Runtime 1.31 load the WebGPU runtime with a
    // plain same-origin import() (single-threaded, wasmPaths inside the package),
    // which the extension CSP allows; the v3 JSEP runtime needed a blob: URL and
    // didn't. If the GPU path still fails on some machine, fall back to WASM
    // rather than leaving the extension without embeddings.
    const load = (device: 'webgpu' | 'wasm') => callPipeline('feature-extraction', this.modelId, {
      progress_callback: progressCallback,
      dtype: 'fp32',
      device,
    }) as Promise<FeatureExtractionPipeline>;

    if (navigator.gpu) {
      try {
        this.pipe = await load('webgpu');
        this.device = 'webgpu';
        return;
      } catch (err) {
        console.warn('[EdgeAI] WebGPU embeddings unavailable, using WASM:', err instanceof Error ? err.message : err);
      }
    }
    this.pipe = await load('wasm');
    this.device = 'wasm';
  }

  /** Which backend the model actually loaded on — surfaced in the Trust Panel / logs. */
  device: 'webgpu' | 'wasm' | null = null;

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
