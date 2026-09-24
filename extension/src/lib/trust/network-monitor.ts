/**
 * Network Monitor — the Trust Panel's record of every request EdgeAI makes.
 *
 * The source is the browser's own resource-timing entries, reported by each
 * EdgeAI page and by the service worker (see request-reporter.ts). Not
 * chrome.webRequest: Chrome does not deliver an extension's own requests to
 * its webRequest listeners, so a webRequest log of EdgeAI's traffic stays
 * empty whatever the extension does.
 *
 * Pure functions only — shared by the service worker (recording) and the
 * popup (displaying).
 */

export interface NetworkEntry {
  id: string;
  url: string;
  /** Epoch ms when the request started. */
  timestamp: number;
  /** HTTP status; 0 when the request failed or was blocked. */
  statusCode: number;
  /** How the page issued it: fetch, script, xmlhttprequest, beacon, link, img, other… */
  initiatorType: string;
  /** Which EdgeAI page made it: offscreen, popup, service-worker, … */
  context: string;
  category: 'model_download' | 'other';
}

/** The fields of PerformanceResourceTiming this module reads. */
export interface ResourceTimingLike {
  name: string;
  startTime: number;
  initiatorType: string;
  responseStatus?: number;
}

const MAX_ENTRIES = 1000;

/**
 * Hugging Face and its cdn-lfs / xet download mirrors: the only place the
 * extension fetches from at runtime (model weights, on first use). Anything
 * else the extension requests is reported as other activity — that is the
 * whole point of the Trust Panel, so this list stays exact.
 */
function isModelHost(hostname: string): boolean {
  return hostname === 'huggingface.co' || hostname.endsWith('.huggingface.co')
    || hostname === 'hf.co' || hostname.endsWith('.hf.co');
}

export function categorizeRequest(url: string): NetworkEntry['category'] {
  try {
    return isModelHost(new URL(url).hostname) ? 'model_download' : 'other';
  } catch {
    return 'other';
  }
}

function isNetworkUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * A resource-timing entry as a log entry, or null when it isn't network
 * traffic: the extension's packaged files (chrome-extension:), blob: and
 * data: URLs never leave the device.
 */
export function toNetworkEntry(
  entry: ResourceTimingLike,
  context: string,
  timeOrigin: number,
): NetworkEntry | null {
  if (!isNetworkUrl(entry.name)) return null;
  return {
    // Unique per request: one page, one time origin, one start time.
    id: `${context}:${timeOrigin}:${entry.startTime}:${entry.name}`,
    url: entry.name,
    timestamp: Math.round(timeOrigin + entry.startTime),
    statusCode: entry.responseStatus ?? 0,
    initiatorType: entry.initiatorType || 'other',
    context,
    category: categorizeRequest(entry.name),
  };
}

/**
 * Entries reported by another context, checked field by field. The category
 * is recomputed here rather than trusted, so it always follows isModelHost().
 */
export function sanitizeEntries(payload: unknown): NetworkEntry[] {
  if (!Array.isArray(payload)) return [];
  const entries: NetworkEntry[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (
      typeof e['id'] !== 'string' || typeof e['url'] !== 'string' || !isNetworkUrl(e['url']) ||
      typeof e['timestamp'] !== 'number' || typeof e['statusCode'] !== 'number' ||
      typeof e['initiatorType'] !== 'string' || typeof e['context'] !== 'string'
    ) continue;
    entries.push({
      id: e['id'],
      url: e['url'],
      timestamp: e['timestamp'],
      statusCode: e['statusCode'],
      initiatorType: e['initiatorType'],
      context: e['context'],
      category: categorizeRequest(e['url']),
    });
  }
  return entries;
}

/**
 * Adds the entries the log doesn't already hold (a report can arrive twice),
 * then drops the oldest beyond MAX_ENTRIES.
 */
export function appendEntries(log: NetworkEntry[], entries: NetworkEntry[]): NetworkEntry[] {
  const seen = new Set(log.map((e) => e.id));
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    log.push(entry);
  }
  if (log.length > MAX_ENTRIES) {
    log.splice(0, log.length - MAX_ENTRIES);
  }
  return log;
}

/**
 * A URL as a log row shows it, without the scheme: host and path up to the
 * last slash, then the file name, which the row keeps in view when it has to
 * shorten the rest.
 */
export function formatEntryUrl(url: string): { path: string; file: string } {
  try {
    const u = new URL(url);
    const shown = u.host + u.pathname + u.search;
    const cut = u.host.length + u.pathname.lastIndexOf('/') + 1;
    return { path: shown.slice(0, cut), file: shown.slice(cut) };
  } catch {
    return { path: '', file: url };
  }
}
