import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IndexDocumentRequest } from '@/lib/types';
import {
  BookmarkImporter, flattenTree, getAllBookmarks, newBookmarkDocuments, type BookmarkInfo,
} from '../bookmarks';

// ─── flattenTree() ─────────────────────────────────────────────────────────────

describe('flattenTree()', () => {
  it('returns empty for empty input', () => {
    const out: BookmarkInfo[] = [];
    flattenTree([], out);
    expect(out).toHaveLength(0);
  });

  it('extracts leaf bookmarks (nodes with url)', () => {
    const nodes = [
      { id: '1', title: 'GitHub', url: 'https://github.com', dateAdded: 1000, children: [] },
    ] as chrome.bookmarks.BookmarkTreeNode[];
    const out: BookmarkInfo[] = [];
    flattenTree(nodes, out);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: '1', title: 'GitHub', url: 'https://github.com', dateAdded: 1000 });
  });

  it('skips folder nodes (no url)', () => {
    const nodes = [
      {
        id: 'folder-1', title: 'Dev', children: [
          { id: '2', title: 'MDN', url: 'https://developer.mozilla.org', children: [] },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[];
    const out: BookmarkInfo[] = [];
    flattenTree(nodes, out);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('2');
  });

  it('flattens deeply nested bookmarks', () => {
    const nodes = [
      {
        id: 'root', title: 'Bookmarks', children: [
          {
            id: 'sub', title: 'Work', children: [
              { id: '3', title: 'Jira', url: 'https://jira.example.com', children: [] },
              { id: '4', title: 'Confluence', url: 'https://confluence.example.com', children: [] },
            ],
          },
        ],
      },
    ] as chrome.bookmarks.BookmarkTreeNode[];
    const out: BookmarkInfo[] = [];
    flattenTree(nodes, out);
    expect(out).toHaveLength(2);
    expect(out.map(b => b.id)).toEqual(['3', '4']);
  });

  it('uses url as title when title is empty', () => {
    const nodes = [
      { id: '5', title: '', url: 'https://example.com', children: [] },
    ] as chrome.bookmarks.BookmarkTreeNode[];
    const out: BookmarkInfo[] = [];
    flattenTree(nodes, out);
    expect(out[0]?.title).toBe('https://example.com');
  });
});

// ─── newBookmarkDocuments() ────────────────────────────────────────────────────

describe('newBookmarkDocuments()', () => {
  const bookmark = (id: string, url: string, title = `Bookmark ${id}`): BookmarkInfo =>
    ({ id, title, url, dateAdded: 1000 });

  it('indexes the title and URL, dated when the bookmark was added', () => {
    expect(newBookmarkDocuments([bookmark('1', 'https://github.com', 'GitHub')], [])).toEqual([{
      content: 'GitHub\nhttps://github.com',
      metadata: {
        title: 'GitHub', source: 'bookmark', sourcePath: 'https://github.com', createdAt: 1000, updatedAt: 1000,
      },
    }]);
  });

  it('skips bookmarks already imported, so importing again only adds new ones', () => {
    const docs = newBookmarkDocuments(
      [bookmark('1', 'https://a.example'), bookmark('2', 'https://b.example')],
      ['https://a.example'],
    );
    expect(docs.map((d) => d.metadata.sourcePath)).toEqual(['https://b.example']);
  });

  it('imports a URL bookmarked in two folders once', () => {
    expect(newBookmarkDocuments([bookmark('1', 'https://a.example'), bookmark('2', 'https://a.example')], []))
      .toHaveLength(1);
  });
});

// ─── BookmarkImporter ──────────────────────────────────────────────────────────

describe('BookmarkImporter', () => {
  const A = 'https://a.example';
  const B = 'https://b.example';
  const bookmark = (url: string): BookmarkInfo => ({ id: url, title: url, url });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  /** An indexing queue that holds each document until the test stores or fails it. */
  function fakeQueue() {
    const queued: string[] = []; // every document queued, in order: a repeat is a duplicate
    const stored: string[] = [];
    const settle = new Map<string, () => void>();
    const index = (doc: IndexDocumentRequest) => new Promise<void>((resolve) => {
      queued.push(doc.metadata.sourcePath!);
      settle.set(doc.metadata.sourcePath!, resolve);
    });
    return {
      queued, stored, index,
      storedUrls: async () => [...stored],
      /** Stored first, then the job settles: the order the offscreen queue keeps. */
      store: async (url: string) => { stored.push(url); settle.get(url)!(); await tick(); },
      fail: async (url: string) => { settle.get(url)!(); await tick(); },
    };
  }

  it('queues the bookmarks not imported yet and says how many', async () => {
    const q = fakeQueue();
    q.stored.push(A);
    const importer = new BookmarkImporter(q.index, q.storedUrls);
    await expect(importer.import([bookmark(A), bookmark(B)])).resolves.toBe(1);
    expect(q.queued).toEqual([B]);
  });

  it('skips bookmarks an earlier import queued that are not indexed yet', async () => {
    const q = fakeQueue();
    const importer = new BookmarkImporter(q.index, q.storedUrls);
    await importer.import([bookmark(A), bookmark(B)]);
    await expect(importer.import([bookmark(A), bookmark(B)])).resolves.toBe(0);
    expect(q.queued).toEqual([A, B]);
  });

  it('skips a bookmark that finishes indexing while the store is being read', async () => {
    const q = fakeQueue();
    let duringRead: (() => Promise<void>) | undefined;
    const importer = new BookmarkImporter(q.index, async () => {
      const before = [...q.stored];
      await duringRead?.(); // A is stored and leaves the queue after this read began
      return before;
    });
    await importer.import([bookmark(A)]);
    duringRead = () => q.store(A);
    await expect(importer.import([bookmark(A)])).resolves.toBe(0);
    expect(q.queued).toEqual([A]);
  });

  it('picks one import at a time, so two started together queue each bookmark once', async () => {
    const q = fakeQueue();
    const importer = new BookmarkImporter(q.index, q.storedUrls);
    const added = await Promise.all([
      importer.import([bookmark(A), bookmark(B)]),
      importer.import([bookmark(A), bookmark(B)]),
    ]);
    expect(added).toEqual([2, 0]);
    expect(q.queued).toEqual([A, B]);
  });

  it('queues a bookmark again once indexing it has failed', async () => {
    const q = fakeQueue();
    const importer = new BookmarkImporter(q.index, q.storedUrls);
    await importer.import([bookmark(A)]);
    await q.fail(A);
    await expect(importer.import([bookmark(A)])).resolves.toBe(1);
    expect(q.queued).toEqual([A, A]);
  });

  it('keeps importing after an import fails', async () => {
    const q = fakeQueue();
    let storeReady = false;
    const importer = new BookmarkImporter(q.index, async () => {
      if (!storeReady) throw new Error('Storage not initialized');
      return q.stored;
    });
    await expect(importer.import([bookmark(A)])).rejects.toThrow('Storage not initialized');
    storeReady = true;
    await expect(importer.import([bookmark(A)])).resolves.toBe(1);
  });
});

// ─── getAllBookmarks() ─────────────────────────────────────────────────────────

describe('getAllBookmarks()', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fails with a clear error until the user allows bookmark access', async () => {
    vi.stubGlobal('chrome', {});
    await expect(getAllBookmarks()).rejects.toThrow('permission to read bookmarks');
  });

  it('flattens the tree Chrome returns', async () => {
    vi.stubGlobal('chrome', {
      bookmarks: {
        getTree: async () => [{ id: '0', title: '', children: [{ id: '1', title: 'GitHub', url: 'https://github.com' }] }],
      },
    });
    await expect(getAllBookmarks()).resolves.toEqual([
      { id: '1', title: 'GitHub', url: 'https://github.com', dateAdded: undefined },
    ]);
  });
});
