/**
 * Chrome Bookmarks Connector (ADR-006)
 *
 * Imports each bookmark's title and URL. No page is fetched: EdgeAI has no
 * host permissions, and a bookmark list can hold intranet addresses it has no
 * business probing. `bookmarks` is an optional permission, asked for the first
 * time someone imports; the service worker runs the import.
 */

import type { IndexDocumentRequest } from '@/lib/types';

export interface BookmarkInfo {
  id: string;
  title: string;
  url: string;
  dateAdded?: number;
}

// ─── Bookmark Tree Flattening ──────────────────────────────────────────────────

export async function getAllBookmarks(): Promise<BookmarkInfo[]> {
  // Undefined until the user grants the optional permission.
  if (!chrome.bookmarks) throw new Error('EdgeAI does not have permission to read bookmarks.');
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

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Index requests for the bookmarks that aren't in the index yet. `imported`
 * holds the URLs of bookmarks already imported; a URL bookmarked twice is
 * imported once.
 */
export function newBookmarkDocuments(
  bookmarks: BookmarkInfo[],
  imported: Iterable<string>,
): IndexDocumentRequest[] {
  const seen = new Set(imported);
  const docs: IndexDocumentRequest[] = [];
  for (const bm of bookmarks) {
    if (seen.has(bm.url)) continue;
    seen.add(bm.url);
    docs.push({
      content: `${bm.title}\n${bm.url}`,
      metadata: {
        title: bm.title,
        source: 'bookmark',
        sourcePath: bm.url,
        createdAt: bm.dateAdded ?? Date.now(),
        updatedAt: bm.dateAdded ?? Date.now(),
      },
    });
  }
  return docs;
}
