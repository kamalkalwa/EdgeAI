/**
 * Service Worker — Lightweight Message Router (ADR-001)
 *
 * Responsibilities:
 * 1. Route messages between the popup and the offscreen document
 * 2. Create / ensure the offscreen document is alive
 * 3. Keep the Trust Panel's two logs, as their only writer: the network log
 *    (every EdgeAI page reports its own requests, NETWORK_ENTRIES) and the
 *    audit log (the offscreen document reports what it did, AUDIT_ENTRY)
 * 4. "Index this page with EdgeAI" from the right-click menu
 * 5. Import bookmarks once the user allows it
 *
 * Does NOT: run any ML inference, touch IndexedDB, hold application state,
 * or put anything into a page the user hasn't asked EdgeAI to read.
 */

import type { Message, PageContentForIndex } from '@/lib/types';
import { sanitizeEntries, type NetworkEntry } from '@/lib/trust/network-monitor';
import { sanitizeAuditEntries, type AuditEntry } from '@/lib/trust/audit-log';
import { reportNetworkRequests } from '@/lib/trust/request-reporter';
import { StoredLog } from '@/lib/trust/stored-log';
import { readTab, ReadTabError } from '@/lib/page/read-tab';
import { getAllBookmarks } from '@/lib/connectors/bookmarks';

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

// ─── Trust Panel Logs ────────────────────────────────────────────────────────
//
// Each EdgeAI page reports the requests it made (request-reporter.ts) and the
// worker records its own. The offscreen document reports what it did with the
// user's data (audit-log.ts). The network log is kept under a new key: the old
// `networkLog` came from chrome.webRequest, which never sees an extension's
// own requests, so it holds nothing worth migrating.

const networkLog = new StoredLog<NetworkEntry>({
  key: 'networkRequests',
  max: 1000,
  sanitize: sanitizeEntries,
  // Lets an open Trust Panel refresh; rejects when no page is listening.
  onPersisted: () => chrome.runtime.sendMessage({ type: 'NETWORK_LOG_UPDATED' }).catch(() => {}),
});
chrome.storage.local.remove('networkLog').catch(() => {});

const auditLog = new StoredLog<AuditEntry>({
  key: 'auditLog',
  max: 500,
  sanitize: sanitizeAuditEntries,
  onPersisted: () => chrome.runtime.sendMessage({ type: 'AUDIT_LOG_UPDATED' }).catch(() => {}),
});

reportNetworkRequests('service-worker', (entries) => networkLog.record(entries));

// ─── Message Routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    // Every EdgeAI page reports its requests, the offscreen document included.
    if (message.type === 'NETWORK_ENTRIES') {
      networkLog.record(sanitizeEntries(message.payload));
      return false;
    }
    if (message.type === 'AUDIT_ENTRY') {
      auditLog.record(sanitizeAuditEntries([message.payload]));
      return false;
    }

    // Messages from the offscreen document are status broadcasts (CHAT_CHUNK,
    // MODEL_READY, INDEX_DONE, etc.) — they flow directly to the popup via the
    // chrome.runtime broadcast bus. Forwarding them back to the offscreen would
    // create a circular routing loop and spam port-closed errors.
    if (sender.url === OFFSCREEN_URL) return false;

    // The Trust Panel's logs — handled here, not forwarded to the offscreen document
    if (message.type === 'GET_NETWORK_LOG') {
      networkLog.read().then((payload) => sendResponse({ type: 'NETWORK_LOG', payload }));
      return true;
    }
    if (message.type === 'CLEAR_NETWORK_LOG') {
      networkLog.clear().then(() => sendResponse({ success: true }));
      return true;
    }
    if (message.type === 'GET_AUDIT_LOG') {
      auditLog.read().then((payload) => sendResponse({ type: 'AUDIT_LOG', payload }));
      return true;
    }
    if (message.type === 'CLEAR_AUDIT_LOG') {
      auditLog.clear().then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.type === 'IMPORT_BOOKMARKS') {
      const run = startBookmarkImport();
      run.watched = true;
      run.done.then(
        (result) => sendResponse(result),
        (err) => sendResponse({ error: err instanceof Error ? err.message : String(err) }),
      );
      return true;
    }

    // All other messages from the popup go to the offscreen document
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
// The offscreen document broadcasts CHAT_CHUNK messages to the popup directly
// with chrome.runtime.sendMessage; they don't pass through here.

