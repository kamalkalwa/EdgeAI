/**
 * Popup — Main UI controller
 *
 * Communicates with the offscreen document via chrome.runtime.sendMessage.
 * Handles tabs, chat, import flows, document preview, and the trust panel.
 */

import type { Message, ChatMessage, DocumentMetadata } from '@/lib/types';
import { formatBytes } from '@/lib/utils';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  modelReady: false,
  embeddingsReady: false,
  isStreaming: false,
  conversationHistory: [] as ChatMessage[],
  activeTab: 'chat',
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;

const statusDot = $('status-dot');
const statusText = $('status-text');
const statusModel = $('status-model');
const modelLoadingState = $('model-loading-state');
const modelStatusText = $('model-status-text');
const embeddingsBadge = $('embeddings-badge');
const modelProgressPct = $('model-progress-pct');
const modelProgressFill = $('model-progress-fill') as HTMLElement;

const chatMessages = $('chat-messages');
const chatInput = $('chat-input') as HTMLTextAreaElement;
const btnSend = $('btn-send') as HTMLButtonElement;
const btnVoice = $('btn-voice') as HTMLButtonElement;
const inputBar = $('input-bar');

const btnImportObsidian = $('btn-import-obsidian') as HTMLButtonElement;
const btnImportPdf = $('btn-import-pdf') as HTMLButtonElement;
const btnImportBookmarks = $('btn-import-bookmarks') as HTMLButtonElement;
const pdfFileInput = $('pdf-file-input') as HTMLInputElement;

// Preview modal refs
const previewModal = $('preview-modal');
const previewModalTitle = $('preview-modal-title');
const previewModalMeta = $('preview-modal-meta');
const previewModalBody = $('preview-modal-body');
const previewModalClose = $('preview-modal-close');
const previewModalDelete = $('preview-modal-delete');
const previewSourceIcon = $('preview-source-icon');
const previewFooterNote = $('preview-modal-footer-note');

// ─── Source Icon Map ──────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, string> = {
  obsidian: '🗃️',
  pdf: '📄',
  bookmark: '🔖',
  notion: '📝',
  google_drive: '📂',
  manual: '✏️',
  voice_note: '🎙️',
};

function sourceIcon(source: string): string {
  return SOURCE_ICONS[source] ?? '📄';
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = (tab as HTMLElement).dataset['tab'];
    if (!tabName) return;

    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    document.getElementById(`pane-${tabName}`)?.classList.add('active');

    inputBar.style.display = tabName === 'chat' ? 'flex' : 'none';
    state.activeTab = tabName;

    if (tabName === 'docs') loadDocumentsList();
    if (tabName === 'trust') loadTrustStats();
  });
});

// ─── Chat ─────────────────────────────────────────────────────────────────────

