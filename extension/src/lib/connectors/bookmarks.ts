/**
 * Chrome Bookmarks Connector (ADR-006)
 *
 * Imports each bookmark's title and URL. No page is fetched: EdgeAI has no
 * host permissions, and a bookmark list can hold intranet addresses it has no
 * business probing. `bookmarks` is an optional permission, asked for the first
 * time someone imports. The service worker reads the bookmarks; the offscreen
 * document, which holds the indexing queue and the store, imports them
 * (BookmarkImporter).
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

/**
 * Imports bookmarks into the index, each URL once however often the import
 * runs.
 *
 * A bookmark counts as imported from the moment it is queued for indexing, not
 * only once its document is stored, and one import picks at a time. Without
 * both, an import started while an earlier one is still indexing (a long
 * bookmark list takes minutes) would queue the same bookmarks again.
 */
export class BookmarkImporter {
  /** Queues a document for indexing; settles once it is stored or has failed. */
  private readonly index: (doc: IndexDocumentRequest) => Promise<void>;
  /** URLs of the bookmarks already stored. */
  private readonly storedUrls: () => Promise<Iterable<string>>;
  /** URLs queued for indexing whose documents aren't stored yet. */
  private readonly queued = new Set<string>();
  private picking: Promise<unknown> = Promise.resolve();

  constructor(
    index: (doc: IndexDocumentRequest) => Promise<void>,
    storedUrls: () => Promise<Iterable<string>>,
  ) {
    this.index = index;
    this.storedUrls = storedUrls;
  }

  /** Queues the bookmarks not imported yet; resolves to how many it queued. */
  import(bookmarks: BookmarkInfo[]): Promise<number> {
    const run = this.picking.then(async () => {
      // The queue before the store: a URL leaves `queued` only after its
      // document is stored, so reading in this order can't miss it.
      const queued = [...this.queued];
      const stored = await this.storedUrls();
      const docs = newBookmarkDocuments(bookmarks, [...queued, ...stored]);
      for (const doc of docs) this.queue(doc);
      return docs.length;
    });
    this.picking = run.catch(() => {});
    return run;
  }

  private queue(doc: IndexDocumentRequest): void {
    const url = doc.metadata.sourcePath!; // newBookmarkDocuments sets it to the bookmark's URL
    this.queued.add(url);
    const settled = () => { this.queued.delete(url); };
    this.index(doc).then(settled, settled);
  }
}
