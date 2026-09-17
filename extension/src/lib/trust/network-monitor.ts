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
  category: 'model_download' | 'extension_internal' | 'unknown';
}

const MAX_ENTRIES = 1000;

/**
 * True for requests EdgeAI made itself. `initiator` is the origin that issued
 * the request; extension pages (popup, side panel, offscreen document) and the
 * service worker all report the extension's own origin. Loads of the
 * extension's bundled files are not network activity.
 */
export function isOwnRequest(url: string, initiator: string | undefined, extensionOrigin: string): boolean {
  return initiator === extensionOrigin && !url.startsWith('chrome-extension://');
}

/**
 * Hugging Face and its cdn-lfs / xet download mirrors: the only place the
 * extension fetches from at runtime (model weights, on first use). Anything
 * else the extension requests is reported as external activity — that is the
 * whole point of the Trust Panel, so this list stays exact.
 */
function isModelHost(hostname: string): boolean {
  return hostname === 'huggingface.co' || hostname.endsWith('.huggingface.co')
    || hostname === 'hf.co' || hostname.endsWith('.hf.co');
}

export function categorizeRequest(url: string): NetworkEntry['category'] {
  if (url.startsWith('chrome-extension://')) return 'extension_internal';
  try {
    return isModelHost(new URL(url).hostname) ? 'model_download' : 'unknown';
  } catch {
    return 'unknown';
  }
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