function appendMessage(role: 'user' | 'assistant' | 'system-notice', content: string): HTMLElement {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = content;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function removeWelcomeMessage(): void {
  document.getElementById('welcome-msg')?.remove();
}

async function sendChat(): Promise<void> {
  const text = chatInput.value.trim();
  if (!text || state.isStreaming) return;

  removeWelcomeMessage();
  chatInput.value = '';
  chatInput.style.height = '';

  state.conversationHistory.push({ role: 'user', content: text });
  appendMessage('user', text);

  const assistantBubble = appendMessage('assistant', '');
  assistantBubble.textContent = '…';

  state.isStreaming = true;
  btnSend.disabled = true;

  const requestId = crypto.randomUUID();
  let assistantContent = '';

  // Set up streaming listener
  const cleanup = () => {
    clearTimeout(streamingTimeout);
    chrome.runtime.onMessage.removeListener(onChunk);
  };

  const onChunk = (message: Message) => {
    if (message.type === 'CHAT_CHUNK') {
      const { token, requestId: rid } = message.payload as { token: string; requestId: string };
      if (rid !== requestId) return;

      if (assistantContent === '' && assistantBubble.textContent === '…') {
        assistantBubble.textContent = '';
      }
      assistantContent += token;
      assistantBubble.textContent = assistantContent;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    if (message.type === 'CHAT_DONE') {
      const { requestId: rid } = message.payload as { requestId: string };
      if (rid !== requestId) return;

      state.conversationHistory.push({ role: 'assistant', content: assistantContent });
      state.isStreaming = false;
      btnSend.disabled = false;
      cleanup();
    }

    if (message.type === 'CHAT_ERROR') {
      const { requestId: rid, error } = message.payload as { requestId: string; error: string };
      if (rid !== requestId) return;

      assistantBubble.textContent = `Error: ${error}`;
      assistantBubble.style.color = 'var(--red)';
      state.isStreaming = false;
      btnSend.disabled = false;
      cleanup();
    }
  };

  // Safety net: remove listener if offscreen crashes before CHAT_DONE/CHAT_ERROR
  const STREAM_TIMEOUT_MS = 120_000;
  const streamingTimeout = setTimeout(() => {
    chrome.runtime.onMessage.removeListener(onChunk);
    if (state.isStreaming) {
      assistantBubble.textContent += '\n[Response timed out]';
      state.isStreaming = false;
      btnSend.disabled = false;
    }
  }, STREAM_TIMEOUT_MS);

  chrome.runtime.onMessage.addListener(onChunk);

  await chrome.runtime.sendMessage({
    type: 'CHAT',
    requestId,
    payload: {
      messages: state.conversationHistory.slice(-10), // keep last 10 turns
      useRag: true,
    },
  });
}

btnSend.addEventListener('click', sendChat);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
  chatInput.style.height = '';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 80) + 'px';
});

// ─── Voice Input ─────────────────────────────────────────────────────────────

let voiceActive = false;

btnVoice.addEventListener('click', async () => {
  if (!voiceActive) {
    await chrome.runtime.sendMessage({ type: 'VOICE_START' });
    btnVoice.classList.add('active');
    btnVoice.title = 'Stop recording';
    voiceActive = true;
  } else {
    await chrome.runtime.sendMessage({ type: 'VOICE_STOP' });
    btnVoice.classList.remove('active');
    btnVoice.title = 'Voice input (hold to record)';
    voiceActive = false;
  }
});

// Listen for voice transcript
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'VOICE_TRANSCRIPT') {
    const { text } = message.payload as { text: string };
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input'));
    btnVoice.classList.remove('active');
    voiceActive = false;
    sendChat();
  }
});

// ─── Model Progress ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'MODEL_PROGRESS') {
    const { model, progress, text } = message.payload as {
      model: string;
      progress: number;
      text?: string;
    };

    if (model === 'embeddings') {
      const pct = `${Math.round(progress)}%`;
      modelProgressPct.textContent = pct;
      modelProgressFill.style.width = pct;
      modelStatusText.textContent = `Loading embeddings… ${pct}`;
    }

    if (model === 'reranker') {
      modelStatusText.textContent = `Loading reranker… ${Math.round(progress)}%`;
    }

    if (model === 'llm') {
      const pct = `${progress}%`;
      modelProgressPct.textContent = pct;
      modelProgressFill.style.width = pct;
      modelStatusText.textContent = text ?? `Loading AI model… ${pct}`;
    }
  }

  if (message.type === 'MODEL_READY') {
    const { model } = message.payload as { model: string; modelId?: string };

    if (model === 'embeddings_and_reranker') {
      state.embeddingsReady = true;
      embeddingsBadge.textContent = 'Embeddings ✓';
      embeddingsBadge.className = 'model-status-badge done';
      // modelLoadingState stays visible — LLM still loading
      statusDot.className = 'logo-dot loading';
      statusText.textContent = 'Loading LLM…';
    }

    if (model === 'llm') {
      state.modelReady = true;
      modelLoadingState.style.display = 'none';
      statusDot.className = 'logo-dot'; // green pulse
      statusText.textContent = 'Ready';
      statusModel.textContent = 'Local AI';
      btnSend.disabled = false;
    }
  }

  if (message.type === 'MODEL_ERROR') {
    const { error } = message.payload as { error: string };
    statusDot.className = 'logo-dot error';
    statusText.textContent = `Error: ${error}`;
    modelStatusText.textContent = `Failed: ${error}`;
  }
});

