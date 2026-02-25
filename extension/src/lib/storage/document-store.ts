/**
 * Document Metadata Store — Dexie.js (IndexedDB) (ADR-003)
 *
 * Stores document-level metadata (title, source, char count, chunk count).
 * Chunk content lives in the Orama vector store.
 * This is the source of truth for the "Documents" panel in the popup.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { DocumentMetadata } from '@/lib/types';

class EdgeAIDatabase extends Dexie {
  documents!: EntityTable<DocumentMetadata, 'id'>;

  constructor() {
    super('edgeai');

    this.version(1).stores({
      documents: 'id, source, createdAt, updatedAt',
    });

    // v2: adds sourcePath index required by documentExists()
    this.version(2).stores({
      documents: 'id, source, sourcePath, createdAt, updatedAt',
    });
  }
}

export class DocumentStore {
  private db: EdgeAIDatabase;

  constructor() {
    this.db = new EdgeAIDatabase();
  }

  async open(): Promise<void> {
    await this.db.open();
  }

  async addDocument(doc: DocumentMetadata): Promise<void> {
    await this.db.documents.put(doc);
  }

  async deleteDocument(id: string): Promise<void> {
    await this.db.documents.delete(id);
  }

  async getDocument(id: string): Promise<DocumentMetadata | undefined> {
    return this.db.documents.get(id);
  }

  async listDocuments(): Promise<DocumentMetadata[]> {
    return this.db.documents.orderBy('updatedAt').reverse().toArray();
  }

  async getStats(): Promise<{ documentCount: number; totalChunks: number; totalChars: number }> {
    const docs = await this.db.documents.toArray();
    return {
      documentCount: docs.length,
      totalChunks: docs.reduce((sum, d) => sum + d.chunkCount, 0),
      totalChars: docs.reduce((sum, d) => sum + d.charCount, 0),
    };
  }

  async documentExists(sourcePath: string): Promise<DocumentMetadata | undefined> {
    return this.db.documents.where('sourcePath' as keyof DocumentMetadata).equals(sourcePath).first();
  }
}
