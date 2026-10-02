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
  AutoTokenizer,
  AutoModelForSequenceClassification,
  FeatureExtractionPipeline,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Tensor,
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

/**
 * The cross-encoder is called directly rather than through the
 * text-classification pipeline: the pipeline applies softmax over the model's
 * outputs, and this model has one output, so every passage scored 1 and
 * reranking changed nothing.
 */
export class RerankerModel {
  private tokenizer: PreTrainedTokenizer | null = null;
  private model: PreTrainedModel | null = null;
  private readonly modelId = 'Xenova/ms-marco-MiniLM-L-6-v2';

  async load(onProgress?: (progress: number) => void): Promise<void> {
    if (this.model) return;

    const progress_callback = onProgress
      ? (info: Record<string, unknown>) => {
          if (typeof info['progress'] === 'number') onProgress(Math.round(info['progress']));
        }
      : undefined;
    [this.tokenizer, this.model] = await Promise.all([
      AutoTokenizer.from_pretrained(this.modelId, { progress_callback }),
      AutoModelForSequenceClassification.from_pretrained(this.modelId, {
        progress_callback,
        dtype: 'int8',
        device: 'wasm', // reranker is small enough — WASM is fine and avoids GPU contention
      }),
    ]);
  }

  /**
   * How relevant each passage is to the query: the model's raw logit, higher
   * is more relevant, above 0 means the model leans towards relevant.
   */
  async rerank(query: string, passages: string[]): Promise<number[]> {
    if (!this.tokenizer || !this.model) throw new Error('Reranker model not loaded');
    if (passages.length === 0) return [];

    // One (query, passage) pair per passage, encoded as a sentence pair.
    const inputs = this.tokenizer(passages.map(() => query), {
      text_pair: passages,
      padding: true,
      truncation: true,
    });
    const { logits } = await this.model(inputs) as { logits: Tensor };
    return Array.from(logits.data as Float32Array);
  }
}
