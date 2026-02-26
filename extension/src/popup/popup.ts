/**
 * Popup — Main UI controller
 *
 * Communicates with the offscreen document via chrome.runtime.sendMessage.
 * Handles tabs, chat, import flows, document preview, and the trust panel.
 */

import type { Message, ChatMessage, DocumentMetadata } from '@/lib/types';
import { formatBytes } from '@/lib/utils';

// ─── State ────────────────────────────────────────────────────────────────────

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

const state = {
  modelReady: false,
  embeddingsReady: false,
  isStreaming: false,
  conversationHistory: [] as ChatMessage[],
  activeTab: 'chat',
  currentSessionId: '',
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;

const statusDot = $('status-dot');
const statusText = $('status-text');
const statusModel = $('status-model');
const modelLoadingState = $('model-loading-state');
const modelStatusText = $('model-status-text');
const modelProgressPct = $('model-progress-pct');
const modelProgressFill = $('model-progress-fill') as HTMLElement;
const stepEmbeddings = $('step-embeddings');
const stepLlm = $('step-llm');
const errorBanner = $('error-banner');
const errorBannerMsg = $('error-banner-msg');
const btnRetry = $('btn-retry') as HTMLButtonElement;

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

    const tabsEl = document.querySelector('.tabs')!;
    const tabs = Array.from(tabsEl.querySelectorAll('.tab'));

    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    // Sliding underline position
    const idx = tabs.indexOf(tab as Element);
    tabsEl.setAttribute('data-active-index', String(idx));

    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    document.getElementById(`pane-${tabName}`)?.classList.add('active');

    inputBar.style.display = tabName === 'chat' ? 'flex' : 'none';
    // Also hide/show voice indicator when switching tabs
    $('voice-indicator').style.display = tabName === 'chat' ? '' : 'none';
    state.activeTab = tabName;

    if (tabName === 'docs') loadDocumentsList();
    if (tabName === 'trust') loadTrustStats();
  });
});

// ─── Chat ─────────────────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return escapeHtml(text)
    // Code blocks: ```...```
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="md-code-block"><code>$2</code></pre>')
    // Inline code: `...`
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    // Bold: **...**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Unordered lists: lines starting with - or *
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li>[\s\S]*?<\/li>(?:\n|<br>)?)+/g, (match) => `<ul class="md-list">${match}</ul>`)
    // Line breaks
    .replace(/\n/g, '<br>');
}

const AI_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
  <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
