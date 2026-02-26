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

// ─── ONNX Runtime Configuration for Chrome Extension CSP ────────────────────
//
// Chrome MV3 CSP (`script-src 'self' 'wasm-unsafe-eval'`) blocks:
// 1. Dynamic import() of scripts from CDN (only 'self' allowed)
// 2. Dynamic import() of blob: URLs (used by ONNX Runtime's preload path)
// 3. Web Worker creation via blob: URLs (worker-src 'self')
//
// Fix: Point ONNX Runtime to the extension's own copy of the WASM files
// (copied by the copyOrtWasmFiles Vite plugin), disable proxy workers, and
// force single-threaded execution to avoid the multi-thread preload code path.

const onnxEnv = transformersEnv.backends.onnx;

if (onnxEnv?.wasm) {
  // Point to extension-local copies of the ONNX Runtime WASM files.
  // These are copied to dist/ort/ by the Vite plugin and served as
  // same-origin extension resources, bypassing the CDN + blob: URL path.
  onnxEnv.wasm.wasmPaths = chrome.runtime.getURL('ort/');

  // Disable worker proxy — blob: Workers are blocked by CSP.
  // Inference runs on the offscreen document's main thread (isolated from popup).
  onnxEnv.wasm.proxy = false;

  // Force single-threaded to avoid the multi-thread code path which uses
  // preload() → blob: URL → dynamic import() (blocked by CSP).
  onnxEnv.wasm.numThreads = 1;
}

// Retry helper with exponential backoff for transient WASM loading failures.
async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelay = 1000, label = 'operation' } = {}
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.warn(`[EdgeAI] ${label} attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError!;
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
      await withRetry(
        () => em.load((progress) => {
          broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'embeddings', progress } });
        }),
        { label: 'embeddings', maxRetries: 3 }
      );
      embeddingModel = em; // assign AFTER load() completes
    }

    if (!rerankerModel) {
      const rm = new RerankerModel();
      await withRetry(
        () => rm.load((progress) => {
          broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'reranker', progress } });
        }),
        { label: 'reranker', maxRetries: 3 }
      );
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
    llmEngine = await withRetry(
      () => webllm.CreateMLCEngine(modelId, {
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
      }),
      { label: 'LLM', maxRetries: 2, baseDelay: 2000 }
    );

    broadcastStatus({ type: 'MODEL_READY', payload: { model: 'llm', modelId } });
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : 'Initialization failed';
    initError = humanizeError(rawMsg);
    broadcastStatus({ type: 'MODEL_ERROR', payload: { error: initError, canRetry: true } });
    throw error;
  } finally {
    isInitializing = false;
  }
}

/** Translate cryptic WASM/WebGPU errors into user-friendly messages. */
function humanizeError(raw: string): string {
  if (raw.includes('no available backend') || raw.includes('Failed to fetch dynamically imported module')) {
    return 'Your browser could not load the AI engine. This usually means WebGPU is unavailable or blocked. Try updating Chrome or enabling WebGPU in chrome://flags.';
  }
  if (raw.includes('WebGPU') || raw.includes('requestAdapter')) {
    return 'WebGPU is not supported on this device. EdgeAI needs a browser with WebGPU to run the local AI model.';
  }
  if (raw.includes('out of memory') || raw.includes('OOM')) {
    return 'Not enough memory to load the AI model. Try closing other tabs or applications and retry.';
  }
  if (raw.includes('network') || raw.includes('fetch')) {
    return 'Could not download model files. Check your internet connection and retry — files are cached after first download.';
  }
  return raw;
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
  let ragChunkCount = 0;
  if (useRag && vectorStore && embeddingModel && rerankerModel) {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      try {
        console.log('[EdgeAI] RAG: searching for context…', lastUserMsg.content.slice(0, 80));
        const context = await buildRagContext(
          lastUserMsg.content,
          vectorStore,
          embeddingModel,
          rerankerModel
        );
        ragChunkCount = context.chunks.length;
        console.log(`[EdgeAI] RAG: found ${ragChunkCount} relevant chunks`);
        if (ragChunkCount > 0) {
          augmentedSystem += '\n\n' + context.systemPromptAddition;
        }
      } catch (ragErr) {
        console.error('[EdgeAI] RAG failed:', ragErr);
        // Notify user that context retrieval failed so they know why the answer lacks context
        chrome.runtime.sendMessage({
          type: 'CHAT_CHUNK',
          payload: { token: '[Could not retrieve document context — answering from general knowledge]\n\n', requestId },
        }).catch(() => {});
      }
    }
  } else if (useRag) {
    console.warn('[EdgeAI] RAG skipped — missing dependencies:', {
      vectorStore: !!vectorStore,
      embeddingModel: !!embeddingModel,
      rerankerModel: !!rerankerModel,
    });
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
    try {
      await sileroVad.load((progress) => {
        broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'vad', progress } });
      });
    } catch (err) {
      // VAD is optional — VoiceSession skips VAD when isLoaded is false (asr.ts line 161)
      console.warn('[EdgeAI] VAD failed to load (voice will work without it):', err instanceof Error ? err.message : err);
    }
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

  try {
    console.log('[EdgeAI offscreen] Starting voice session…');
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
          type: 'VOICE_ERROR',
          payload: { error: error.message },
        });
      },
      onStateChange: (state) => {
        console.log(`[EdgeAI offscreen] Voice state: ${state}`);
      },
    });
    console.log('[EdgeAI offscreen] Voice session started successfully');
  } catch (err) {
    const errName = err instanceof Error ? err.name : 'unknown';
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[EdgeAI offscreen] Voice start failed:', { name: errName, message: msg, raw: err });
    // Specific error for mic permission denied
    if (msg.includes('NotAllowedError') || msg.includes('Permission denied') || msg.includes('not allowed')) {
      throw new Error('Microphone access denied. Allow microphone in Chrome site settings for this extension.');
    }
    throw err;
  }
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

      case 'RETRY_INIT':
        // Reset state so initialization can be attempted again
        initError = null;
        isInitializing = false;
        _initPromise = null;
        broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'embeddings', progress: 0 } });
        (async () => {
          try {
            await initStoresAndEmbeddings();
            broadcastStatus({ type: 'MODEL_READY', payload: { model: 'embeddings_and_reranker' } });
            await initialize();
          } catch (retryErr) {
            // Error is already broadcast by initialize() / humanizeError()
            console.error('[EdgeAI] Retry failed:', retryErr);
          }
        })();
        sendResponse({ acknowledged: true });
        return false;

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
        handleVoiceStart()
          .then(() => sendResponse({ ready: true }))
          .catch((err) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            broadcastStatus({
              type: 'VOICE_ERROR',
              payload: { error: errMsg },
            });
            sendResponse({ error: errMsg });
          });
        return true; // keep port open for async response

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
    const rawMsg = err instanceof Error ? err.message : String(err);
    const friendly = humanizeError(rawMsg);
    console.error('[EdgeAI offscreen] Init error:', rawMsg);
    initError = friendly;
    broadcastStatus({
      type: 'MODEL_ERROR',
      payload: { error: friendly, stage: 'embeddings', canRetry: true },
    });
  }
})();

export {};
