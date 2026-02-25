/**
 * Offscreen Document — Inference Engine (ADR-001, ADR-002)
 *
 * This is the primary compute context. It has access to:
 * - WebGPU (for LLM and embeddings)
 * - DOM APIs (for File System Access, getUserMedia)
 * - IndexedDB (for persistent storage)
 *
 * All ML inference runs here, multiplexed via message passing with the SW.
 *
 * Stack:
 * - web-llm (WebGPU)          → generative LLM
 * - transformers.js (ONNX)    → embeddings, Whisper ASR, cross-encoder reranker
 * - Orama                     → vector store (BM25 + HNSW hybrid)
 * - Dexie.js                  → document metadata store (IndexedDB)
 */

import * as webllm from '@mlc-ai/web-llm';
import { env as transformersEnv } from '@huggingface/transformers';
import type { Message, ChatRequest, IndexDocumentRequest, SearchRequest, IVectorStore, IEmbeddingModel, IRerankerModel, IDocumentStore } from '@/lib/types';
import { VectorStore } from '@/lib/storage/vector-store';
import { DocumentStore } from '@/lib/storage/document-store';
import { EmbeddingModel, RerankerModel } from '@/lib/models/embedding';
import { WhisperASR, VoiceSession } from '@/lib/voice/asr';
import { SileroVAD } from '@/lib/voice/vad';
import { buildSystemPrompt, buildRagContext } from '@/lib/retrieval/retrieval';
import { semanticChunk } from '@/lib/retrieval/chunker';
import { nanoid } from '@/lib/utils';

// Disable the ONNX wasm worker proxy — it spawns workers via blob: URLs which
// Chrome MV3 CSP forbids in extension pages (worker-src must be 'self' only).
// Inference runs on the main offscreen thread; for WASM this is acceptable given
// the offscreen document is already isolated from the popup.
if (transformersEnv.backends.onnx.wasm) {
  transformersEnv.backends.onnx.wasm.proxy = false;
}

// ─── Model Configuration ─────────────────────────────────────────────────────

const LLM_MODEL_ID = 'Phi-3.5-mini-instruct-q4f16_1-MLC';
const LLM_FALLBACK_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

// ─── Global State ─────────────────────────────────────────────────────────────

let llmEngine: webllm.MLCEngine | null = null;
let vectorStore: IVectorStore | null = null;
let documentStore: IDocumentStore | null = null;
let embeddingModel: IEmbeddingModel | null = null;
let rerankerModel: IRerankerModel | null = null;

let isInitializing = false;
let initError: string | null = null;

// Serializes concurrent calls to initStoresAndEmbeddings so that a second
// caller (e.g. LOAD_MODEL message arriving while IIFE is still loading) waits
// for the first call to complete rather than returning early with half-loaded state.
let _initPromise: Promise<void> | null = null;

// ─── Voice State ──────────────────────────────────────────────────────────────

let whisperAsr: WhisperASR | null = null;
let sileroVad: SileroVAD | null = null;
let voiceSession: VoiceSession | null = null;

// Sequential FIFO queue for INDEX_DOCUMENT — prevents concurrent embedding sessions
// from OOM-ing the WASM/WebGPU worker during bulk vault imports (ADR-005 backpressure).
let indexQueue: Promise<void> = Promise.resolve();

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Idempotent — initializes stores and embedding models only once.
 * Called from both the auto-init IIFE (on load) and initialize() (on LOAD_MODEL).
 *
 * KEY: models are assigned to their globals ONLY after their load() completes.
 * This prevents handleChat() from seeing a non-null embeddingModel whose pipe
 * is still null (the root cause of "Embedding model not loaded" errors).
 *
 * _initPromise serializes concurrent callers so they all wait for the same
 * in-flight initialization rather than racing on the null checks.
 */
