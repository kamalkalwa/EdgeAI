/**
 * Content Script (ADR-001 keepalive + page context extraction)
 *
 * Responsibilities:
 * 1. Send keepalive pings every 25 seconds to prevent service worker termination
 * 2. Respond to GET_PAGE_CONTEXT requests from popup/offscreen
 * 3. Inject the EdgeAI floating button (future: Phase 2)
 */

import type { Message, PageContext } from '@/lib/types';

// ─── Service Worker Keepalive ──────────────────────────────────────────────────
// The service worker terminates after 30 seconds of inactivity.
// Pinging every 25 seconds keeps it alive as long as any tab has this content script.

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepalive(): void {
  keepAliveInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'KEEPALIVE' }).catch(() => {
      // SW died — stop pinging, it will restart on next user action
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    });
  }, 25_000);
}

function stopKeepalive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// Start keepalive when content script loads
startKeepalive();

// Stop when page is unloaded
window.addEventListener('pagehide', stopKeepalive);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopKeepalive();
  } else {
    startKeepalive();
  }
});

// ─── Page Context Extraction ───────────────────────────────────────────────────

function extractPageContext(): PageContext {
  const selectedText = window.getSelection()?.toString().trim() ?? '';

  // Extract visible text — limit to 2000 chars to avoid huge context windows
  // Skip script/style/nav/footer elements for cleaner content
  const mainContent =
    document.querySelector('main') ??
    document.querySelector('article') ??
    document.body;

  const walker = document.createTreeWalker(
    mainContent,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (['script', 'style', 'nav', 'footer', 'header', 'noscript'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent?.trim();
        if (!text || text.length < 2) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textParts: string[] = [];
  let totalLength = 0;
  const MAX_VISIBLE = 2000;

  let node = walker.nextNode();
  while (node && totalLength < MAX_VISIBLE) {
    const text = node.textContent?.trim() ?? '';
    textParts.push(text);
    totalLength += text.length;
    node = walker.nextNode();
  }

  return {
    url: window.location.href,
    title: document.title,
    selectedText: selectedText.slice(0, 500),
    visibleText: textParts.join(' ').slice(0, MAX_VISIBLE),
  };
}

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    if (message.type === 'GET_PAGE_CONTEXT') {
      sendResponse({
        type: 'PAGE_CONTEXT',
        payload: extractPageContext(),
      });
      return false; // synchronous
    }

    return false;
  }
);

export {};
