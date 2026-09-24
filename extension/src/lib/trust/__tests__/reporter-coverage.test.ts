/**
 * The Trust Panel's network log is only as complete as its reporters: every
 * page EdgeAI ships has to start one (request-reporter.ts), and so does the
 * service worker. These checks read the source, so a new page or worker that
 * forgets fails here instead of leaving a quiet gap in the log.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '../../..');
const REPORTER_CALL = /\breportNetworkRequests\(\s*'[\w-]+'/;

function filesUnder(dir: string, extension: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : filesUnder(path, extension);
    return path.endsWith(extension) ? [path] : [];
  });
}

const pages = filesUnder(SRC, '.html').map((path) => [relative(SRC, path), path] as const);

describe('network reporters', () => {
  it('finds the pages to check', () => {
    expect(pages.map(([name]) => name)).toEqual(expect.arrayContaining([
      'offscreen/offscreen.html', 'popup/popup.html', 'privacy/privacy.html',
    ]));
  });

  it.each(pages)('%s reports its requests', (_name, page) => {
    const html = readFileSync(page, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]!);

    if (scripts.length === 0) {
      // No script, so no reporter: the page must not load anything remote.
      // Links (<a href>) are fine, since nothing is fetched until someone follows one.
      expect(html).not.toMatch(/<(?:script|link|img|iframe|video|audio|source|embed|object)\b[^>]*\b(?:src|href)="(?:https?:)?\/\//i);
      expect(html).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//i);
      expect(html).not.toMatch(/@import/i);
      return;
    }
    for (const src of scripts) {
      expect(src, 'scripts ship inside the extension').not.toMatch(/^(?:https?:)?\/\//);
      expect(readFileSync(resolve(dirname(page), src), 'utf8')).toMatch(REPORTER_CALL);
    }
  });

  it('the service worker reports its own requests', () => {
    const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8')) as {
      background: { service_worker: string };
    };
    expect(readFileSync(join(SRC, '..', manifest.background.service_worker), 'utf8')).toMatch(REPORTER_CALL);
  });

  it('no code starts a worker the reporters would miss', () => {
    // A worker's requests land in its own timeline, which no page reporter
    // sees. The one worker EdgeAI runs is PDF.js's: it parses the bytes it's
    // handed and fetches nothing, as long as no cMap, font or wasm URL is set.
    const starters = filesUnder(SRC, '.ts')
      .filter((file) => /\bnew (?:Shared)?Worker\(|WebWorkerMLCEngine|ServiceWorkerMLCEngine|\bproxy\s*=\s*true/
        .test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));
    expect(starters).toEqual([]);
    expect(readFileSync(join(SRC, 'lib/connectors/pdf.ts'), 'utf8'))
      .not.toMatch(/cMapUrl|standardFontDataUrl|wasmUrl|iccUrl/);
  });
});
