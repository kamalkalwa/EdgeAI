/**
 * Every IndexedDB database EdgeAI creates, in one place, so that Clear All Data
 * (offscreen.ts) deletes exactly these and a rename cannot silently leave one
 * behind. Model files are not here: they live in the Cache API and are removed
 * by Settings → Delete Downloaded Models.
 */
export const DOCUMENT_DB_NAME = 'edgeai';             // Dexie: documents + chunks
export const VECTOR_DB_NAME = 'edgeai-vector';        // embeddings + BM25 rows, one JSON blob
export const FS_HANDLE_DB_NAME = 'edgeai-fs-handles'; // Obsidian vault directory handle

export const USER_DATABASES: readonly string[] = [DOCUMENT_DB_NAME, VECTOR_DB_NAME, FS_HANDLE_DB_NAME];
