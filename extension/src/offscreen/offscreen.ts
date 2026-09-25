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
 * - transformers.js (ONNX)    → embeddings, Moonshine ASR, cross-encoder reranker
 * - Orama + brute-force cosine → hybrid BM25 + vector search
 * - Dexie.js                  → document metadata store (IndexedDB)
 */

import * as webllm from '@mlc-ai/web-llm';
import { env as transformersEnv } from '@huggingface/transformers';
import type { Message, ChatRequest, IndexDocumentRequest, SearchRequest, IVectorStore, IEmbeddingModel, IRerankerModel, IDocumentStore } from '@/lib/types';
import { VectorStore } from '@/lib/storage/vector-store';
import { DocumentStore } from '@/lib/storage/document-store';
import { EmbeddingModel, RerankerModel } from '@/lib/models/embedding';
import { MoonshineASR, VoiceSession } from '@/lib/voice/asr';
import { SileroVAD } from '@/lib/voice/vad';
import { buildSystemPrompt, buildRagContext } from '@/lib/retrieval/retrieval';
import { semanticChunk } from '@/lib/retrieval/chunker';
import { nanoid } from '@/lib/utils';
import type { AuditEntry } from '@/lib/trust/audit-log';
import { reportNetworkRequests } from '@/lib/trust/request-reporter';
import { USER_DATABASES } from '@/lib/storage/db-names';
import { DEFAULT_LLM, FALLBACK_LLM } from '@/lib/models/llm-catalog';
import { BookmarkImporter, type BookmarkInfo } from '@/lib/connectors/bookmarks';

// Every model download this document makes goes into the Trust Panel's log.
reportNetworkRequests('offscreen');

/** Adds an entry to the Trust Panel's audit log, which the service worker keeps: this document has no chrome.storage. */
function reportAudit(entry: AuditEntry): void {
  chrome.runtime.sendMessage({ type: 'AUDIT_ENTRY', payload: entry }).catch(() => {});
}

// ─── ONNX Runtime Configuration for Chrome Extension CSP ────────────────────
//
// Chrome MV3 CSP (`script-src 'self' 'wasm-unsafe-eval'`) blocks:
// 1. Dynamic import() of scripts from CDN (only 'self' allowed)
// 2. Dynamic import() of blob: URLs (ONNX Runtime's multi-thread preload path)
// 3. Web Worker creation via blob: URLs (worker-src 'self')
//
// Fix: point ONNX Runtime at the extension's own copy of its runtime files
// (copied by the copyOrtWasmFiles Vite plugin), disable the proxy worker, and
// stay single-threaded. ONNX Runtime 1.31 (via transformers.js 4) then loads
// its module with a plain same-origin import(), on WebGPU as well as WASM.

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

const LLM_MODEL_ID = DEFAULT_LLM.id;
const LLM_FALLBACK_ID = FALLBACK_LLM.id;

// ─── Bundled Model Library ───────────────────────────────────────────────────
//
// web-llm's prebuilt config points each model's compiled WebGPU library (a
// .wasm) at GitHub and fetches it on first load. The Web Store forbids running
// code the package did not ship, and our privacy policy says none is fetched,
// so the build bundles those files (scripts/fetch-model-libs.mjs → public/mlc/)
// and we seed web-llm's own cache with the bundled bytes under the URL it will
// ask for. The Cache API refuses chrome-extension:// keys, which is why the
// model record's URL stays as is and only the bytes are ours. A missing bundled
// file is a build defect and fails loudly: web-llm must never reach GitHub.
//
// Error messages here avoid the words "fetch" and "network" on purpose —
// humanizeError() would otherwise report them as connectivity problems.

const MODEL_LIB_CACHE = 'webllm/wasm'; // cache scope name used inside web-llm

interface BundledModelLib { modelId: string; file: string; url: string; sha256: string; bytes: number }