// ─── Import ───────────────────────────────────────────────────────────────────

// Show a temporary "not ready" message on an import button. Returns true if blocked.
function checkModelsReady(btn: HTMLButtonElement): boolean {
  if (state.embeddingsReady) return false; // embeddings ready — imports are safe
  const label = btn.querySelector('.label');
  if (label) {
    const orig = label.textContent;
    label.textContent = 'Wait: loading embeddings…';
    setTimeout(() => { label.textContent = orig; }, 3000);
  }
  return true; // blocked
}

function setImportProgress(progressEl: HTMLElement, active: boolean, indeterminate = false): void {
  if (active) {
    progressEl.classList.add('active');
    if (indeterminate) progressEl.classList.add('indeterminate');
    else progressEl.classList.remove('indeterminate');
  } else {
    progressEl.classList.remove('active', 'indeterminate');
    const fill = progressEl.querySelector('.import-progress-fill') as HTMLElement | null;
    if (fill) fill.style.width = '0%';
  }
}

// Listen for indexing errors and surface them in the UI.
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'INDEX_ERROR') {
    const { error } = (message.payload ?? {}) as { error?: string };
    appendMessage('system-notice', `Import failed: ${error ?? 'Unknown error'}`);
  }
});

btnImportObsidian.addEventListener('click', async () => {
  if (checkModelsReady(btnImportObsidian)) return;

  const progressEl = $('obsidian-progress');
  try {
    btnImportObsidian.disabled = true;
    btnImportObsidian.querySelector('.label')!.textContent = 'Opening vault…';
    setImportProgress(progressEl, true, true);

    const { selectVault, readVault } = await import('@/lib/connectors/obsidian');
    const vaultHandle = await selectVault();

    let count = 0;
    btnImportObsidian.querySelector('.label')!.textContent = 'Indexing…';

    for await (const doc of readVault(vaultHandle)) {
      await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
      count++;
      btnImportObsidian.querySelector('.label')!.textContent = `Indexing… ${count} files`;
    }

    setImportProgress(progressEl, false);
    btnImportObsidian.querySelector('.label')!.textContent = `✓ ${count} files indexed`;
    setTimeout(() => {
      btnImportObsidian.querySelector('.label')!.textContent = 'Obsidian Vault';
      btnImportObsidian.disabled = false;
    }, 3000);
  } catch (err) {
    setImportProgress(progressEl, false);
    console.error(err);
    btnImportObsidian.querySelector('.label')!.textContent = 'Obsidian Vault';
    btnImportObsidian.disabled = false;
  }
});

btnImportPdf.addEventListener('click', () => {
  pdfFileInput.click();
});

pdfFileInput.addEventListener('change', async () => {
  const files = pdfFileInput.files;
  if (!files || files.length === 0) return;
  if (checkModelsReady(btnImportPdf)) { pdfFileInput.value = ''; return; }

  const progressEl = $('pdf-progress');
  btnImportPdf.disabled = true;
  setImportProgress(progressEl, true, true);

  const { indexPdfFiles } = await import('@/lib/connectors/pdf');
  let count = 0;

  try {
    for await (const doc of indexPdfFiles(files)) {
      await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
      count++;
      btnImportPdf.querySelector('.label')!.textContent = `Indexing… ${count} / ${files.length} PDFs`;
    }
  } catch (err) {
    console.error(err);
  }

  setImportProgress(progressEl, false);
  btnImportPdf.querySelector('.label')!.textContent = `✓ ${count} PDFs indexed`;
  pdfFileInput.value = '';
  setTimeout(() => {
    btnImportPdf.querySelector('.label')!.textContent = 'PDF Files';
    btnImportPdf.disabled = false;
  }, 3000);
});