async function initStoresAndEmbeddings(): Promise<void> {
  if (documentStore && vectorStore && embeddingModel && rerankerModel) return;

  // If init is already in progress, join the existing promise rather than
  // starting a second concurrent initialization that could leave models
  // in a partially-loaded state.
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    if (!documentStore) {
      documentStore = new DocumentStore();
      await documentStore.open();
    }

    if (!vectorStore) {
      vectorStore = new VectorStore();
      await vectorStore.init();
    }

    if (!embeddingModel) {
      const em = new EmbeddingModel();
      await em.load((progress) => {
        broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'embeddings', progress } });
      });
      embeddingModel = em; // assign AFTER load() completes
    }

    if (!rerankerModel) {
      const rm = new RerankerModel();
      await rm.load((progress) => {
        broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'reranker', progress } });
      });
      rerankerModel = rm; // assign AFTER load() completes
    }
  })().finally(() => {
    _initPromise = null;
  });

  return _initPromise;
}

async function initialize(): Promise<void> {
  if (isInitializing || llmEngine) return;
  isInitializing = true;

  try {
    // Stores/embeddings may already be loaded by the auto-init IIFE — skip if so
    await initStoresAndEmbeddings();

    // Load LLM — this is the big download (2.3GB first time, Cache API thereafter)
    const modelId = await selectModelForHardware();
    llmEngine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        broadcastStatus({
          type: 'MODEL_PROGRESS',
          payload: {
            model: 'llm',
            progress: Math.round(progress.progress * 100),
            text: progress.text,
          },
        });
      },
    });

    broadcastStatus({ type: 'MODEL_READY', payload: { model: 'llm', modelId } });
  } catch (error) {
    initError = error instanceof Error ? error.message : 'Initialization failed';
    broadcastStatus({ type: 'MODEL_ERROR', payload: { error: initError } });
    throw error;
  } finally {
    isInitializing = false;
  }
}

async function selectModelForHardware(): Promise<string> {
  // Check for WebGPU support
  if (!navigator.gpu) {
    console.warn('[EdgeAI] WebGPU not available, using CPU fallback model');
    return LLM_FALLBACK_ID;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return LLM_FALLBACK_ID;

    const info = await adapter.requestAdapterInfo();
    // M1/M2/M3 Apple Silicon handles larger models well
    const isAppleSilicon = info.vendor?.toLowerCase().includes('apple') ||
                            info.architecture?.toLowerCase().includes('apple');

    // Check available memory heuristic via VRAM limits
    const limits = adapter.limits;
    const maxBufferSize = limits.maxBufferSize;
    // 2.3GB model needs ~4GB VRAM — check if device looks capable
    const hasEnoughVram = maxBufferSize >= 2 * 1024 * 1024 * 1024;

    if (isAppleSilicon || hasEnoughVram) {
      return LLM_MODEL_ID;
    }
    return LLM_FALLBACK_ID;
  } catch {
    return LLM_FALLBACK_ID;
  }
}

function broadcastStatus(message: Message): void {
  // Send to all extension contexts (popup, content scripts)
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may not be open — that's fine
  });
}

// ─── Chat Handler ─────────────────────────────────────────────────────────────

async function handleChat(request: ChatRequest, requestId: string): Promise<void> {
  if (!llmEngine) {
    throw new Error('LLM not loaded yet');
  }

  const { messages, systemPrompt, useRag = true } = request;

  let augmentedSystem = systemPrompt ?? buildSystemPrompt();

  // RAG: retrieve relevant context for the last user message.
  // Wrapped in try/catch so a RAG failure (e.g. model still warming up) never
  // blocks the user from getting a response — we just answer from base knowledge.
  if (useRag && vectorStore && embeddingModel && rerankerModel) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      try {
        const context = await buildRagContext(
          lastUserMsg.content,
          vectorStore,
          embeddingModel,
          rerankerModel
        );
        if (context.chunks.length > 0) {
          augmentedSystem += '\n\n' + context.systemPromptAddition;
        }
      } catch (ragErr) {
        // RAG is best-effort — log and continue without context
        console.warn('[EdgeAI] RAG failed, answering without context:', ragErr);
      }
    }
  }

  const fullMessages: webllm.ChatCompletionMessageParam[] = [
    { role: 'system', content: augmentedSystem },
    ...messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  // Streaming generation
  const stream = await llmEngine.chat.completions.create({
    messages: fullMessages,
    stream: true,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens ?? 1024,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) {
      chrome.runtime.sendMessage({
        type: 'CHAT_CHUNK',
        payload: { token, requestId },
      }).catch(() => {});
    }
  }

  const usage = await llmEngine.runtimeStatsText();
  chrome.runtime.sendMessage({
    type: 'CHAT_DONE',
    payload: { requestId, stats: usage },
  }).catch(() => {});
}

