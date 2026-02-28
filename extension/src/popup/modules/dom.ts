/**
 * DOM helpers, element refs, and small utilities used across popup modules.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const $ = (id: string) => document.getElementById(id)!;

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Source Icons ────────────────────────────────────────────────────────────

export const SOURCE_ICONS: Record<string, string> = {
  obsidian: '🗃️',
  pdf: '📄',
  bookmark: '🔖',
  notion: '📝',
  google_drive: '📂',
  manual: '✏️',
  voice_note: '🎙️',
  web_page: '🌐',
};

export function sourceIcon(source: string): string {
  return SOURCE_ICONS[source] ?? '📄';
}

// ─── Toast ───────────────────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, duration = 3000): void {
  const indexToast = $('index-toast');
  indexToast.textContent = message;
  indexToast.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    indexToast.classList.remove('visible');
    toastTimer = null;
  }, duration);
}

// ─── Element Refs ────────────────────────────────────────────────────────────
// Lazy-evaluated via $() at module load time (popup.ts imports after DOMContentLoaded).

export const statusDot = $('status-dot');
export const statusText = $('status-text');
export const statusModel = $('status-model');
export const modelLoadingState = $('model-loading-state');
export const modelStatusText = $('model-status-text');
export const modelProgressPct = $('model-progress-pct');
export const modelProgressFill = $('model-progress-fill') as HTMLElement;
export const stepEmbeddings = $('step-embeddings');
export const stepLlm = $('step-llm');
export const errorBanner = $('error-banner');
export const errorBannerMsg = $('error-banner-msg');
export const btnRetry = $('btn-retry') as HTMLButtonElement;

export const chatMessages = $('chat-messages');
export const chatInput = $('chat-input') as HTMLTextAreaElement;
export const btnSend = $('btn-send') as HTMLButtonElement;
export const btnVoice = $('btn-voice') as HTMLButtonElement;
export const inputBar = $('input-bar');

export const btnImportObsidian = $('btn-import-obsidian') as HTMLButtonElement;
export const btnImportPdf = $('btn-import-pdf') as HTMLButtonElement;
export const btnImportBookmarks = $('btn-import-bookmarks') as HTMLButtonElement;
export const pdfFileInput = $('pdf-file-input') as HTMLInputElement;

// Preview modal refs
export const previewModal = $('preview-modal');
export const previewModalTitle = $('preview-modal-title');
export const previewModalMeta = $('preview-modal-meta');
export const previewModalBody = $('preview-modal-body');
export const previewModalClose = $('preview-modal-close');
export const previewModalDelete = $('preview-modal-delete');
export const previewSourceIcon = $('preview-source-icon');
export const previewFooterNote = $('preview-modal-footer-note');