async function seedModelLibCache(modelId: string): Promise<void> {
  const record = webllm.prebuiltAppConfig.model_list.find((m) => m.model_id === modelId);
  if (!record) throw new Error(`${modelId} is not in web-llm's prebuilt config`);
  const cache = await caches.open(MODEL_LIB_CACHE);
  if (await cache.match(record.model_lib)) return; // already seeded

  const index = (await fetch(chrome.runtime.getURL('mlc/libs.json')).then((r) => r.json())) as { libs: BundledModelLib[] };
  const lib = index.libs.find((l) => l.url === record.model_lib);
  if (!lib) throw new Error(`Bundled model library for ${modelId} is missing: this build was packaged without public/mlc/`);
  const res = await fetch(chrome.runtime.getURL(`mlc/${lib.file}`));
  if (!res.ok) throw new Error(`Bundled model library ${lib.file} is missing from the package (HTTP ${res.status})`);
  const body = await res.arrayBuffer();
  await cache.put(record.model_lib, new Response(body, { headers: { 'Content-Type': 'application/wasm' } }));
  console.log(`[EdgeAI] Seeded ${lib.file} (${(body.byteLength / 1e6).toFixed(1)} MB) from the extension package`);
}

// ─── Global State ─────────────────────────────────────────────────────────────

let llmEngine: webllm.MLCEngine | null = null;
let activeModelId: string | null = null; // which LLM actually loaded (default or fallback)
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

// Set while Clear All Data is deleting the databases. initStoresAndEmbeddings
// waits for it, so nothing reopens a store that is about to be deleted.
let _resetPromise: Promise<void> | null = null;

// ─── Voice State ──────────────────────────────────────────────────────────────

let moonshineAsr: MoonshineASR | null = null;
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
  if (_resetPromise) await _resetPromise;
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
      console.log(`[EdgeAI] Embeddings on ${em.device}`);
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

    // Load LLM — this is the big download (2.2GB first time, Cache API thereafter)
    const modelId = await selectModelForHardware();
    // Throws on a broken build → MODEL_ERROR via the catch below. Never let web-llm download code.
    await seedModelLibCache(modelId);
    llmEngine = await withRetry(
      () => webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (progress) => {
          broadcastStatus({
            type: 'MODEL_PROGRESS',
            payload: {
              model: 'llm',
              modelId, // lets the popup name the model and its download size
              progress: Math.round(progress.progress * 100),
              text: progress.text,
            },
          });
        },
      }),
      { label: 'LLM', maxRetries: 2, baseDelay: 2000 }
    );

    activeModelId = modelId;
    broadcastStatus({ type: 'MODEL_READY', payload: { model: 'llm', modelId } });

    // Pre-load voice models in background (non-blocking) so first mic click is instant
    ensureVoiceModels().catch(console.warn);
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

    // Chrome 131+ exposes `adapter.info`; older builds only had requestAdapterInfo().
    // Without this fallback the call throws on current Chrome and *every* machine
    // silently gets the 1B model.
    type AdapterInfoLike = { vendor?: string; architecture?: string };
    const a = adapter as unknown as { info?: AdapterInfoLike; requestAdapterInfo?: () => Promise<AdapterInfoLike> };
    const info: AdapterInfoLike = a.info ?? (await a.requestAdapterInfo?.()) ?? {};
    // M1/M2/M3 Apple Silicon handles larger models well
    const isAppleSilicon = (info.vendor ?? '').toLowerCase().includes('apple') ||
                            (info.architecture ?? '').toLowerCase().includes('apple');

    // Check available memory heuristic via VRAM limits
    const limits = adapter.limits;
    const maxBufferSize = limits.maxBufferSize;
    // Phi-4-mini needs ~3.4GB VRAM — check if device looks capable
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
  // Send to all extension contexts (popup, side panel)
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
  let auditChunks: Array<{ documentTitle: string; source: string; score: number }> = [];
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
        auditChunks = context.chunks.map((c) => ({
          documentTitle: c.chunk.metadata.documentTitle,
          source: c.chunk.metadata.source,
          score: c.score,
        }));
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

  let fullResponse = '';
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) {
      fullResponse += token;
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

  // Audit log entry
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  reportAudit({
    id: requestId,
    timestamp: Date.now(),
    type: 'chat_query',
    query: lastUserMsg?.content,
    retrievedChunks: auditChunks.length > 0 ? auditChunks : undefined,
    responsePreview: fullResponse.slice(0, 200),
  });
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

  if (chunks.length === 0) {
    broadcastStatus({
      type: 'INDEX_ERROR',
      payload: { error: 'No indexable content found (text too short or empty)', requestId },
    });
    return;
  }

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

  reportAudit({
    id: nanoid(),
    timestamp: Date.now(),
    type: 'document_index',
    documentTitle: request.metadata.title,
  });
}