// ─── Document Indexing Handler ────────────────────────────────────────────────

async function handleIndexDocument(
  request: IndexDocumentRequest,
  requestId: string
): Promise<void> {
  if (!vectorStore || !documentStore || !embeddingModel) {
    throw new Error('Storage not initialized');
  }

  const docId = nanoid();
  const now = Date.now();

  broadcastStatus({
    type: 'INDEX_PROGRESS',
    payload: { documentId: docId, stage: 'chunking', progress: 10, requestId },
  });

  // 1. Semantic chunking
  const chunks = await semanticChunk(request.content, {
    embeddingModel,
    documentId: docId,
    documentTitle: request.metadata.title,
    source: request.metadata.source,
    sourcePath: request.metadata.sourcePath,
    createdAt: request.metadata.createdAt ?? now,
  });

  broadcastStatus({
    type: 'INDEX_PROGRESS',
    payload: { documentId: docId, stage: 'embedding', progress: 40, requestId },
  });

  // 2. Embed all chunks in batch
  const texts = chunks.map((c) => c.content);
  const embeddings = await embeddingModel.embedBatch(texts);

  broadcastStatus({
    type: 'INDEX_PROGRESS',
    payload: { documentId: docId, stage: 'storing', progress: 80, requestId },
  });

  // 3. Store chunks with embeddings in vector store
  const chunksWithEmbeddings = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i] ?? [],
  }));
  await vectorStore.addChunks(chunksWithEmbeddings);

  // 4. Store document metadata in Dexie (including a short preview for the UI)
  await documentStore.addDocument({
    id: docId,
    title: request.metadata.title,
    source: request.metadata.source,
    sourcePath: request.metadata.sourcePath,
    createdAt: request.metadata.createdAt ?? now,
    updatedAt: now,
    charCount: request.content.length,
    chunkCount: chunks.length,
    tags: request.metadata.tags,
    preview: request.content.slice(0, 500).trim(),
  });

  broadcastStatus({
    type: 'INDEX_DONE',
    payload: {
      documentId: docId,
      chunkCount: chunks.length,
      requestId,
    },
  });
}

// ─── Search Handler ───────────────────────────────────────────────────────────

async function handleSearch(request: SearchRequest): Promise<unknown> {
  if (!vectorStore || !embeddingModel || !rerankerModel) {
    throw new Error('Storage not initialized');
  }

  const context = await buildRagContext(
    request.query,
    vectorStore,
    embeddingModel,
    rerankerModel,
    { topK: request.topK ?? 5, filters: request.filters }
  );

  return context.chunks;
}

// ─── Voice Handler ────────────────────────────────────────────────────────────

async function ensureVoiceModels(): Promise<{ asr: WhisperASR; vad: SileroVAD }> {
  if (!sileroVad) {
    sileroVad = new SileroVAD();
    await sileroVad.load((progress) => {
      broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'vad', progress } });
    });
  }

  if (!whisperAsr) {
    whisperAsr = new WhisperASR();
    await whisperAsr.load((progress) => {
      broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'asr', progress } });
    });
  }

  return { asr: whisperAsr, vad: sileroVad };
}

async function handleVoiceStart(): Promise<void> {
  const { asr, vad } = await ensureVoiceModels();

  if (!voiceSession) {
    voiceSession = new VoiceSession(asr, vad);
  }

  await voiceSession.start({
    onTranscript: (transcript) => {
      chrome.runtime.sendMessage({
        type: 'VOICE_TRANSCRIPT',
        payload: { text: transcript.text, intent: transcript.intent },
      }).catch(() => {});
    },
    onError: (error) => {
      console.error('[EdgeAI offscreen] Voice error:', error);
      broadcastStatus({
        type: 'MODEL_ERROR',
        payload: { error: `Voice error: ${error.message}` },
      });
    },
  });
}

// ─── Message Router ───────────────────────────────────────────────────────────
// Only handle messages that have _target: 'offscreen' to avoid processing
// messages from the offscreen document itself.

