/**
 * Audit Log — what EdgeAI did with your data: each chat question and search,
 * with the passages it retrieved, and each document indexed or deleted.
 *
 * The offscreen document does all of that, and reports each entry to the
 * service worker (AUDIT_ENTRY). The worker keeps the newest 500 (StoredLog,
 * under 'auditLog' in chrome.storage.local), because an offscreen document
 * can't use chrome.storage.
 *
 * Pure functions only — shared by the service worker (recording) and the
 * popup (displaying).
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

const TYPES: ReadonlySet<unknown> = new Set(['chat_query', 'search', 'document_index', 'document_delete']);

/** Entries reported by another context or read from storage, checked field by field. */
export function sanitizeAuditEntries(payload: unknown): AuditEntry[] {
  if (!Array.isArray(payload)) return [];
  const entries: AuditEntry[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    if (typeof e['id'] !== 'string' || typeof e['timestamp'] !== 'number' || !TYPES.has(e['type'])) continue;
    const entry: AuditEntry = { id: e['id'], timestamp: e['timestamp'], type: e['type'] as AuditEntry['type'] };
    if (typeof e['query'] === 'string') entry.query = e['query'];
    if (typeof e['responsePreview'] === 'string') entry.responsePreview = e['responsePreview'];
    if (typeof e['documentTitle'] === 'string') entry.documentTitle = e['documentTitle'];
    if (Array.isArray(e['retrievedChunks'])) {
      entry.retrievedChunks = e['retrievedChunks'].flatMap((c: unknown) => {
        const chunk = (c ?? {}) as Record<string, unknown>;
        return typeof chunk['documentTitle'] === 'string' && typeof chunk['source'] === 'string'
          && typeof chunk['score'] === 'number'
          ? [{ documentTitle: chunk['documentTitle'], source: chunk['source'], score: chunk['score'] }]
          : [];
      });
    }
    entries.push(entry);
  }
  return entries;
}

/** Export audit log as a JSON string (for download). */
export function exportAuditLog(entries: AuditEntry[]): string {
  return JSON.stringify(entries, null, 2);
}