/** Queues a document on indexQueue. Settles once it is stored, or has failed and said so. */
function enqueueIndex(request: IndexDocumentRequest, requestId: string): Promise<void> {
  indexQueue = indexQueue.then(() =>
    handleIndexDocument(request, requestId)
      .catch((err) =>
        broadcastStatus({
          type: 'INDEX_ERROR',
          payload: { error: err.message, requestId },
        })
      )
  );
  return indexQueue;
}

async function handleDeleteDocument(documentId: string): Promise<void> {
  // Looked up first, so the audit log can say what was deleted.
  const doc = await documentStore?.getDocument(documentId);
  await Promise.all([
    vectorStore?.deleteByDocumentId(documentId),
    documentStore?.deleteDocument(documentId),
  ]);
  reportAudit({
    id: nanoid(),
    timestamp: Date.now(),
    type: 'document_delete',
    documentTitle: doc?.title ?? documentId,
  });
}

// ─── Bookmark Import ──────────────────────────────────────────────────────────
// The service worker reads the bookmarks (only it can) and sends them here:
// picking the ones not imported yet takes the queue as well as the store.

const bookmarkImporter = new BookmarkImporter(
  (doc) => enqueueIndex(doc, nanoid()),
  async () => {
    if (!documentStore) throw new Error('Storage not initialized');
    const docs = await documentStore.listDocuments();
    return docs.filter((d) => d.source === 'bookmark' && d.sourcePath).map((d) => d.sourcePath as string);
  },
);

async function importBookmarks(bookmarks: BookmarkInfo[]): Promise<number> {
  // Waits for a load or a Clear All Data in progress, so nothing is queued
  // that can't be indexed and nothing is compared against a store being wiped.
  await initStoresAndEmbeddings();
  return bookmarkImporter.import(bookmarks);
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

  reportAudit({
    id: nanoid(),
    timestamp: Date.now(),
    type: 'search',
    query: request.query,
    retrievedChunks: context.chunks.map((c) => ({
      documentTitle: c.chunk.metadata.documentTitle,
      source: c.chunk.metadata.source,
      score: c.score,
    })),
  });

  return context.chunks;
}

// ─── Voice Handler ────────────────────────────────────────────────────────────

async function ensureVoiceModels(): Promise<{ asr: MoonshineASR; vad: SileroVAD }> {
  if (!sileroVad) {
    sileroVad = new SileroVAD();
    try {
      await sileroVad.load();
    } catch (err) {
      // VAD is optional — without it VoiceSession treats everything as speech
      // and the user ends the recording by hand.
      console.warn('[EdgeAI] VAD failed to load (voice will work without it):', err instanceof Error ? err.message : err);
    }
  }

  if (!moonshineAsr) {
    moonshineAsr = new MoonshineASR();
    await moonshineAsr.load((progress: number) => {
      broadcastStatus({ type: 'MODEL_PROGRESS', payload: { model: 'asr', progress } });
    });
  }

  return { asr: moonshineAsr, vad: sileroVad };
}

