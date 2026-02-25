/**
 * Chrome Bookmarks Connector (ADR-006)
 *
 * Reads bookmarks via the chrome.bookmarks API (no auth required).
 * Fetches page content for each bookmark via fetch() to extract full text.
 * Rate-limited to avoid overwhelming the browser.
 */

import type { IndexDocumentRequest } from '@/lib/types';

const FETCH_CONCURRENCY = 3;     // max concurrent fetches
const FETCH_TIMEOUT_MS = 10_000;

export interface BookmarkInfo {
  id: string;
  title: string;
  url: string;
  dateAdded?: number;
}

// ─── Bookmark Tree Flattening ──────────────────────────────────────────────────

export async function getAllBookmarks(): Promise<BookmarkInfo[]> {
  const tree = await chrome.bookmarks.getTree();
  const bookmarks: BookmarkInfo[] = [];
  flattenTree(tree, bookmarks);
  return bookmarks;
}

export function flattenTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  out: BookmarkInfo[]
): void {
  for (const node of nodes) {
    if (node.url) {
      // It's a bookmark (not a folder)
      out.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
        dateAdded: node.dateAdded,
      });
    }
    if (node.children) {
      flattenTree(node.children, out);
    }
  }
}

// ─── URL Safety Check ─────────────────────────────────────────────────────────
// Prevent the extension from fetching internal/private network addresses.
// A user's bookmarks can contain localhost or intranet URLs — we must not probe them.

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,       // 127.0.0.0/8 loopback
  /^10\.\d+\.\d+\.\d+$/,        // 10.0.0.0/8 private
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12 private
  /^192\.168\.\d+\.\d+$/,       // 192.168.0.0/16 private
  /^::1$/,                       // IPv6 loopback
  /^fe80:/i,                     // IPv6 link-local
  /^0\.0\.0\.0$/,
];

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    // URL spec wraps IPv6 in brackets: `new URL('http://[::1]').hostname === '[::1]'`
    // Strip them so the regexes match bare addresses.
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    return !BLOCKED_HOSTNAME_PATTERNS.some((p) => p.test(hostname));
  } catch {
    return false;
  }
}

// ─── Page Content Fetching ────────────────────────────────────────────────────

async function fetchPageText(url: string): Promise<string | null> {
  // Block fetches to private/internal addresses (SECURITY.md — least privilege)
  if (!isSafeUrl(url)) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'EdgeAI/0.1 (personal browser extension)' },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null; // Skip PDFs, images, etc.
    }

    const html = await response.text();
    return extractTextFromHtml(html);
  } catch {
    return null;
  }
}

export function extractTextFromHtml(html: string): string {
  // Use a DOMParser to extract text — clean approach, browser-native
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove non-content elements
  const toRemove = doc.querySelectorAll('script, style, nav, footer, header, aside, noscript');
  toRemove.forEach((el) => el.remove());

  // Prefer main content regions
  const main = doc.querySelector('main') ?? doc.querySelector('article') ?? doc.body;

  return (main.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50_000);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Yield IndexDocumentRequests for all bookmarks.
 * Fetches page content for each — rate-limited.
 */
export async function* indexAllBookmarks(
  onProgress?: (current: number, total: number) => void
): AsyncGenerator<IndexDocumentRequest> {
  const bookmarks = await getAllBookmarks();
  const total = bookmarks.length;
  let completed = 0;

  // Process in batches to limit concurrency
  for (let i = 0; i < bookmarks.length; i += FETCH_CONCURRENCY) {
    const batch = bookmarks.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (bm) => {
        const text = await fetchPageText(bm.url);
        completed++;
        onProgress?.(completed, total);
        if (!text || text.length < 100) return null;

        return {
          content: text,
          metadata: {
            title: bm.title,
            source: 'bookmark' as const,
            sourcePath: bm.url,
            createdAt: bm.dateAdded ?? Date.now(),
            updatedAt: bm.dateAdded ?? Date.now(),
          },
        } satisfies IndexDocumentRequest;
      })
    );

    for (const result of results) {
      if (result) yield result;
    }
  }
}

/**
 * Index bookmarks title + URL only (no page fetch) — fast, offline-safe.
 * Useful as a quick index when network is not available.
 */
export async function* indexBookmarkMetadataOnly(): AsyncGenerator<IndexDocumentRequest> {
  const bookmarks = await getAllBookmarks();

  for (const bm of bookmarks) {
    yield {
      content: `${bm.title}\n${bm.url}`,
      metadata: {
        title: bm.title,
        source: 'bookmark',
        sourcePath: bm.url,
        createdAt: bm.dateAdded ?? Date.now(),
        updatedAt: bm.dateAdded ?? Date.now(),
      },
    };
  }
}
