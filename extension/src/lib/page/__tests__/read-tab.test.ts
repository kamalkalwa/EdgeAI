import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  classifyScriptingError, classifyTabUrl, extractPageContent, readTab,
  READ_TAB_MESSAGES, ReadTabError, type ReadTabFailure,
} from '../read-tab';

const EXT = 'chrome-extension://abcdefghijklmnop';

describe('classifyTabUrl', () => {
  it('reads ordinary web pages', () => {
    expect(classifyTabUrl('https://example.com/post', EXT)).toBe('web');
    expect(classifyTabUrl('http://intranet.local/wiki', EXT)).toBe('web');
  });

  it("knows Chrome's own pages, the Web Store and other extensions are off limits", () => {
    for (const url of [
      'chrome://settings',
      'edge://flags',
      'about:blank',
      'view-source:https://example.com/',
      'devtools://devtools/bundled/inspector.html',
      'chrome-extension://someotherextension/page.html',
      'https://chromewebstore.google.com/detail/abc',
      'https://chrome.google.com/webstore/detail/abc',
    ]) {
      expect(classifyTabUrl(url, EXT), url).toBe('restricted');
    }
  });

  it('recognizes its own pages, and only its own', () => {
    expect(classifyTabUrl(`${EXT}/src/popup/popup.html`, EXT)).toBe('own_page');
    expect(classifyTabUrl(`${EXT}evil/page.html`, EXT)).toBe('restricted');
  });

  it('spots PDFs by their path, on the web and on disk', () => {
    expect(classifyTabUrl('https://example.com/paper.PDF', EXT)).toBe('pdf');
    expect(classifyTabUrl('https://example.com/paper.pdf?download=1', EXT)).toBe('pdf');
    expect(classifyTabUrl('file:///Users/me/paper.pdf', EXT)).toBe('pdf');
  });

  it('keeps local files apart: they need a separate switch', () => {
    expect(classifyTabUrl('file:///Users/me/notes.html', EXT)).toBe('file');
  });

  it("doesn't guess when it can't see the URL", () => {
    expect(classifyTabUrl(undefined, EXT)).toBe('unknown');
    expect(classifyTabUrl('', EXT)).toBe('unknown');
    expect(classifyTabUrl('not a url', EXT)).toBe('unknown');
  });
});

describe('classifyScriptingError', () => {
  // Chrome's own wording (extensions/common/permissions/permissions_data.cc).
  const cases: [string, ReadTabFailure, Parameters<typeof classifyScriptingError>[1]][] = [
    ['No tab with id: 123.', 'tab_closed', 'web'],
    ['Cannot access a chrome:// URL', 'restricted', 'unknown'],
    ['The extensions gallery cannot be scripted.', 'restricted', 'unknown'],
    ['Cannot access a chrome-extension:// URL of different extension', 'restricted', 'unknown'],
    ['Cannot access contents of url "chrome-error://chromewebdata/". Extension manifest must request permission to access this host.', 'failed', 'web'],
    ['Cannot access contents of the page. Extension manifest must request permission to access the respective host.', 'no_access', 'unknown'],
    ['Cannot access contents of url "https://example.com/". Extension manifest must request permission to access this host.', 'no_access', 'web'],
    ['Cannot access contents of url "file:///Users/me/notes.html". Extension manifest must request permission to access this host.', 'file_access', 'file'],
    ['Frame with ID 0 was removed.', 'failed', 'web'],
  ];

  it.each(cases)('%s → %s', (message, reason, kind) => {
    expect(classifyScriptingError(message, kind)).toBe(reason);
  });
});