chrome.runtime.onMessageExternal?.addListener((message: Message, sender) => {
  // Reserved for future MCP client connections from external apps
  console.log('[SW] External message from:', sender.id, message.type);
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

function notify(message: string): void {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'EdgeAI',
    message,
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'edgeai-index-page' || tab?.id === undefined) return;

  let page: PageContentForIndex;
  try {
    // The menu click granted activeTab for this tab — that is what lets EdgeAI read it.
    page = await readTab({ id: tab.id, url: tab.url ?? info.pageUrl });
  } catch (err) {
    notify(err instanceof ReadTabError ? err.message : 'Could not read this page.');
    return;
  }
  const { url, title, content } = page;

  try {
    await ensureOffscreenDocument();

    // Check for existing indexed version — delete old before re-indexing
    const existsCheck = await chrome.runtime.sendMessage({
      type: 'CHECK_DOCUMENT_EXISTS',
      _target: 'offscreen',
      payload: { sourcePath: url },
    }).catch(() => null);

    if (existsCheck?.exists && existsCheck.documentId) {
      await chrome.runtime.sendMessage({
        type: 'DELETE_DOCUMENT',
        _target: 'offscreen',
        payload: { documentId: existsCheck.documentId },
      }).catch(() => {});
    }

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

    notify(existsCheck?.exists ? `Re-indexing "${title}" with latest content...` : `Indexing "${title}"...`);
  } catch (err) {
    console.error('[SW] Context menu index error:', err);
    notify('Failed to index this page.');
  }
});

// ─── Bookmarks Import ────────────────────────────────────────────────────────
//
// Runs here rather than in the popup. `bookmarks` is an optional permission,
// and Chrome can close the toolbar popup while it shows the prompt, so the
// grant itself starts the import (permissions.onAdded) and the Import button
// asks for the same run (IMPORT_BOOKMARKS); whichever arrives second joins the
// first. This worker reads the bookmarks; the offscreen document picks the
// ones not imported yet, counting those still waiting to be indexed, so
// importing again only adds new ones.

interface BookmarkImport {
  done: Promise<{ added: number }>;
  /** A page is waiting on the result; otherwise say it with a notification. */
  watched: boolean;
}
let bookmarkImport: BookmarkImport | null = null;

function startBookmarkImport(): BookmarkImport {
  if (bookmarkImport) return bookmarkImport;
  const run: BookmarkImport = { done: importBookmarks(), watched: false };
  bookmarkImport = run;
  run.done.finally(() => { bookmarkImport = null; }).catch(() => {});
  return run;
}

async function importBookmarks(): Promise<{ added: number }> {
  const bookmarks = await getAllBookmarks();
  await ensureOffscreenDocument();
  const res = await chrome.runtime.sendMessage({ type: 'IMPORT_BOOKMARKS', _target: 'offscreen', payload: bookmarks });
  if (typeof res?.added !== 'number') throw new Error(res?.error ?? 'No answer from the offscreen document');
  return { added: res.added };
}

chrome.permissions.onAdded.addListener(({ permissions }) => {
  if (!permissions?.includes('bookmarks')) return;
  const run = startBookmarkImport();
  run.done.then(
    ({ added }) => {
      if (!run.watched) notify(`Imported ${added} bookmark${added === 1 ? '' : 's'}.`);
    },
    (err) => {
      console.error('[SW] Bookmark import failed:', err);
      if (!run.watched) notify("Couldn't import bookmarks. Try Import → Chrome Bookmarks again.");
    },
  );
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
