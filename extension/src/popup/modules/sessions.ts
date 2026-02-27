/**
 * Sessions — multi-session chat persistence and history panel.
 */

import type { ChatMessage } from '@/lib/types';
import { state } from './state';
import type { ChatSession } from './state';
import { $, chatMessages } from './dom';
import { appendMessage, renderMarkdown, createSpeakButton } from './chat';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PERSISTED_MESSAGES = 50;
const MAX_SESSIONS = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Persistence ─────────────────────────────────────────────────────────────

export async function saveChatHistory(): Promise<void> {
  if (!state.currentSessionId || state.conversationHistory.length === 0) return;

  const messages = state.conversationHistory.slice(-MAX_PERSISTED_MESSAGES);
  const key = `chatSession_${state.currentSessionId}`;
  await chrome.storage.local.set({ [key]: messages, activeSessionId: state.currentSessionId }).catch(console.error);

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
  index.sort((a, b) => b.updatedAt - a.updatedAt);
  await saveSessionIndex(index);
}

// ─── Load / Create ───────────────────────────────────────────────────────────

export function showWelcomeMessage(): void {
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

export async function loadSession(sessionId: string): Promise<void> {
  const key = `chatSession_${sessionId}`;
  const result = await chrome.storage.local.get(key).catch(() => null);
  const messages = (result?.[key] as ChatMessage[] | undefined) ?? [];

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
        const wrapper = bubble.closest('.message-wrapper');
        const speakBar = wrapper?.querySelector('.message-actions');
        if (speakBar) {
          speakBar.classList.remove('hidden');
          speakBar.innerHTML = '';
          const freshBar = createSpeakButton(msg.content);
          speakBar.appendChild(freshBar.firstChild!);
        }
      }
    }
  }
}

export async function loadChatHistory(): Promise<void> {
  const result = await chrome.storage.local.get('activeSessionId').catch(() => null);
  const activeId = result?.activeSessionId as string | undefined;

  if (activeId) {
    await loadSession(activeId);
  } else {
    state.currentSessionId = generateSessionId();
    await chrome.storage.local.set({ activeSessionId: state.currentSessionId }).catch(console.error);
  }
}

async function deleteSession(sessionId: string): Promise<void> {
  const index = await getSessionIndex();
  const filtered = index.filter((s) => s.id !== sessionId);
  await saveSessionIndex(filtered);
  await chrome.storage.local.remove(`chatSession_${sessionId}`).catch(console.error);

  if (state.currentSessionId === sessionId) {
    if (filtered.length > 0) {
      await loadSession(filtered[0]!.id);
    } else {
      await startNewChat();
    }
  }
}

// ─── History Panel ───────────────────────────────────────────────────────────

const historyPanel = $('session-history');

export function closeHistoryPanel(): void {
  historyPanel.classList.remove('open');
}

export async function startNewChat(): Promise<void> {
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

export async function toggleHistoryPanel(): Promise<void> {
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
        await toggleHistoryPanel();
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
