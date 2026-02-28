/**
 * Popup — Main UI controller
 *
 * Communicates with the offscreen document via chrome.runtime.sendMessage.
 * Handles tabs, chat, import flows, document preview, and the trust panel.
 */

import type { Message } from '@/lib/types';
import { nanoid } from '@/lib/utils';
import { state, setCurrentSettings } from './modules/state';
import {
  $, showToast,
  statusDot, statusText, statusModel,
  modelLoadingState, modelStatusText, modelProgressPct, modelProgressFill,
  stepEmbeddings, stepLlm, errorBanner, errorBannerMsg, btnRetry,
  chatInput, btnSend, inputBar,
} from './modules/dom';
import { loadTrustStats, initNetworkLogListeners, initAuditLogListeners } from './modules/trust';
import { initChatListeners } from './modules/chat';
import { loadChatHistory, startNewChat, toggleHistoryPanel } from './modules/sessions';
import { loadDocumentsList, initDocumentListeners } from './modules/documents';
import { initVoiceListeners } from './modules/voice';
import { loadSettings, openSettingsPanel, initSettingsListeners } from './modules/settings';
import { isFirstRun, showOnboarding } from './modules/onboarding';

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

// ─── Index This Tab ─────────────────────────────────────────────────────────

$('btn-index-tab').addEventListener('click', async () => {
  if (!state.embeddingsReady) {
    showToast('Embeddings still loading — please wait');
    return;
  }

  let tab: chrome.tabs.Tab | undefined;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  } catch {
    showToast('Could not access the current tab');
    return;
  }

  if (!tab?.id || !tab.url) {
    showToast('No active tab found');
    return;
  }

  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
    showToast('Cannot index browser internal pages');
    return;
  }

  showToast('Extracting page content…', 10000);

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT_FOR_INDEX' });

    if (!response?.payload?.content) {
      showToast('Could not extract content from this page');
      return;
    }

    const { url, title, content } = response.payload as { url: string; title: string; content: string };
    showToast(`Indexing "${title}"…`, 15000);

    const reqId = nanoid();
    await chrome.runtime.sendMessage({
      type: 'INDEX_DOCUMENT',
      payload: {
        content,
        metadata: {
          title: title || url,
          source: 'web_page',
          sourcePath: url,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      requestId: reqId,
    });

    const onIndexResult = (message: Message) => {
      const msgReqId = (message.payload as { requestId?: string } | undefined)?.requestId;
      if (message.type === 'INDEX_DONE' && msgReqId === reqId) {
        const payload = message.payload as { documentId: string; chunkCount?: number } | undefined;
        const chunks = payload?.chunkCount ?? 0;
        showToast(`Indexed! ${chunks} chunks from "${title}"`);
        chrome.runtime.onMessage.removeListener(onIndexResult);
      }
      if (message.type === 'INDEX_ERROR' && msgReqId === reqId) {
        showToast('Failed to index this page');
        chrome.runtime.onMessage.removeListener(onIndexResult);
      }
    };
    chrome.runtime.onMessage.addListener(onIndexResult);
    setTimeout(() => chrome.runtime.onMessage.removeListener(onIndexResult), 30000);
  } catch {
    showToast('Failed — make sure the page has loaded completely');
  }
});

// ─── Header Buttons ──────────────────────────────────────────────────────────

$('btn-new-chat').addEventListener('click', () => startNewChat());
$('btn-history').addEventListener('click', () => toggleHistoryPanel());
$('btn-settings').addEventListener('click', () => openSettingsPanel());
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

  // Wire up event listeners from modules
  initChatListeners();
  initDocumentListeners();
  initVoiceListeners();
  initSettingsListeners();
  initNetworkLogListeners();
  initAuditLogListeners();

  // Load user settings
  setCurrentSettings(await loadSettings());

  // Check for first-run onboarding
  const firstRun = await isFirstRun();
  if (firstRun) {
    showOnboarding();
  } else {
    // Restore chat history from previous session
    await loadChatHistory();
  }

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

init().catch(console.error);