chrome.runtime.onMessage.addListener(
  (message: Message & { _target?: string }, _sender, sendResponse) => {
    if (message._target !== 'offscreen') return false;

    const { type, payload, requestId } = message;

    switch (type) {
      case 'LOAD_MODEL':
        initialize()
          .then(() => sendResponse({ type: 'MODEL_READY' }))
          .catch((err) => sendResponse({ type: 'MODEL_ERROR', payload: { error: err.message } }));
        return true;

      case 'GET_STATUS':
        sendResponse({
          type: 'STATUS',
          payload: {
            llmReady: !!llmEngine,
            embeddingsReady: !!embeddingModel,
            storeReady: !!vectorStore,
            error: initError,
          },
        });
        return false;

      case 'CHAT':
        if (!payload) { sendResponse({ type: 'CHAT_ERROR', payload: { error: 'No payload' } }); return false; }
        handleChat(payload as ChatRequest, requestId ?? nanoid())
          .catch((err) =>
            chrome.runtime.sendMessage({
              type: 'CHAT_ERROR',
              payload: { error: err.message, requestId },
            }).catch(() => {})
          );
        // Response comes via CHAT_CHUNK / CHAT_DONE stream — no direct sendResponse
        sendResponse({ acknowledged: true });
        return false;

      case 'INDEX_DOCUMENT':
        if (!payload) { sendResponse({ type: 'INDEX_ERROR', payload: { error: 'No payload' } }); return false; }
        // Chain onto the sequential queue — bulk imports (e.g. 300-note vault) otherwise
        // flood the ONNX/WebGPU worker with parallel embedding sessions and OOM.
        indexQueue = indexQueue.then(() =>
          handleIndexDocument(payload as IndexDocumentRequest, requestId ?? nanoid())
            .catch((err) =>
              broadcastStatus({
                type: 'INDEX_ERROR',
                payload: { error: err.message, requestId },
              })
            )
        );
        sendResponse({ acknowledged: true });
        return false;

      case 'SEARCH':
        if (!payload) { sendResponse({ type: 'SEARCH_RESULTS', payload: [] }); return false; }
        handleSearch(payload as SearchRequest)
          .then((results) => sendResponse({ type: 'SEARCH_RESULTS', payload: results }))
          .catch((err) => sendResponse({ type: 'SEARCH_RESULTS', payload: [], error: err.message }));
        return true;

      case 'LIST_DOCUMENTS':
        if (!documentStore) {
          sendResponse({ type: 'DOCUMENTS_LIST', payload: [] });
          return false;
        }
        documentStore.listDocuments()
          .then((docs) => sendResponse({ type: 'DOCUMENTS_LIST', payload: docs }))
          .catch((err) => sendResponse({ type: 'DOCUMENTS_LIST', payload: [], error: err.message }));
        return true;

      case 'VOICE_START':
        handleVoiceStart().catch((err) =>
          broadcastStatus({
            type: 'MODEL_ERROR',
            payload: { error: `Voice start failed: ${err instanceof Error ? err.message : String(err)}` },
          })
        );
        sendResponse({ acknowledged: true });
        return false;

      case 'VOICE_STOP':
        voiceSession?.stop();
        sendResponse({ acknowledged: true });
        return false;

      case 'DELETE_DOCUMENT':
        if (!payload || typeof (payload as { documentId?: string }).documentId !== 'string') {
          sendResponse({ error: 'No documentId' });
          return false;
        }
        Promise.all([
          vectorStore?.deleteByDocumentId((payload as { documentId: string }).documentId),
          documentStore?.deleteDocument((payload as { documentId: string }).documentId),
        ])
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ error: err.message }));
        return true;

      default:
        return false;
    }
  }
);

// ─── Auto-initialize on Load ───────────────────────────────────────────────────
// Load stores and embeddings eagerly; LLM loads on demand (first LOAD_MODEL message).

(async () => {
  try {
    await initStoresAndEmbeddings();
    broadcastStatus({ type: 'MODEL_READY', payload: { model: 'embeddings_and_reranker' } });
  } catch (err) {
    console.error('[EdgeAI offscreen] Init error:', err);
  }
})();

export {};