btnImportBookmarks.addEventListener('click', async () => {
  if (checkModelsReady(btnImportBookmarks)) return;

  const progressEl = $('bookmarks-progress');
  btnImportBookmarks.disabled = true;
  btnImportBookmarks.querySelector('.label')!.textContent = 'Importing bookmarks…';
  setImportProgress(progressEl, true, true);

  const { indexBookmarkMetadataOnly } = await import('@/lib/connectors/bookmarks');
  let count = 0;

  try {
    for await (const doc of indexBookmarkMetadataOnly()) {
      await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
      count++;
    }
  } catch (err) {
    console.error(err);
  }

  setImportProgress(progressEl, false);
  btnImportBookmarks.querySelector('.label')!.textContent = `✓ ${count} bookmarks`;
  setTimeout(() => {
    btnImportBookmarks.querySelector('.label')!.textContent = 'Chrome Bookmarks';
    btnImportBookmarks.disabled = false;
  }, 3000);
});

// ─── Document Preview Modal ───────────────────────────────────────────────────

let previewDocId: string | null = null;

function openPreview(doc: DocumentMetadata): void {
  previewDocId = doc.id;

  previewSourceIcon.textContent = sourceIcon(doc.source);
  previewModalTitle.textContent = doc.title;

  const date = new Date(doc.updatedAt).toLocaleDateString();
  previewModalMeta.textContent = `${doc.source} · ${doc.chunkCount} chunks · ${formatBytes(doc.charCount)} · ${date}`;

  if (doc.preview) {
    previewModalBody.textContent = doc.preview;
    const truncated = doc.charCount > 500;
    previewFooterNote.textContent = truncated
      ? `Showing first 500 of ${doc.charCount.toLocaleString()} characters`
      : `${doc.charCount.toLocaleString()} characters total`;
  } else {
    previewModalBody.textContent = '(No preview available — re-import to generate one)';
    previewFooterNote.textContent = '';
  }

  previewModal.classList.remove('hidden');
}

function closePreview(): void {
  previewModal.classList.add('hidden');
  previewDocId = null;
}

previewModalClose.addEventListener('click', closePreview);

// Close on backdrop click (outside the modal box)
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) closePreview();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
    closePreview();
  }
});

previewModalDelete.addEventListener('click', async () => {
  if (!previewDocId) return;

  // Confirm state — button text changes to confirm
  if (previewModalDelete.dataset['confirm'] !== 'true') {
    previewModalDelete.textContent = 'Confirm delete';
    previewModalDelete.dataset['confirm'] = 'true';
    setTimeout(() => {
      previewModalDelete.textContent = 'Delete document';
      delete previewModalDelete.dataset['confirm'];
    }, 3000);
    return;
  }

  await chrome.runtime.sendMessage({
    type: 'DELETE_DOCUMENT',
    payload: { documentId: previewDocId },
  });

  closePreview();
  loadDocumentsList(); // refresh list
});

// ─── Documents List ───────────────────────────────────────────────────────────

