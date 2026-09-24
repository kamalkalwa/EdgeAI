import { describe, it, expect, vi, afterEach } from 'vitest';
import { flattenTree, getAllBookmarks, newBookmarkDocuments, type BookmarkInfo } from '../bookmarks';

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