</svg>`;

function appendMessage(role: 'user' | 'assistant' | 'system-notice', content: string): HTMLElement {
  if (role === 'system-notice') {
    const div = document.createElement('div');
    div.className = 'message system-notice';
    div.textContent = content;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = AI_AVATAR_SVG;
    wrapper.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = content;
  wrapper.appendChild(bubble);

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble; // return bubble so streaming textContent updates work
}

function removeWelcomeMessage(): void {
  document.getElementById('welcome-msg')?.remove();
}

async function sendChat(): Promise<void> {
  const text = chatInput.value.trim();
  if (!text || state.isStreaming) return;

  if (!state.modelReady) {
    appendMessage('system-notice', 'AI model is still loading. Please wait for setup to complete.');
    return;
  }

  removeWelcomeMessage();
  chatInput.value = '';
  chatInput.style.height = '';

  state.conversationHistory.push({ role: 'user', content: text });
  appendMessage('user', text);

  const assistantBubble = appendMessage('assistant', '');
  assistantBubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

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

      // Clear typing indicator on first token
      if (assistantContent === '' && assistantBubble.querySelector('.typing-indicator')) {
        assistantBubble.innerHTML = '';
      }
      assistantContent += token;
      assistantBubble.textContent = assistantContent;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    if (message.type === 'CHAT_DONE') {
      const { requestId: rid } = message.payload as { requestId: string };
      if (rid !== requestId) return;

      state.conversationHistory.push({ role: 'assistant', content: assistantContent });
      // Apply markdown rendering now that streaming is complete
      assistantBubble.innerHTML = renderMarkdown(assistantContent);
      state.isStreaming = false;
      btnSend.disabled = false;
      saveChatHistory();
      cleanup();
    }

    if (message.type === 'CHAT_ERROR') {
      const { requestId: rid, error } = message.payload as { requestId: string; error: string };
      if (rid !== requestId) return;

      // Show user-friendly error instead of raw message
      let userMsg = error;
      if (error.includes('LLM not loaded')) {
        userMsg = 'The AI model is still loading. Please wait for setup to complete and try again.';
      } else if (error.includes('Storage not initialized')) {
        userMsg = 'Storage is still initializing. Please try again in a moment.';
      }
      assistantBubble.textContent = userMsg;
      assistantBubble.style.color = 'var(--red)';
      assistantBubble.style.fontSize = '12px';
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
let voiceModelsLoading = false;
let voiceRecordStart = 0;

const voiceIndicator = $('voice-indicator');

function resetVoiceUI(): void {
  btnVoice.classList.remove('voice-loading', 'recording', 'active');
  btnVoice.title = 'Voice input (click to record)';
  voiceIndicator.classList.remove('active');
  voiceActive = false;
  voiceModelsLoading = false;
}

btnVoice.addEventListener('click', async () => {
  if (voiceModelsLoading) return;

  if (!voiceActive) {
    // Show loading state while voice models initialize
    btnVoice.classList.add('voice-loading');
    voiceModelsLoading = true;

    let response: { ready?: boolean; error?: string } | undefined;
    try {
      response = await chrome.runtime.sendMessage({ type: 'VOICE_START' });
    } catch {
      resetVoiceUI();
      appendMessage('system-notice', 'Could not start voice input. Please try again.');
      return;
    }

    if (response?.error) {
      resetVoiceUI();
      console.warn('[EdgeAI popup] Voice start error response:', response.error);
      // Mic permission denied — open a full tab where the browser permission
      // prompt works (extension popups close when the prompt steals focus).
      const isMicError = response.error.includes('denied') ||
        response.error.includes('dismissed') ||
        response.error.includes('NotAllowed') ||
        response.error.includes('Microphone') ||
        response.error.includes('not allowed');
      console.log('[EdgeAI popup] isMicError:', isMicError, '| error text:', response.error);
      if (isMicError) {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/mic-grant/mic-grant.html') });
        appendMessage('system-notice', 'Please grant microphone access in the tab that just opened, then try voice input again.');
      } else {
        appendMessage('system-notice', response.error);
      }
      return;
    }

    btnVoice.classList.remove('voice-loading');
    voiceModelsLoading = false;

    btnVoice.classList.add('recording', 'active');
    btnVoice.title = 'Stop recording';
    voiceIndicator.classList.add('active');
    voiceActive = true;
    voiceRecordStart = Date.now();
  } else {
    // Guard against very short recordings
    if (Date.now() - voiceRecordStart < 500) {
      appendMessage('system-notice', 'Recording too short — hold for at least 1 second.');
    }
    await chrome.runtime.sendMessage({ type: 'VOICE_STOP' });
    btnVoice.classList.remove('recording');
    btnVoice.title = 'Processing…';
    // UI stays in "active" state until VOICE_TRANSCRIPT or VOICE_ERROR arrives
  }
});

// Listen for voice partial transcripts, final transcript, and errors
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'VOICE_PARTIAL') {
    const { text } = message.payload as { text: string };
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input'));
  }

  if (message.type === 'VOICE_TRANSCRIPT') {
    const { text } = message.payload as { text: string };
    chatInput.value = text;
    chatInput.dispatchEvent(new Event('input'));
    resetVoiceUI();
    sendChat();
  }

  if (message.type === 'VOICE_ERROR') {
    const { error } = message.payload as { error: string };
    resetVoiceUI();
    appendMessage('system-notice', error);
  }
});

// ─── Model Progress ───────────────────────────────────────────────────────────

function setStep(stepEl: HTMLElement, status: 'pending' | 'active' | 'done' | 'error'): void {
  stepEl.classList.remove('active', 'done', 'error');
  if (status !== 'pending') stepEl.classList.add(status);
  const indicator = stepEl.querySelector('.step-indicator')!;
  if (status === 'done') indicator.textContent = '✓';
  else if (status === 'error') indicator.textContent = '✕';
}

function showErrorBanner(msg: string): void {
  errorBanner.classList.add('visible');
  errorBannerMsg.textContent = msg;
  modelProgressFill.classList.add('error');
}

function hideErrorBanner(): void {
  errorBanner.classList.remove('visible');
  errorBannerMsg.textContent = '';
  modelProgressFill.classList.remove('error');
}

btnRetry.addEventListener('click', async () => {
  btnRetry.disabled = true;
  btnRetry.textContent = 'Retrying…';
  hideErrorBanner();
  setStep(stepEmbeddings, state.embeddingsReady ? 'done' : 'active');
  setStep(stepLlm, 'pending');
  modelProgressFill.style.width = '0%';
  modelProgressPct.textContent = '';
  modelStatusText.textContent = 'Retrying…';
  statusDot.className = 'logo-dot loading';
  statusText.textContent = 'Retrying…';

  await chrome.runtime.sendMessage({ type: 'RETRY_INIT' }).catch(console.error);

  // Re-enable after a short delay (actual progress will come via messages)
  setTimeout(() => {
    btnRetry.disabled = false;
    btnRetry.textContent = 'Retry';
  }, 3000);
});

chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'MODEL_PROGRESS') {
    const { model, progress, text } = message.payload as {
      model: string;
      progress: number;
      text?: string;
    };

    hideErrorBanner();

    if (model === 'embeddings') {
      const pct = `${Math.round(progress)}%`;
      modelProgressPct.textContent = pct;
      modelProgressFill.style.width = pct;
      modelStatusText.textContent = `Loading text understanding… ${pct}`;
      setStep(stepEmbeddings, 'active');
    }

    if (model === 'reranker') {
      modelStatusText.textContent = `Loading reranker… ${Math.round(progress)}%`;
    }

    if (model === 'llm') {
      const pct = `${progress}%`;
      modelProgressPct.textContent = pct;
      modelProgressFill.style.width = pct;
      modelStatusText.textContent = text ?? `Loading AI model… ${pct}`;
      setStep(stepEmbeddings, 'done');
      setStep(stepLlm, 'active');
    }
  }

  if (message.type === 'MODEL_READY') {
    const { model } = message.payload as { model: string; modelId?: string };

    if (model === 'embeddings_and_reranker') {
      state.embeddingsReady = true;
      setStep(stepEmbeddings, 'done');
      setStep(stepLlm, 'active');
      statusDot.className = 'logo-dot loading';
      statusText.textContent = 'Loading AI model…';
      modelStatusText.textContent = 'Loading AI model…';
      modelProgressFill.style.width = '0%';
      modelProgressPct.textContent = '';
    }

    if (model === 'llm') {
      state.modelReady = true;
      setStep(stepLlm, 'done');
      modelLoadingState.style.display = 'none';
      statusDot.className = 'logo-dot'; // green pulse
      statusText.textContent = 'Ready';
      statusModel.textContent = 'Local AI';
      btnSend.disabled = false;
      chatInput.placeholder = 'Ask anything… (Enter to send, Shift+Enter for newline)';
    }
  }

  if (message.type === 'MODEL_ERROR') {
    const { error, stage } = message.payload as { error: string; stage?: string; canRetry?: boolean };
    statusDot.className = 'logo-dot error';
    statusText.textContent = 'Setup failed';
    modelStatusText.textContent = 'Failed to load';

    if (stage === 'embeddings' || !state.embeddingsReady) {
      setStep(stepEmbeddings, 'error');
    } else {
      setStep(stepLlm, 'error');
    }

    showErrorBanner(error);
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

// ─── Chat Session Persistence ────────────────────────────────────────────────
// Multi-session chat history stored in chrome.storage.local:
//   chatSessionIndex: ChatSession[]
//   chatSession_<id>: ChatMessage[]
//   activeSessionId: string

const MAX_PERSISTED_MESSAGES = 50;
const MAX_SESSIONS = 20;

function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function sessionTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  return firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '…' : '');
}

async function getSessionIndex(): Promise<ChatSession[]> {
  const result = await chrome.storage.local.get('chatSessionIndex').catch(() => null);
  return (result?.chatSessionIndex as ChatSession[] | undefined) ?? [];
}

async function saveSessionIndex(index: ChatSession[]): Promise<void> {
  await chrome.storage.local.set({ chatSessionIndex: index.slice(0, MAX_SESSIONS) }).catch(console.error);
}

async function saveChatHistory(): Promise<void> {
  if (!state.currentSessionId || state.conversationHistory.length === 0) return;

  const messages = state.conversationHistory.slice(-MAX_PERSISTED_MESSAGES);
  const key = `chatSession_${state.currentSessionId}`;
  await chrome.storage.local.set({ [key]: messages, activeSessionId: state.currentSessionId }).catch(console.error);

  // Update session index
  const index = await getSessionIndex();
  const existing = index.findIndex((s) => s.id === state.currentSessionId);
  const meta: ChatSession = {
    id: state.currentSessionId,
    title: sessionTitle(messages),
    updatedAt: Date.now(),
    messageCount: messages.length,
  };
  if (existing >= 0) {
    index[existing] = meta;
  } else {
    index.unshift(meta);
  }
  // Sort by most recent
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  await saveSessionIndex(index);
}

async function loadSession(sessionId: string): Promise<void> {
  const key = `chatSession_${sessionId}`;
  const result = await chrome.storage.local.get(key).catch(() => null);
  const messages = (result?.[key] as ChatMessage[] | undefined) ?? [];

  // Clear current chat UI
  chatMessages.querySelectorAll('.message-wrapper, .message.system-notice').forEach((el) => el.remove());
  document.getElementById('welcome-msg')?.remove();

  state.currentSessionId = sessionId;
  state.conversationHistory = messages;
  await chrome.storage.local.set({ activeSessionId: sessionId }).catch(console.error);

  if (messages.length === 0) {
    showWelcomeMessage();
    return;
  }

  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      const bubble = appendMessage(msg.role, msg.content);
      if (msg.role === 'assistant') {
        bubble.innerHTML = renderMarkdown(msg.content);
      }
    }
  }
}

async function loadChatHistory(): Promise<void> {
  const result = await chrome.storage.local.get('activeSessionId').catch(() => null);
  const activeId = result?.activeSessionId as string | undefined;

  if (activeId) {
    await loadSession(activeId);
  } else {
    // No sessions yet — create first one
    state.currentSessionId = generateSessionId();
    await chrome.storage.local.set({ activeSessionId: state.currentSessionId }).catch(console.error);
  }
}

async function deleteSession(sessionId: string): Promise<void> {
  const index = await getSessionIndex();
  const filtered = index.filter((s) => s.id !== sessionId);
  await saveSessionIndex(filtered);
  await chrome.storage.local.remove(`chatSession_${sessionId}`).catch(console.error);

  // If we deleted the active session, switch to most recent or create new
  if (state.currentSessionId === sessionId) {
    if (filtered.length > 0) {
      await loadSession(filtered[0]!.id);
    } else {
      await startNewChat();
    }
  }
}

function showWelcomeMessage(): void {
  if (document.getElementById('welcome-msg')) return;
  const welcome = document.createElement('div');
  welcome.id = 'welcome-msg';
  welcome.className = 'welcome-msg';
  welcome.innerHTML = `
    <div class="welcome-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">
        <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
      </svg>
    </div>
    <p>Your private AI assistant</p>
    <span style="font-size:12px; color:var(--text-muted)">Everything runs locally on your device</span>
  `;
  chatMessages.appendChild(welcome);
}

async function startNewChat(): Promise<void> {
  // Save current session if it has messages
  if (state.conversationHistory.length > 0) {
    await saveChatHistory();
  }

  state.currentSessionId = generateSessionId();
  state.conversationHistory = [];
  chatMessages.querySelectorAll('.message-wrapper, .message.system-notice').forEach((el) => el.remove());
  await chrome.storage.local.set({ activeSessionId: state.currentSessionId }).catch(console.error);
  showWelcomeMessage();
  closeHistoryPanel();
}

// ─── Session History Panel ───────────────────────────────────────────────────

const historyPanel = $('session-history');

function closeHistoryPanel(): void {
  historyPanel.classList.remove('open');
}

async function toggleHistoryPanel(): Promise<void> {
  if (historyPanel.classList.contains('open')) {
    closeHistoryPanel();
    return;
  }

  const index = await getSessionIndex();
  const listEl = $('session-list');
  listEl.innerHTML = '';

  if (index.length === 0) {
    listEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted); font-size:13px">No previous chats</div>';
  } else {
    for (const session of index) {
      const item = document.createElement('div');
      item.className = 'session-item';
      if (session.id === state.currentSessionId) {
        item.classList.add('active');
      }

      const info = document.createElement('div');
      info.className = 'session-info';

      const title = document.createElement('div');
      title.className = 'session-title';
      title.textContent = session.title;

      const meta = document.createElement('div');
      meta.className = 'session-meta';
      const date = new Date(session.updatedAt);
      const timeStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      meta.textContent = `${session.messageCount} messages · ${timeStr}`;

      info.appendChild(title);
      info.appendChild(meta);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'session-delete';
      deleteBtn.title = 'Delete chat';
      deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteSession(session.id);
        await toggleHistoryPanel(); // refresh list
      });

      item.appendChild(info);
      item.appendChild(deleteBtn);
      item.addEventListener('click', async () => {
        await loadSession(session.id);
        closeHistoryPanel();
      });

      listEl.appendChild(item);
    }
  }

  historyPanel.classList.add('open');
}

// ─── Header Buttons ──────────────────────────────────────────────────────────

$('btn-new-chat').addEventListener('click', () => startNewChat());
$('btn-history').addEventListener('click', () => toggleHistoryPanel());
$('btn-hide').addEventListener('click', () => {
  // Open stealth (PiP) mode — see stealth page
  chrome.tabs.create({ url: chrome.runtime.getURL('src/stealth/stealth.html') });
  window.close();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Stealth mode: when loaded inside PiP iframe, adapt layout
  const isStealth = new URLSearchParams(window.location.search).has('stealth');
  if (isStealth) {
    document.body.classList.add('stealth');
    const btnHide = document.getElementById('btn-hide');
    if (btnHide) btnHide.style.display = 'none';
  }

  // Restore chat history from previous session
  await loadChatHistory();

  // Request status from offscreen document
  const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' }).catch(() => null);

  if (status?.payload?.error) {
    // Previous init failed — show error with retry option
    statusDot.className = 'logo-dot error';
    statusText.textContent = 'Setup failed';
    modelStatusText.textContent = 'Failed to load';
    if (!status.payload.embeddingsReady) {
      setStep(stepEmbeddings, 'error');
    } else {
      setStep(stepEmbeddings, 'done');
      setStep(stepLlm, 'error');
    }
    showErrorBanner(status.payload.error);
  } else if (status?.payload?.llmReady) {
    // Both models ready
    state.modelReady = true;
    state.embeddingsReady = true;
    modelLoadingState.style.display = 'none';
    statusDot.className = 'logo-dot';
    statusText.textContent = 'Ready';
    statusModel.textContent = 'Local AI';
    btnSend.disabled = false;
    chatInput.placeholder = 'Ask anything… (Enter to send, Shift+Enter for newline)';
  } else if (status?.payload?.embeddingsReady) {
    // Embeddings loaded — imports are safe; LLM still loading
    state.embeddingsReady = true;
    setStep(stepEmbeddings, 'done');
    setStep(stepLlm, 'active');
    statusDot.className = 'logo-dot loading';
    statusText.textContent = 'Loading AI model…';
    modelStatusText.textContent = 'Loading AI model…';
    chrome.runtime.sendMessage({ type: 'LOAD_MODEL' }).catch(console.error);
  } else {
    // Not started yet — trigger full initialization
    setStep(stepEmbeddings, 'active');
    statusText.textContent = 'Setting up EdgeAI…';
    modelStatusText.textContent = 'Loading text understanding…';
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
