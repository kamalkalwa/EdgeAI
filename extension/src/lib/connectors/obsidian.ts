/**
 * Obsidian Connector (ADR-006)
 *
 * Uses the File System Access API (showDirectoryPicker) to read an Obsidian vault.
 * No API key, no OAuth, no network calls. Permission persists across sessions via IDB.
 *
 * Features:
 * - Recursive .md file reading
 * - YAML frontmatter parsing (tags, title, date)
 * - Incremental re-indexing (skip files unchanged since last index)
 */

import type { IndexDocumentRequest } from '@/lib/types';

const IDB_HANDLE_KEY = 'obsidian-vault-handle';
const IDB_DB_NAME = 'edgeai-fs-handles';
const IDB_STORE = 'handles';


interface FrontMatter {
  title?: string;
  tags?: string[];
  date?: string;
  created?: string;
  aliases?: string[];
}

// ─── Vault Handle Persistence ─────────────────────────────────────────────────

async function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

async function saveVaultHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(handle, IDB_HANDLE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function loadVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openHandleDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(IDB_HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Prompt user to select an Obsidian vault directory.
 * Saves the handle for future use without re-prompting.
 */
export async function selectVault(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ mode: 'read' });
  await saveVaultHandle(handle);
  return handle;
}

/**
 * Check if a previously selected vault handle is still accessible.
 * Returns the handle if accessible, null otherwise.
 */
export async function getExistingVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await loadVaultHandle();
  if (!handle) return null;

  try {
    // Verify permission is still granted
    const permission = await handle.queryPermission({ mode: 'read' });
    if (permission === 'granted') return handle;

    // Try to re-request (only works if called from user gesture context)
    const requested = await handle.requestPermission({ mode: 'read' });
    return requested === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Read all markdown files from a vault directory, yielding IndexDocumentRequests.
 * Call from the offscreen document (has File System Access API support).
 */
export async function* readVault(
  dirHandle: FileSystemDirectoryHandle,
  vaultRoot = '',
  since?: number   // only yield files modified after this timestamp
): AsyncGenerator<IndexDocumentRequest> {
  for await (const [name, entry] of dirHandle.entries()) {
    const entryPath = vaultRoot ? `${vaultRoot}/${name}` : name;

    // Skip Obsidian internal directories
    if (entry.kind === 'directory') {
      if (name.startsWith('.') || name === '_attachments' || name === 'assets') continue;
      yield* readVault(entry as FileSystemDirectoryHandle, entryPath, since);
      continue;
    }

    if (entry.kind !== 'file' || !name.endsWith('.md')) continue;

    const file = await (entry as FileSystemFileHandle).getFile();

    // Skip files not modified since last index
    if (since && file.lastModified <= since) continue;

    // Guard against pathologically large files — 10 MB is generous for a markdown note
    const MAX_FILE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_BYTES) {
      console.warn(`[Obsidian] Skipping oversized file (${file.size} bytes): ${entryPath}`);
      continue;
    }

    const rawContent = await file.text();
    const { frontmatter, body } = parseFrontmatter(rawContent);

    const title = frontmatter.title ??
      name.replace(/\.md$/, '').replace(/[-_]/g, ' ');

    const createdAt = frontmatter.date
      ? new Date(frontmatter.date).getTime()
      : frontmatter.created
      ? new Date(frontmatter.created).getTime()
      : file.lastModified;

    yield {
      content: body,
      metadata: {
        title,
        source: 'obsidian',
        sourcePath: entryPath,
        createdAt: isNaN(createdAt) ? file.lastModified : createdAt,
        updatedAt: file.lastModified,
        tags: frontmatter.tags ?? [],
      },
    };
  }
}

// ─── Frontmatter Parser ───────────────────────────────────────────────────────

function parseFrontmatter(content: string): { frontmatter: FrontMatter; body: string } {
  const YAML_FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(YAML_FENCE);

  if (!match?.[1]) {
    return { frontmatter: {}, body: content };
  }

  const yamlStr = match[1];
  const body = content.slice(match[0].length);

  // Minimal YAML parser (covers common Obsidian frontmatter fields)
  const frontmatter: FrontMatter = {};
  const lines = yamlStr.split('\n');

  for (const line of lines) {
    const [rawKey, ...valueParts] = line.split(':');
    const key = rawKey?.trim();
    const value = valueParts.join(':').trim();

    if (!key || !value) continue;

    if (key === 'title') frontmatter.title = stripQuotes(value);
    else if (key === 'date' || key === 'created') frontmatter[key] = stripQuotes(value);
    else if (key === 'tags') {
      // tags: [tag1, tag2] or tags: tag1, tag2
      frontmatter.tags = value
        .replace(/[\[\]]/g, '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  return { frontmatter, body };
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, '');
}