async function handleVoiceStart(): Promise<void> {
  // Pre-check microphone permission before attempting getUserMedia.
  // Offscreen documents cannot show permission prompts, so if the state
  // is not 'granted', we fail fast with a clear error that triggers the
  // mic-grant page flow in the popup.
  try {
    const permStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    console.log('[EdgeAI offscreen] Microphone permission state:', permStatus.state);
    if (permStatus.state !== 'granted') {
      throw new Error('Microphone access denied. Allow microphone in Chrome site settings for this extension.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Microphone access denied')) throw err;
    console.warn('[EdgeAI offscreen] permissions.query failed, falling through:', err);
  }

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
      onPartialTranscript: (text) => {
        chrome.runtime.sendMessage({
          type: 'VOICE_PARTIAL',
          payload: { text },
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
    // Catch all mic permission errors including "Permission dismissed" from offscreen documents
    if (
      errName === 'NotAllowedError' ||
      msg.includes('NotAllowedError') ||
      msg.includes('Permission denied') ||
      msg.includes('Permission dismissed') ||
      msg.includes('not allowed')
    ) {
      throw new Error('Microphone access denied. Allow microphone in Chrome site settings for this extension.');
    }
    throw err;
  }
}

// ─── Data Reset ───────────────────────────────────────────────────────────────

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`Could not delete database ${name}`));
    // Another context still holds a connection (the popup keeps the vault-handle
    // database open). Every opener closes itself on `versionchange`, so the
    // delete completes once they have; nothing to do but wait.
    req.onblocked = () => console.warn(`[EdgeAI] deleteDatabase(${name}) blocked — waiting for open connections`);
  });
}

/**
 * Wipe every database in USER_DATABASES — documents and chunks, embeddings and
 * BM25 rows, the saved vault handle — then reopen empty stores so the extension
 * keeps working without a restart. Model files live in the Cache API and are
 * deleted separately (Settings → Delete Downloaded Models).
 *
 * Order matters: wait for any in-flight init and indexing, close our own
 * connections, delete, then reinitialise. _resetPromise keeps a concurrent
 * LOAD_MODEL / RETRY_INIT from reopening a store mid-delete — it would load the
 * old data and write it straight back into the fresh database.
 */
async function clearAllUserData(): Promise<void> {
  if (!_resetPromise) {
    _resetPromise = (async () => {
      if (_initPromise) await _initPromise.catch(() => {});
      await indexQueue.catch(() => {});
      vectorStore?.close();
      documentStore?.close();
      vectorStore = null;
      documentStore = null;
      await Promise.all(USER_DATABASES.map(deleteDatabase));
    })().finally(() => {
      _resetPromise = null;
    });
  }
  await _resetPromise;
  await initStoresAndEmbeddings();
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
            modelId: activeModelId,
            embeddingsReady: !!embeddingModel,
            embeddingsDevice: embeddingModel?.device ?? null,
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
        enqueueIndex(payload as IndexDocumentRequest, requestId ?? nanoid());
        sendResponse({ acknowledged: true });
        return false;

      case 'IMPORT_BOOKMARKS':
        if (!Array.isArray(payload)) { sendResponse({ error: 'No bookmarks' }); return false; }
        // Answers once the new bookmarks are queued; they are indexed one at a time after.
        importBookmarks(payload as BookmarkInfo[])
          .then((added) => sendResponse({ added }))
          .catch((err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
        return true;

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

      case 'CHECK_DOCUMENT_EXISTS': {
        if (!documentStore || !payload) {
          sendResponse({ exists: false });
          return false;
        }
        const checkPath = (payload as { sourcePath: string }).sourcePath;
        documentStore.documentExists(checkPath)
          .then((doc) => sendResponse({ exists: !!doc, documentId: doc?.id }))
          .catch(() => sendResponse({ exists: false }));
        return true;
      }

      case 'CLEAR_ALL_DATA':
        clearAllUserData()
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }));
        return true;

      case 'DELETE_DOCUMENT': {
        const documentId = (payload as { documentId?: unknown } | undefined)?.documentId;
        if (typeof documentId !== 'string') {
          sendResponse({ error: 'No documentId' });
          return false;
        }
        handleDeleteDocument(documentId)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ error: err.message }));
        return true;
      }

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
