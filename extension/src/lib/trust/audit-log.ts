/**
 * Audit Log — append-only, locally stored activity log.
 *
 * All entries live in chrome.storage.local under key 'auditLog'.
 * Capped at 500 entries (FIFO). Accessible from any extension context.
 */

export interface AuditEntry {
  id: string;
  timestamp: number;
  type: 'chat_query' | 'search' | 'document_index' | 'document_delete';
  query?: string;
  retrievedChunks?: Array<{ documentTitle: string; source: string; score: number }>;
  responsePreview?: string;
  documentTitle?: string;
}

const STORAGE_KEY = 'auditLog';
const MAX_ENTRIES = 500;

/** Append an entry to the audit log (FIFO capped at MAX_ENTRIES). */
export async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEY).catch(() => null);
  const stored = (result as Record<string, unknown> | null)?.[STORAGE_KEY];
  const log: AuditEntry[] = Array.isArray(stored) ? stored : [];

  log.push(entry);

  // FIFO cap
  while (log.length > MAX_ENTRIES) {
    log.shift();
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: log });
}

/** Read all audit log entries. */
export async function getAuditLog(): Promise<AuditEntry[]> {
  const result = await chrome.storage.local.get(STORAGE_KEY).catch(() => null);
  const stored = (result as Record<string, unknown> | null)?.[STORAGE_KEY];
  return Array.isArray(stored) ? stored : [];
}

/** Clear the audit log. */
export async function clearAuditLog(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}

/** Export audit log as a JSON string (for download). */
export function exportAuditLog(entries: AuditEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
