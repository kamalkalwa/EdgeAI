/**
 * Reads a tab's main text for indexing, on demand.
 *
 * EdgeAI has no content script and no host permissions. It can read a page
 * only after the user invokes it there — toolbar icon, keyboard shortcut or
 * the right-click menu — which is what Chrome's activeTab grant covers. The
 * reader is injected with chrome.scripting.executeScript at that moment,
 * returns the text, and leaves nothing behind in the page.
 */

import type { PageContentForIndex } from '@/lib/types';

export type ReadTabFailure =
  | 'restricted'   // chrome://, the Web Store, other extensions: Chrome forbids scripting them
  | 'own_page'     // one of EdgeAI's own pages, e.g. the onboarding tab
  | 'pdf'          // Chrome's PDF viewer has no page text to read
  | 'file_access'  // file:// needs "Allow access to file URLs"
  | 'no_access'    // EdgeAI wasn't opened on this tab (e.g. side panel after switching tabs)
  | 'empty'
  | 'timeout'
  | 'tab_closed'
  | 'failed';      // error page, page still loading, anything else

export const READ_TAB_MESSAGES: Record<ReadTabFailure, string> = {
  restricted: "Chrome doesn't let extensions read its own pages or the Web Store.",
  own_page: 'Go to the page you want to index, click the EdgeAI icon in the toolbar, then Index this tab.',
  pdf: 'This is a PDF. Save it, then use Import → PDF Files.',
  file_access: 'To read local files, turn on "Allow access to file URLs" for EdgeAI in chrome://extensions.',
  no_access: 'EdgeAI can only read a page you open it on. Click the EdgeAI icon in the toolbar on this page, then try again.',
  empty: 'This page has no text EdgeAI can index.',
  timeout: "The page didn't respond. Wait for it to finish loading and try again.",
  tab_closed: 'That tab was closed.',
  failed: "Couldn't read this page. Wait for it to finish loading and try again.",
};

export class ReadTabError extends Error {
  constructor(readonly reason: ReadTabFailure) {
    super(READ_TAB_MESSAGES[reason]);
    this.name = 'ReadTabError';
  }
}

type TabKind = 'web' | 'file' | 'pdf' | 'restricted' | 'own_page' | 'unknown';

/**
 * What kind of page a tab shows, from its URL. `url` is undefined when EdgeAI
 * has no access to the tab — Chrome hides it without the activeTab grant.
 */
export function classifyTabUrl(url: string | undefined, extensionOrigin: string): TabKind {
  if (!url) return 'unknown';
  if (url.startsWith(`${extensionOrigin}/`)) return 'own_page';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'unknown';
  }
  const isPdf = u.pathname.toLowerCase().endsWith('.pdf');
  switch (u.protocol) {
    case 'https:':
    case 'http:':
      if (u.hostname === 'chromewebstore.google.com' ||
          (u.hostname === 'chrome.google.com' && u.pathname.startsWith('/webstore'))) return 'restricted';
      return isPdf ? 'pdf' : 'web';
    case 'file:':
      return isPdf ? 'pdf' : 'file';
    default:
      return 'restricted'; // chrome:, chrome-extension:, edge:, about:, view-source:, devtools:, data:
  }
}

/** Why executeScript refused, from Chrome's error text (stable for years, but only a hint). */
export function classifyScriptingError(message: string, kind: TabKind): ReadTabFailure {
  if (/No tab with id/i.test(message)) return 'tab_closed';
  // The tab shows Chrome's "site can't be reached" page (the tab keeps the site's URL).
  if (/chrome-error:/i.test(message)) return 'failed';
  if (/cannot be scripted|Cannot access a (chrome|chrome-extension|chrome-untrusted|devtools|edge|about):/i.test(message)) {
    return 'restricted';
  }
  if (/Cannot access contents of|must request permission/i.test(message)) {
    return kind === 'file' ? 'file_access' : 'no_access';
  }
  return 'failed';
}

const READ_TIMEOUT_MS = 15_000;

/**
 * The tab's main text. Throws ReadTabError with a message fit for the user.
 * Callers pass the tab they got from chrome.tabs (or the context-menu event).
 */
export async function readTab(tab: { id: number; url?: string }): Promise<PageContentForIndex> {
  const kind = classifyTabUrl(tab.url, chrome.runtime.getURL('').replace(/\/$/, ''));
  if (kind === 'restricted' || kind === 'own_page' || kind === 'pdf') throw new ReadTabError(kind);
  // Chrome hides the URL of any tab EdgeAI hasn't been granted, its own pages
  // included (the onboarding tab, say), and refuses to script them with the same
  // error as any other page. Its own documents it can always list.
  if (kind === 'unknown' && await isOwnTab(tab.id)) throw new ReadTabError('own_page');

  let page: ExtractedPage | undefined;
  try {
    const [result] = await withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageContent }),
      READ_TIMEOUT_MS,
    );
    page = result?.result as ExtractedPage | undefined;
  } catch (err) {
    if (err instanceof ReadTabError) throw err;
    throw new ReadTabError(classifyScriptingError(err instanceof Error ? err.message : String(err), kind));
  }
  // A PDF whose URL doesn't end in .pdf (arxiv.org/pdf/…) shows up here.
  if (page?.contentType === 'application/pdf') throw new ReadTabError('pdf');
  if (!page?.content.trim()) throw new ReadTabError('empty');
  return { url: page.url, title: page.title, content: page.content };
}

async function isOwnTab(tabId: number): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.TAB],
    tabIds: [tabId],
  }).catch(() => []);
  return contexts.length > 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ReadTabError('timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** What the in-page reader returns: the page, plus its MIME type. */
export interface ExtractedPage extends PageContentForIndex {
  contentType: string;
}

/**
 * Runs inside the page, in the extension's isolated world. executeScript
 * serializes it with toString(), so it must not reference anything outside
 * its own body — no imports, no module constants, no helpers.
 */
export function extractPageContent(): ExtractedPage {
  const MAX_INDEX_CHARS = 10_000;
  const page = { url: location.href, title: document.title, contentType: document.contentType };

  const contentRoot =
    document.querySelector('article') ??
    document.querySelector('[role="main"]') ??
    document.querySelector('main') ??
    document.querySelector('.post-content, .article-content, .entry-content, #content') ??
    document.body;
  if (!contentRoot) return { ...page, content: '' };

  // Clone and strip noise
  const clone = contentRoot.cloneNode(true) as HTMLElement;
  const noiseSelectors = [
    'script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside',
    '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
    '.sidebar', '.comments', '.ad', '.advertisement', '.social-share',
    '.related-posts', '.newsletter-signup', 'iframe',
  ];
  clone.querySelectorAll(noiseSelectors.join(',')).forEach((el) => el.remove());

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const text = node.textContent?.trim();
      if (!text || text.length < 3) return NodeFilter.FILTER_SKIP;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textParts: string[] = [];
  let totalLength = 0;
  let node = walker.nextNode();
  while (node && totalLength < MAX_INDEX_CHARS) {
    const text = node.textContent?.trim() ?? '';
    if (text.length > 0) {
      textParts.push(text);
      totalLength += text.length;
    }
    node = walker.nextNode();
  }

  return { ...page, content: textParts.join(' ').slice(0, MAX_INDEX_CHARS) };
}
