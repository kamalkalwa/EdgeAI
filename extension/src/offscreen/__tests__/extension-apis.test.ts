/**
 * An offscreen document gets one extension API, chrome.runtime; every other
 * chrome.* is undefined there. The audit log went unrecorded from the day it
 * shipped because the offscreen document wrote it with chrome.storage, and
 * unit tests stub whatever `chrome` they need, so none of them noticed. This
 * reads the modules the offscreen document loads instead.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');

/** Modules the offscreen document loads that also hold code other contexts run. */
const USED_ELSEWHERE: Record<string, string[]> = {
  // getAllBookmarks and flattenTree's types: the service worker reads the bookmarks.
  'lib/connectors/bookmarks.ts': ['bookmarks'],
};

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier);
  else return null; // a package
  return [base, `${base}.ts`, join(base, 'index.ts')].find((p) => p.endsWith('.ts') && existsSync(p)) ?? null;
}

/** Every module of ours that loading `entry` runs, following imports but not `import type`. */
function loadedModules(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    const specifiers = [
      ...source.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'";]*?\bfrom\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]!);
    for (const specifier of specifiers) {
      const path = resolveImport(file, specifier);
      if (path) queue.push(path);
    }
  }
  return [...seen].map((path) => relative(SRC, path)).sort();
}

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('offscreen document', () => {
  const modules = loadedModules(join(SRC, 'offscreen/offscreen.ts'));

  it('finds the modules it loads', () => {
    expect(modules).toEqual(expect.arrayContaining([
      'offscreen/offscreen.ts', 'lib/trust/request-reporter.ts', 'lib/connectors/bookmarks.ts', 'lib/voice/asr.ts',
    ]));
  });

  it('uses no extension API but chrome.runtime', () => {
    const misuses = modules.flatMap((name) => {
      const source = withoutComments(readFileSync(join(SRC, name), 'utf8'));
      const apis = new Set([...source.matchAll(/\bchrome\.(\w+)/g)].map((m) => m[1]!));
      apis.delete('runtime');
      for (const api of USED_ELSEWHERE[name] ?? []) apis.delete(api);
      return [...apis].map((api) => `${name}: chrome.${api}`);
    });
    expect(misuses).toEqual([]);
  });
});
