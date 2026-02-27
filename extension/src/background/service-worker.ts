/**
 * Service Worker — Lightweight Message Router (ADR-001)
 *
 * Responsibilities:
 * 1. Route messages between popup/content script and the offscreen document
 * 2. Create / ensure the offscreen document is alive
 * 3. Handle keepalive pings from content script to prevent 30s SW termination
 * 4. Handle chrome.alarms for voice reminders
 *
 * Does NOT: run any ML inference, touch IndexedDB, or hold application state.
 */

import type { Message } from '@/lib/types';

const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen/offscreen.html');
let creatingOffscreen: Promise<void> | null = null;

// ─── Offscreen Document Lifecycle ─────────────────────────────────────────────

async function ensureOffscreenDocument(): Promise<void> {
  // Check if already exists
  const existing = await chrome.offscreen.hasDocument?.().catch(() => false);
  if (existing) return;

  // Prevent race condition if multiple messages arrive simultaneously
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [
      chrome.offscreen.Reason.AUDIO_PLAYBACK,    // keeps it alive during voice
      chrome.offscreen.Reason.USER_MEDIA,         // mic access for VAD
    ],
    justification: 'Run WebGPU ML inference (LLM, embeddings, ASR) outside of service worker context',
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

// ─── Message Routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    // Messages from the offscreen document are status broadcasts (CHAT_CHUNK,
    // MODEL_READY, INDEX_DONE, etc.) — they flow directly to the popup via the
    // chrome.runtime broadcast bus. Forwarding them back to the offscreen would
    // create a circular routing loop and spam port-closed errors.
    if (sender.url === OFFSCREEN_URL) return false;

    // Handle keepalive pings from content script — just respond immediately
    // to prevent SW from sleeping. The ping itself resets the idle timer.
    if (message.type === 'KEEPALIVE') {
      sendResponse({ alive: true });
      return false; // synchronous response
    }

    // All other messages (from popup or content scripts) go to the offscreen document
    handleOffscreenMessage(message, sendResponse);
    return true; // keep port open for async response
  }
);

async function handleOffscreenMessage(
  message: Message,
  sendResponse: (response: unknown) => void
): Promise<void> {
  try {
    await ensureOffscreenDocument();

    // Forward message to offscreen document
    // The offscreen document will sendResponse back through this relay
    const response = await chrome.runtime.sendMessage({
      ...message,
      _target: 'offscreen',
    });

    sendResponse(response);
  } catch (error) {
    sendResponse({
      type: `${message.type}_ERROR`,
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.requestId,
      },
    });
  }
}

// ─── Streaming Token Relay ─────────────────────────────────────────────────────
// Offscreen document sends CHAT_CHUNK messages directly to popup/content scripts
// via chrome.tabs.sendMessage. The SW just relays them.

chrome.runtime.onMessageExternal?.addListener((message: Message, sender) => {
  // Reserved for future MCP client connections from external apps
  console.log('[SW] External message from:', sender.id, message.type);
});

// ─── Alarms (voice reminders) ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('reminder:')) {
    const reminderText = alarm.name.replace('reminder:', '');

    // Show a Chrome notification for the reminder
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'EdgeAI Reminder',
      message: reminderText,
    });
  }
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'edgeai-index-page' || !tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_PAGE_CONTENT_FOR_INDEX',
    });

    if (!response?.payload?.content) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'EdgeAI',
        message: 'Could not extract content from this page.',
      });
      return;
    }

    const { url, title, content } = response.payload;

    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({
      type: 'INDEX_DOCUMENT',
      _target: 'offscreen',
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
    });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'EdgeAI',
      message: `Indexing "${title}"...`,
    });
  } catch (err) {
    console.error('[SW] Context menu index error:', err);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'EdgeAI',
      message: 'Failed to index this page. Make sure the page has loaded completely.',
    });
  }
});

// ─── Install / Update ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  // Create context menu for indexing pages
  chrome.contextMenus.create({
    id: 'edgeai-index-page',
    title: 'Index this page with EdgeAI',
    contexts: ['page'],
  });

  if (details.reason === 'install') {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('src/popup/popup.html'),
    });
  }

  await ensureOffscreenDocument().catch(console.error);
});

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  await ensureOffscreenDocument().catch(console.error);
});

export {};