describe('readTab', () => {
  const executeScript = vi.fn();
  const getContexts = vi.fn();
  const extracted = (over: Record<string, unknown> = {}) => [{
    result: { url: 'https://example.com/post', title: 'Post', content: 'Text worth indexing', contentType: 'text/html', ...over },
  }];

  beforeEach(() => {
    executeScript.mockReset();
    getContexts.mockReset().mockResolvedValue([]);
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `${EXT}/${path}`, getContexts, ContextType: { TAB: 'TAB' } },
      scripting: { executeScript },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns what the in-page reader extracted', async () => {
    executeScript.mockResolvedValue(extracted());
    await expect(readTab({ id: 7, url: 'https://example.com/post' })).resolves.toEqual({
      url: 'https://example.com/post', title: 'Post', content: 'Text worth indexing',
    });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, func: extractPageContent });
  });

  it("turns down pages it knows it can't read, without touching the tab", async () => {
    for (const [url, reason] of [
      ['chrome://settings', 'restricted'],
      ['https://chromewebstore.google.com/detail/abc', 'restricted'],
      [`${EXT}/src/popup/popup.html`, 'own_page'],
      ['https://example.com/paper.pdf', 'pdf'],
    ] as const) {
      await expect(readTab({ id: 1, url })).rejects.toMatchObject({ reason });
    }
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("tries a tab whose URL it can't see, and explains Chrome's refusal", async () => {
    executeScript.mockRejectedValue(new Error(
      'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    ));
    const err = await readTab({ id: 3 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReadTabError);
    expect(err).toMatchObject({ reason: 'no_access', message: READ_TAB_MESSAGES.no_access });
  });

  it("recognizes EdgeAI's own tab even when Chrome hides its URL", async () => {
    getContexts.mockResolvedValue([{ contextType: 'TAB', tabId: 9, documentUrl: `${EXT}/src/popup/popup.html` }]);
    await expect(readTab({ id: 9 })).rejects.toMatchObject({ reason: 'own_page' });
    expect(getContexts).toHaveBeenCalledWith({ contextTypes: ['TAB'], tabIds: [9] });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('asks about its own pages only when the URL is hidden', async () => {
    executeScript.mockResolvedValue(extracted());
    await readTab({ id: 7, url: 'https://example.com/post' });
    expect(getContexts).not.toHaveBeenCalled();
  });

  it("recognizes a PDF whose URL didn't say so", async () => {
    executeScript.mockResolvedValue(extracted({ content: '', contentType: 'application/pdf' }));
    await expect(readTab({ id: 4, url: 'https://arxiv.org/pdf/2401.00001' })).rejects.toMatchObject({ reason: 'pdf' });
  });

  it('reports a page without text as empty', async () => {
    executeScript.mockResolvedValue(extracted({ content: '  \n ' }));
    await expect(readTab({ id: 4, url: 'https://example.com/' })).rejects.toMatchObject({ reason: 'empty' });
    executeScript.mockResolvedValue([]);
    await expect(readTab({ id: 4, url: 'https://example.com/' })).rejects.toMatchObject({ reason: 'empty' });
  });

  it('gives up on a page that never answers', async () => {
    vi.useFakeTimers();
    executeScript.mockReturnValue(new Promise(() => {}));
    const outcome = expect(readTab({ id: 5, url: 'https://slow.example.com/' })).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(15_000);
    await outcome;
  });
});

// ─── extractPageContent ───────────────────────────────────────────────────────
// A DOM just big enough for the reader: elements, text nodes, cloneNode,
// remove, tag-name selectors (class and attribute selectors never match) and
// a text-node TreeWalker.

class FakeNode {
  parent: FakeNode | null = null;

  constructor(readonly tag: string | null, readonly text = '', readonly children: FakeNode[] = []) {
    for (const child of children) child.parent = this;
  }

  get textContent(): string {
    return this.tag === null ? this.text : this.children.map((c) => c.textContent).join('');
  }

  cloneNode(): FakeNode {
    return new FakeNode(this.tag, this.text, this.children.map((c) => c.cloneNode()));
  }

  remove(): void {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  querySelectorAll(selectors: string): FakeNode[] {
    const tags = new Set(selectors.split(',').map((s) => s.trim()));
    const found: FakeNode[] = [];
    const visit = (node: FakeNode) => {
      for (const child of node.children) {
        if (child.tag !== null && tags.has(child.tag)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

const el = (tag: string, ...children: (FakeNode | string)[]) =>
  new FakeNode(tag, '', children.map((c) => (typeof c === 'string' ? new FakeNode(null, c) : c)));

function showPage(body: FakeNode | null, contentType = 'text/html'): void {
  vi.stubGlobal('location', { href: 'https://example.com/post' });
  vi.stubGlobal('NodeFilter', { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 });
  vi.stubGlobal('document', {
    title: 'Test page',
    contentType,
    body,
    querySelector: (selector: string) => body?.querySelectorAll(selector)[0] ?? null,
    createTreeWalker: (root: FakeNode, _show: number, filter: { acceptNode: (n: FakeNode) => number }) => {
      const texts: FakeNode[] = [];
      const visit = (node: FakeNode) => {
        for (const child of node.children) {
          if (child.tag === null) texts.push(child);
          else visit(child);
        }
      };
      visit(root);
      let i = 0;
      return {
        nextNode: () => {
          while (i < texts.length) {
            const node = texts[i++]!;
            if (filter.acceptNode(node) === 1) return node;
          }
          return null;
        },
      };
    },
  });
}

const blogPost = () => el('body',
  el('nav', 'Home About Contact'),
  el('article',
    el('h1', 'Local models in the browser'),
    el('p', 'WebGPU makes a 3B model usable.'),
    el('script', 'trackPageView()'),
    el('aside', 'Related posts you might like'),
    el('p', 'ok'),
  ),
  el('footer', '© 2026 Example'),
);

describe('extractPageContent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the article and leaves out navigation, scripts, asides and fragments', () => {
    showPage(blogPost());
    expect(extractPageContent()).toEqual({
      url: 'https://example.com/post',
      title: 'Test page',
      contentType: 'text/html',
      content: 'Local models in the browser WebGPU makes a 3B model usable.',
    });
  });

  it('falls back to the body when the page has no article or main', () => {
    showPage(el('body', el('header', 'Site name'), el('div', 'Plain page text'), el('footer', 'Footer text')));
    expect(extractPageContent().content).toBe('Plain page text');
  });

  it('caps the text at 10,000 characters', () => {
    showPage(el('body', ...Array.from({ length: 30 }, (_, i) => el('p', `${i} ${'x'.repeat(500)}`))));
    expect(extractPageContent().content).toHaveLength(10_000);
  });

  it('copes with a document that has no body', () => {
    showPage(null);
    expect(extractPageContent()).toMatchObject({ content: '' });
  });

  it('passes the MIME type through, so the caller can spot a PDF', () => {
    showPage(el('body', el('embed')), 'application/pdf');
    expect(extractPageContent()).toMatchObject({ contentType: 'application/pdf', content: '' });
  });

  it('runs from its source text alone, which is all executeScript sends to the page', () => {
    const injected = new Function(`return (${extractPageContent.toString()})`)() as typeof extractPageContent;
    showPage(blogPost());
    expect(injected()).toEqual(extractPageContent());
  });
});