async function loadDocumentsList(): Promise<void> {
  const docsList = $('docs-list');
  const docsToolbar = $('docs-toolbar');
  docsList.innerHTML = '<div class="empty-state"><div style="font-size:20px">⏳</div><p>Loading…</p></div>';
  docsToolbar.style.display = 'none';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'LIST_DOCUMENTS' });
    const docs = (response?.payload ?? []) as DocumentMetadata[];

    if (docs.length === 0) {
      docsList.innerHTML = `
        <div class="empty-state">
          <div style="font-size:32px">📭</div>
          <p>No documents indexed yet.<br>Import your Obsidian vault or PDFs to get started.</p>
        </div>`;
      return;
    }

    // Show toolbar with count
    docsToolbar.style.display = 'flex';
    $('docs-count').textContent = `${docs.length} document${docs.length === 1 ? '' : 's'}`;

    docsList.innerHTML = '';
    for (const doc of docs) {
      const item = document.createElement('div');
      item.className = 'doc-item';

      // Source icon
      const docSourceIcon = document.createElement('div');
      docSourceIcon.className = 'doc-source-icon';
      docSourceIcon.textContent = sourceIcon(doc.source);

      // Info group
      const docInfo = document.createElement('div');
      docInfo.className = 'doc-info';

      const docTitle = document.createElement('div');
      docTitle.className = 'doc-title';
      docTitle.textContent = doc.title;   // textContent is XSS-safe

      const docMeta = document.createElement('div');
      docMeta.className = 'doc-meta';
      const date = new Date(doc.updatedAt).toLocaleDateString();
      docMeta.textContent = `${Number(doc.chunkCount)} chunks · ${formatBytes(Number(doc.charCount))} · ${date}`;

      docInfo.appendChild(docTitle);
      docInfo.appendChild(docMeta);

      // Action buttons (preview + delete)
      const actions = document.createElement('div');
      actions.className = 'doc-actions';

      // Preview button (eye icon)
      const previewBtn = document.createElement('button');
      previewBtn.className = 'doc-action-btn preview-btn';
      previewBtn.title = 'Preview content';
      previewBtn.setAttribute('aria-label', 'Preview document');
      previewBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>`;
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPreview(doc);
      });

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'doc-action-btn delete-btn';
      deleteBtn.title = 'Delete document';
      deleteBtn.setAttribute('aria-label', 'Delete document');
      deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
      </svg>`;
      deleteBtn.dataset['id'] = escapeHtml(String(doc.id));

      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const docId = (e.currentTarget as HTMLElement).dataset['id'];
        if (!docId) return;
        await chrome.runtime.sendMessage({ type: 'DELETE_DOCUMENT', payload: { documentId: docId } });
        item.remove();
        // Update count
        const remaining = docsList.querySelectorAll('.doc-item').length;
        if (remaining === 0) {
          docsToolbar.style.display = 'none';
          docsList.innerHTML = `
            <div class="empty-state">
              <div style="font-size:32px">📭</div>
              <p>No documents indexed yet.<br>Import your Obsidian vault or PDFs to get started.</p>
            </div>`;
        } else {
          $('docs-count').textContent = `${remaining} document${remaining === 1 ? '' : 's'}`;
        }
      });

      actions.appendChild(previewBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(docSourceIcon);
      item.appendChild(docInfo);
      item.appendChild(actions);
      docsList.appendChild(item);
    }
  } catch {
    docsList.innerHTML = '<div class="empty-state"><p>Failed to load documents.</p></div>';
  }
}

// Refresh button in docs toolbar
$('btn-refresh-docs').addEventListener('click', loadDocumentsList);

// ─── Trust Panel ──────────────────────────────────────────────────────────────

async function loadTrustStats(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: 'LIST_DOCUMENTS' }).catch(() => null);
  const docs = (response?.payload ?? []) as DocumentMetadata[];

  const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);
  const totalChars = docs.reduce((sum, d) => sum + d.charCount, 0);

  $('trust-docs').textContent = String(docs.length);
  $('trust-chunks').textContent = totalChunks.toLocaleString();
  $('trust-storage').textContent = formatBytes(totalChars * 2); // ~2 bytes/char estimate

  // Storage API for more accurate size
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    if (est.usage) {
      $('trust-storage').textContent = formatBytes(est.usage);
    }
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Request status from offscreen document
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }).catch(() => null);

  if (status?.payload?.llmReady) {
    // Both models ready
    state.modelReady = true;
    state.embeddingsReady = true;
    modelLoadingState.style.display = 'none';
    statusDot.className = 'logo-dot';
    statusText.textContent = 'Ready';
    statusModel.textContent = 'Local AI';
    btnSend.disabled = false;
  } else if (status?.payload?.embeddingsReady) {
    // Embeddings loaded — imports are safe; LLM still loading
    state.embeddingsReady = true;
    embeddingsBadge.textContent = 'Embeddings ✓';
    embeddingsBadge.className = 'model-status-badge done';
    statusDot.className = 'logo-dot loading';
    statusText.textContent = 'Loading LLM…';
    // Trigger LLM load
    chrome.runtime.sendMessage({ type: 'LOAD_MODEL' }).catch(console.error);
  } else {
    // Not started yet — trigger full initialization
    statusText.textContent = 'Loading embeddings…';
    chrome.runtime.sendMessage({ type: 'LOAD_MODEL' }).catch(console.error);
  }

  chatInput.focus();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init().catch(console.error);
