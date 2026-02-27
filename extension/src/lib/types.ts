// ─── Message Types ────────────────────────────────────────────────────────────
// All messages flowing through chrome.runtime.sendMessage

export type MessageType =
  | 'KEEPALIVE'
  | 'CHAT'
  | 'CHAT_CHUNK'         // streaming token from LLM
  | 'CHAT_DONE'
  | 'CHAT_ERROR'
  | 'INDEX_DOCUMENT'
  | 'INDEX_PROGRESS'
  | 'INDEX_DONE'
  | 'INDEX_ERROR'
  | 'SEARCH'
  | 'SEARCH_RESULTS'
  | 'GET_STATUS'
  | 'STATUS'
  | 'LOAD_MODEL'
  | 'MODEL_PROGRESS'
  | 'MODEL_READY'
  | 'MODEL_ERROR'
  | 'DELETE_DOCUMENT'
  | 'LIST_DOCUMENTS'
  | 'DOCUMENTS_LIST'
  | 'VOICE_START'
  | 'VOICE_STOP'
  | 'VOICE_PARTIAL'        // streaming partial transcript while recording
  | 'VOICE_TRANSCRIPT'
  | 'VOICE_ERROR'
  | 'GET_PAGE_CONTEXT'
  | 'PAGE_CONTEXT'
  | 'GET_PAGE_CONTENT_FOR_INDEX'
  | 'PAGE_CONTENT_FOR_INDEX'
  | 'RETRY_INIT';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
  requestId?: string;       // for correlating async responses
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  useRag?: boolean;         // whether to augment with personal context
}

export interface ChatChunk {
  token: string;
  requestId: string;
}

export interface ChatDone {
  requestId: string;
  totalTokens?: number;
}

export interface ChatError {
  requestId: string;
  error: string;
}

// ─── Documents & Chunks ───────────────────────────────────────────────────────

export type DocumentSource = 'obsidian' | 'pdf' | 'bookmark' | 'web_page' | 'notion' | 'google_drive' | 'manual' | 'voice_note';

export interface DocumentMetadata {
  id: string;
  title: string;
  source: DocumentSource;
  sourcePath?: string;       // file path or URL
  createdAt: number;         // unix ms
  updatedAt: number;         // unix ms
  charCount: number;
  chunkCount: number;
  tags?: string[];
  preview?: string;          // first ~500 chars of content for quick preview
}

export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];      // 384-dim bge-small-en-v1.5
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  documentId: string;
  documentTitle: string;
  source: DocumentSource;
  sourcePath?: string;
  charOffset: number;
  charEnd: number;
  sectionHeading?: string;
  pageNumber?: number;
  createdAt: number;         // unix ms (document creation time)
}

export interface IndexDocumentRequest {
  content: string;
  metadata: Omit<DocumentMetadata, 'id' | 'charCount' | 'chunkCount'>;
}

export interface IndexProgress {
  documentId: string;
  stage: 'parsing' | 'chunking' | 'embedding' | 'storing';
  progress: number;          // 0–100
}

// ─── Search / Retrieval ───────────────────────────────────────────────────────

export interface SearchRequest {
  query: string;
  topK?: number;             // default 5
  filters?: SearchFilters;
}

export interface SearchFilters {
  sources?: DocumentSource[];
  dateFrom?: number;         // unix ms
  dateTo?: number;           // unix ms
  documentIds?: string[];
}

export interface SearchResult {
  chunk: Chunk;
  score: number;
  rankBm25?: number;
  rankVector?: number;
  rankReranker?: number;
}

export interface RetrievedContext {
  chunks: SearchResult[];
  systemPromptAddition: string;   // pre-formatted context block for LLM
}

// ─── Model Status ─────────────────────────────────────────────────────────────

export type ModelStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'error';

export interface ModelState {
  llm: ModelStatus;
  embeddings: ModelStatus;
  reranker: ModelStatus;
  asr: ModelStatus;
  vad: ModelStatus;
  llmProgress?: number;       // 0–100 download progress
  llmModel?: string;
  error?: string;
}

export interface ExtensionStatus {
  models: ModelState;
  documentCount: number;
  chunkCount: number;
  indexedBytes: number;
  version: string;
}

// ─── Voice ────────────────────────────────────────────────────────────────────

export type VoiceIntent = 'note' | 'search' | 'ask' | 'remind' | 'unknown';

export interface VoiceTranscript {
  text: string;
  intent: VoiceIntent;
  confidence: number;
}

// ─── Service Interfaces (DIP) ─────────────────────────────────────────────────
// Depend on these interfaces rather than concrete classes to keep modules
// independently testable and swappable (e.g. replace Orama with PGlite).

export interface IVectorStore {
  init(): Promise<void>;
  addChunks(chunks: Chunk[]): Promise<void>;
  deleteByDocumentId(documentId: string): Promise<void>;
  searchBm25(query: string, limit?: number, filters?: SearchFilters): Promise<Array<Chunk & { id: string }>>;
  searchVector(queryEmbedding: number[], limit?: number, filters?: SearchFilters): Promise<Array<Chunk & { id: string }>>;
}

export interface IEmbeddingModel {
  load(onProgress?: (progress: number) => void): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface IRerankerModel {
  load(onProgress?: (progress: number) => void): Promise<void>;
  rerank(query: string, passages: string[]): Promise<number[]>;
}

export interface IDocumentStore {
  open(): Promise<void>;
  addDocument(doc: DocumentMetadata): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  getDocument(id: string): Promise<DocumentMetadata | undefined>;
  listDocuments(): Promise<DocumentMetadata[]>;
  getStats(): Promise<{ documentCount: number; totalChunks: number; totalChars: number }>;
  documentExists(sourcePath: string): Promise<DocumentMetadata | undefined>;
}

// ─── Page Context ─────────────────────────────────────────────────────────────

export interface PageContext {
  url: string;
  title: string;
  selectedText?: string;
  visibleText?: string;       // truncated visible content
}

export interface PageContentForIndex {
  url: string;
  title: string;
  content: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface EdgeAISettings {
  ttsEnabled: boolean;          // auto-speak assistant responses
  ttsSpeed: number;             // 0.8 – 1.5, default 1.0
  ttsVoiceName: string | null;  // null = system default
}

export const DEFAULT_SETTINGS: EdgeAISettings = {
  ttsEnabled: false,
  ttsSpeed: 1.0,
  ttsVoiceName: null,
};
