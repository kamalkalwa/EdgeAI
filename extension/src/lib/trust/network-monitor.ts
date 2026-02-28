/**
 * Network Monitor — types and categorization logic for the Trust Panel.
 * Used by both the service worker (recording) and the popup (displaying).
 */

export interface NetworkEntry {
  id: string;
  url: string;
  method: string;
  type: string;
  timestamp: number;
  statusCode: number;
  responseSize: number;
  initiator: string;
  category: 'model_download' | 'extension_internal' | 'user_fetch' | 'unknown';
}

const MAX_ENTRIES = 1000;

export function categorizeRequest(url: string, initiator: string): NetworkEntry['category'] {
  // Model downloads from Hugging Face CDN
  if (url.includes('huggingface.co') || url.includes('cdn-lfs') || url.includes('hf.co')) {
    return 'model_download';
  }
  // Internal extension resources
  if (url.startsWith('chrome-extension://')) {
    return 'extension_internal';
  }
  // User-initiated content fetches (bookmarks, web pages)
  if (initiator && initiator.startsWith('chrome-extension://')) {
    return 'user_fetch';
  }
  return 'unknown';
}

export function appendEntry(
  log: NetworkEntry[],
  entry: NetworkEntry,
): NetworkEntry[] {
  log.push(entry);
  // FIFO cap
  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }
  return log;
}

export function formatEntryUrl(url: string, maxLen = 60): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const display = u.host + (path.length > 1 ? path : '');
    return display.length > maxLen ? display.slice(0, maxLen - 1) + '…' : display;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen - 1) + '…' : url;
  }
}
