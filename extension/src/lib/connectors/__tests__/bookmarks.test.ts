import { describe, it, expect } from 'vitest';
import { isSafeUrl, flattenTree, type BookmarkInfo } from '../bookmarks';

// ─── isSafeUrl() ──────────────────────────────────────────────────────────────

describe('isSafeUrl() — allowed URLs', () => {
  it('allows public HTTPS URLs', () => {
    expect(isSafeUrl('https://github.com/some/repo')).toBe(true);
    expect(isSafeUrl('https://www.wikipedia.org/wiki/AI')).toBe(true);
  });

  it('allows public HTTP URLs', () => {
    expect(isSafeUrl('http://example.com/page')).toBe(true);
  });
});

describe('isSafeUrl() — blocked private/internal URLs', () => {
  it('blocks localhost', () => {
    expect(isSafeUrl('http://localhost')).toBe(false);
    expect(isSafeUrl('http://localhost:3000/api')).toBe(false);
    expect(isSafeUrl('https://LOCALHOST/')).toBe(false);
  });

  it('blocks 127.x loopback range', () => {
    expect(isSafeUrl('http://127.0.0.1')).toBe(false);
    expect(isSafeUrl('http://127.0.0.1:8080/secret')).toBe(false);
    expect(isSafeUrl('http://127.255.255.255')).toBe(false);
  });

  it('blocks 10.x private range', () => {
    expect(isSafeUrl('http://10.0.0.1')).toBe(false);
    expect(isSafeUrl('http://10.255.255.255/api')).toBe(false);
  });

  it('blocks 172.16–31.x private range', () => {
    expect(isSafeUrl('http://172.16.0.1')).toBe(false);
    expect(isSafeUrl('http://172.31.255.255')).toBe(false);
    expect(isSafeUrl('http://172.15.0.1')).toBe(true);  // just outside range
    expect(isSafeUrl('http://172.32.0.1')).toBe(true);  // just outside range
  });

  it('blocks 192.168.x.x private range', () => {
    expect(isSafeUrl('http://192.168.0.1')).toBe(false);
    expect(isSafeUrl('http://192.168.100.200')).toBe(false);
  });

  it('blocks IPv6 loopback ::1 (bare)', () => {
    // URL spec exposes hostname as '[::1]' — the fix strips brackets before matching
    expect(isSafeUrl('http://[::1]')).toBe(false);
    expect(isSafeUrl('http://[::1]:8080/api')).toBe(false);
  });

  it('blocks IPv6 link-local fe80::', () => {
    expect(isSafeUrl('http://[fe80::1]')).toBe(false);
  });

  it('blocks 0.0.0.0', () => {
    expect(isSafeUrl('http://0.0.0.0')).toBe(false);
  });
});

describe('isSafeUrl() — invalid / non-HTTP schemes', () => {
  it('blocks ftp://', () => {
    expect(isSafeUrl('ftp://ftp.example.com/file')).toBe(false);
  });

  it('blocks file://', () => {
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('blocks chrome-extension://', () => {
    expect(isSafeUrl('chrome-extension://abc/popup.html')).toBe(false);
  });

  it('returns false for malformed URLs', () => {
    expect(isSafeUrl('not-a-url')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('http://')).toBe(false);
  });
});

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
