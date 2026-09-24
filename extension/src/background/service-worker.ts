/**
 * Service Worker — Lightweight Message Router (ADR-001)
 *
 * Responsibilities:
 * 1. Route messages between the popup and the offscreen document
 * 2. Create / ensure the offscreen document is alive
 * 3. Keep the Trust Panel's network log — every EdgeAI page reports its own
 *    requests here (NETWORK_ENTRIES), and this is the only writer
 * 4. "Index this page with EdgeAI" from the right-click menu
 * 5. Import bookmarks once the user allows it
 *
 * Does NOT: run any ML inference, touch IndexedDB, hold application state,
 * or put anything into a page the user hasn't asked EdgeAI to read.
 */

import type { DocumentMetadata, Message, PageContentForIndex } from '@/lib/types';
import { appendEntries, sanitizeEntries, type NetworkEntry } from '@/lib/trust/network-monitor';
import { reportNetworkRequests } from '@/lib/trust/request-reporter';
import { readTab, ReadTabError } from '@/lib/page/read-tab';
import { getAllBookmarks, newBookmarkDocuments } from '@/lib/connectors/bookmarks';

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

// ─── Network Log ─────────────────────────────────────────────────────────────
//
// Each EdgeAI page reports the requests it made (request-reporter.ts) and the
// worker records its own. Kept under a new key: the old `networkLog` came from
// chrome.webRequest, which never sees an extension's own requests, so it holds
// nothing worth migrating.

const LOG_KEY = 'networkRequests';
let networkLog: NetworkEntry[] = [];
let persistTimer: ReturnType<typeof setTimeout> | undefined;

// Entries can arrive while the stored log is still loading; keep both.
const logLoaded: Promise<void> = chrome.storage.local.get(LOG_KEY)
  .then((result) => {
    const recordedMeanwhile = networkLog;
    networkLog = appendEntries(sanitizeEntries(result[LOG_KEY]), recordedMeanwhile);
  })
  .catch(console.error);
chrome.storage.local.remove('networkLog').catch(() => {});

function recordNetworkEntries(entries: NetworkEntry[]): void {
  if (entries.length === 0) return;
  appendEntries(networkLog, entries);
  clearTimeout(persistTimer);
  // Short debounce: a model download reports dozens of files in bursts. The
  // worker stays up for 30 s after the message that scheduled this.
  persistTimer = setTimeout(async () => {
    await logLoaded;
    await chrome.storage.local.set({ [LOG_KEY]: networkLog }).catch(console.error);
    // Lets an open Trust Panel refresh; rejects when no page is listening.
    chrome.runtime.sendMessage({ type: 'NETWORK_LOG_UPDATED' }).catch(() => {});
  }, 500);
}

reportNetworkRequests('service-worker', recordNetworkEntries);

// ─── Message Routing ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    // Every EdgeAI page reports its requests, the offscreen document included.
    if (message.type === 'NETWORK_ENTRIES') {
      recordNetworkEntries(sanitizeEntries(message.payload));
      return false;
    }

    // Messages from the offscreen document are status broadcasts (CHAT_CHUNK,
    // MODEL_READY, INDEX_DONE, etc.) — they flow directly to the popup via the
    // chrome.runtime broadcast bus. Forwarding them back to the offscreen would
    // create a circular routing loop and spam port-closed errors.
    if (sender.url === OFFSCREEN_URL) return false;

    // Network log queries — handled directly in SW, not forwarded to offscreen
    if (message.type === 'GET_NETWORK_LOG') {
      logLoaded.then(() => sendResponse({ type: 'NETWORK_LOG', payload: networkLog }));
      return true;
    }
    if (message.type === 'CLEAR_NETWORK_LOG') {
      // After the load, or the stored entries would come back.
      logLoaded.then(async () => {
        networkLog = [];
        clearTimeout(persistTimer);
        await chrome.storage.local.set({ [LOG_KEY]: [] }).catch(console.error);
        sendResponse({ success: true });
      });
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
// first. Bookmarks already in the index are skipped, so importing again only
// adds new ones.

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
  const listed = await chrome.runtime.sendMessage({ type: 'LIST_DOCUMENTS', _target: 'offscreen' });
  if (listed?.error) throw new Error(listed.error);
  const imported = ((listed?.payload ?? []) as DocumentMetadata[])
    .filter((d) => d.source === 'bookmark' && d.sourcePath)
    .map((d) => d.sourcePath as string);

  const docs = newBookmarkDocuments(bookmarks, imported);
  for (const doc of docs) {
    // Acknowledged at once; the offscreen document indexes them one at a time.
    await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', _target: 'offscreen', payload: doc });
  }
  return { added: docs.length };
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
