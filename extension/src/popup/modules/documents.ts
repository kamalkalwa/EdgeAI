/**
 * Documents — import handlers, preview modal, and document list.
 */

import type { Message, DocumentMetadata } from '@/lib/types';
import { formatBytes } from '@/lib/utils';
import { state } from './state';
import {
  $, sourceIcon,
  btnImportObsidian, btnImportPdf, btnImportBookmarks, pdfFileInput,
  previewModal, previewModalTitle, previewModalMeta, previewModalBody,
  previewModalClose, previewModalDelete, previewSourceIcon, previewFooterNote,
} from './dom';
import { appendMessage } from './chat';

// ─── Import Helpers ──────────────────────────────────────────────────────────

function checkModelsReady(btn: HTMLButtonElement): boolean {
  if (state.embeddingsReady) return false;
  const label = btn.querySelector('.label');
  if (label) {
    const orig = label.textContent;
    label.textContent = 'Wait: loading embeddings…';
    setTimeout(() => { label.textContent = orig; }, 3000);
  }
  return true;
}

function setImportProgress(progressEl: HTMLElement, active: boolean, indeterminate = false): void {
  if (active) {
    progressEl.classList.add('active');
    if (indeterminate) progressEl.classList.add('indeterminate');
    else progressEl.classList.remove('indeterminate');
  } else {
    progressEl.classList.remove('active', 'indeterminate');
    const fill = progressEl.querySelector('.import-progress-fill') as HTMLElement | null;
    if (fill) fill.style.width = '0%';
  }
}

// ─── Document Preview Modal ──────────────────────────────────────────────────

let previewDocId: string | null = null;

function openPreview(doc: DocumentMetadata): void {
  previewDocId = doc.id;

  previewSourceIcon.textContent = sourceIcon(doc.source);
  previewModalTitle.textContent = doc.title;

  const date = new Date(doc.updatedAt).toLocaleDateString();
  previewModalMeta.textContent = `${doc.source} · ${doc.chunkCount} chunks · ${formatBytes(doc.charCount)} · ${date}`;

  if (doc.preview) {
    previewModalBody.textContent = doc.preview;
    const truncated = doc.charCount > 500;
    previewFooterNote.textContent = truncated
      ? `Showing first 500 of ${doc.charCount.toLocaleString()} characters`
      : `${doc.charCount.toLocaleString()} characters total`;
  } else {
    previewModalBody.textContent = '(No preview available — re-import to generate one)';
    previewFooterNote.textContent = '';
  }

  previewModal.classList.remove('hidden');
}

function closePreview(): void {
  previewModal.classList.add('hidden');
  previewDocId = null;
}

// ─── Documents List ──────────────────────────────────────────────────────────

export async function loadDocumentsList(): Promise<void> {
  const docsList = $('docs-list');
  const docsToolbar = $('docs-toolbar');
  docsList.innerHTML = '<div class="empty-state"><div style="font-size:20px">⏳</div><p>Loading…</p></div>';
  docsToolbar.style.display = 'none';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'LIST_DOCUMENTS' });
    const docs = (response?.payload ?? []) as DocumentMetadata[];

    if (docs.length === 0) {
      docsList.innerHTML = `
        <div class="empty-state">
          <div style="font-size:32px">📭</div>
          <p>No documents indexed yet.<br>Import your Obsidian vault or PDFs to get started.</p>
        </div>`;
      return;
    }

    docsToolbar.style.display = 'flex';
    $('docs-count').textContent = `${docs.length} document${docs.length === 1 ? '' : 's'}`;

    docsList.innerHTML = '';
    for (const doc of docs) {
      const item = document.createElement('div');
      item.className = 'doc-item';

      const docSourceIcon = document.createElement('div');
      docSourceIcon.className = 'doc-source-icon';
      docSourceIcon.textContent = sourceIcon(doc.source);

      const docInfo = document.createElement('div');
      docInfo.className = 'doc-info';

      const docTitle = document.createElement('div');
      docTitle.className = 'doc-title';
      docTitle.textContent = doc.title;

      const docMeta = document.createElement('div');
      docMeta.className = 'doc-meta';
      const date = new Date(doc.updatedAt).toLocaleDateString();
      docMeta.textContent = `${Number(doc.chunkCount)} chunks · ${formatBytes(Number(doc.charCount))} · ${date}`;

      docInfo.appendChild(docTitle);
      docInfo.appendChild(docMeta);

      const actions = document.createElement('div');
      actions.className = 'doc-actions';

      const previewBtn = document.createElement('button');
      previewBtn.className = 'doc-action-btn preview-btn';
      previewBtn.title = 'Preview content';
      previewBtn.setAttribute('aria-label', 'Preview document');
      previewBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>`;
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPreview(doc);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'doc-action-btn delete-btn';
      deleteBtn.title = 'Delete document';
      deleteBtn.setAttribute('aria-label', 'Delete document');
      deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
      </svg>`;
      deleteBtn.dataset['id'] = String(doc.id);

      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const docId = (e.currentTarget as HTMLElement).dataset['id'];
        if (!docId) return;
        await chrome.runtime.sendMessage({ type: 'DELETE_DOCUMENT', payload: { documentId: docId } });
        item.remove();
        const remaining = docsList.querySelectorAll('.doc-item').length;
        if (remaining === 0) {
          docsToolbar.style.display = 'none';
          docsList.innerHTML = `
            <div class="empty-state">
              <div style="font-size:32px">📭</div>
              <p>No documents indexed yet.<br>Import your Obsidian vault or PDFs to get started.</p>
            </div>`;
        } else {
          $('docs-count').textContent = `${remaining} document${remaining === 1 ? '' : 's'}`;
        }
      });

      actions.appendChild(previewBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(docSourceIcon);
      item.appendChild(docInfo);
      item.appendChild(actions);
      docsList.appendChild(item);
    }
  } catch {
    docsList.innerHTML = '<div class="empty-state"><p>Failed to load documents.</p></div>';
  }
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

export function initDocumentListeners(): void {
  // Index error listener
  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === 'INDEX_ERROR') {
      const { error } = (message.payload ?? {}) as { error?: string };
      appendMessage('system-notice', `Import failed: ${error ?? 'Unknown error'}`);
    }
  });

  // Obsidian import
  btnImportObsidian.addEventListener('click', async () => {
    if (checkModelsReady(btnImportObsidian)) return;

    const progressEl = $('obsidian-progress');
    try {
      btnImportObsidian.disabled = true;
      btnImportObsidian.querySelector('.label')!.textContent = 'Opening vault…';
      setImportProgress(progressEl, true, true);

      const { selectVault, readVault } = await import('@/lib/connectors/obsidian');
      const vaultHandle = await selectVault();

      let sent = 0;
      let indexed = 0;
      btnImportObsidian.querySelector('.label')!.textContent = 'Indexing…';

      const onIndexDone = (message: Message) => {
        if (message.type === 'INDEX_DONE' || message.type === 'INDEX_ERROR') {
          indexed++;
          btnImportObsidian.querySelector('.label')!.textContent = `Indexing… ${indexed}/${sent}`;
          if (indexed >= sent) {
            chrome.runtime.onMessage.removeListener(onIndexDone);
            setImportProgress(progressEl, false);
            btnImportObsidian.querySelector('.label')!.textContent = `✓ ${indexed} files indexed`;
            setTimeout(() => {
              btnImportObsidian.querySelector('.label')!.textContent = 'Obsidian Vault';
              btnImportObsidian.disabled = false;
            }, 3000);
          }
        }
      };
      chrome.runtime.onMessage.addListener(onIndexDone);

      for await (const doc of readVault(vaultHandle)) {
        await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
        sent++;
        btnImportObsidian.querySelector('.label')!.textContent = `Sending… ${sent} files`;
      }

      if (sent === 0) {
        chrome.runtime.onMessage.removeListener(onIndexDone);
        setImportProgress(progressEl, false);
        btnImportObsidian.querySelector('.label')!.textContent = 'No .md files found';
        setTimeout(() => {
          btnImportObsidian.querySelector('.label')!.textContent = 'Obsidian Vault';
          btnImportObsidian.disabled = false;
        }, 3000);
      } else {
        btnImportObsidian.querySelector('.label')!.textContent = `Indexing… 0/${sent}`;
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(onIndexDone);
          if (indexed < sent) {
            setImportProgress(progressEl, false);
            btnImportObsidian.querySelector('.label')!.textContent = `✓ ${indexed}/${sent} indexed`;
            setTimeout(() => {
              btnImportObsidian.querySelector('.label')!.textContent = 'Obsidian Vault';
              btnImportObsidian.disabled = false;
            }, 3000);
          }
        }, 300_000);
      }
    } catch (err) {
      setImportProgress(progressEl, false);
      console.error(err);
      btnImportObsidian.querySelector('.label')!.textContent = 'Obsidian Vault';
      btnImportObsidian.disabled = false;
    }
  });

  // PDF import
  btnImportPdf.addEventListener('click', () => {
    pdfFileInput.click();
  });

  pdfFileInput.addEventListener('change', async () => {
    const files = pdfFileInput.files;
    if (!files || files.length === 0) return;
    if (checkModelsReady(btnImportPdf)) { pdfFileInput.value = ''; return; }

    const progressEl = $('pdf-progress');
    btnImportPdf.disabled = true;
    setImportProgress(progressEl, true, true);

    const { indexPdfFiles } = await import('@/lib/connectors/pdf');
    let count = 0;

    try {
      for await (const doc of indexPdfFiles(files)) {
        await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
        count++;
        btnImportPdf.querySelector('.label')!.textContent = `Indexing… ${count} / ${files.length} PDFs`;
      }
    } catch (err) {
      console.error(err);
    }

    setImportProgress(progressEl, false);
    btnImportPdf.querySelector('.label')!.textContent = `✓ ${count} PDFs indexed`;
    pdfFileInput.value = '';
    setTimeout(() => {
      btnImportPdf.querySelector('.label')!.textContent = 'PDF Files';
      btnImportPdf.disabled = false;
    }, 3000);
  });

  // Bookmarks import
  btnImportBookmarks.addEventListener('click', async () => {
    if (checkModelsReady(btnImportBookmarks)) return;

    const progressEl = $('bookmarks-progress');
    btnImportBookmarks.disabled = true;
    btnImportBookmarks.querySelector('.label')!.textContent = 'Importing bookmarks…';
    setImportProgress(progressEl, true, true);

    const { indexBookmarkMetadataOnly } = await import('@/lib/connectors/bookmarks');
    let count = 0;

    try {
      for await (const doc of indexBookmarkMetadataOnly()) {
        await chrome.runtime.sendMessage({ type: 'INDEX_DOCUMENT', payload: doc });
        count++;
      }
    } catch (err) {
      console.error(err);
    }

    setImportProgress(progressEl, false);
    btnImportBookmarks.querySelector('.label')!.textContent = `✓ ${count} bookmarks`;
    setTimeout(() => {
      btnImportBookmarks.querySelector('.label')!.textContent = 'Chrome Bookmarks';
      btnImportBookmarks.disabled = false;
    }, 3000);
  });

  // Preview modal
  previewModalClose.addEventListener('click', closePreview);

  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closePreview();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
      closePreview();
    }
  });

  previewModalDelete.addEventListener('click', async () => {
    if (!previewDocId) return;

    if (previewModalDelete.dataset['confirm'] !== 'true') {
      previewModalDelete.textContent = 'Confirm delete';
      previewModalDelete.dataset['confirm'] = 'true';
      setTimeout(() => {
        previewModalDelete.textContent = 'Delete document';
        delete previewModalDelete.dataset['confirm'];
      }, 3000);
      return;
    }

    await chrome.runtime.sendMessage({
      type: 'DELETE_DOCUMENT',
      payload: { documentId: previewDocId },
    });

    closePreview();
    loadDocumentsList();
  });

  // Refresh button
  $('btn-refresh-docs').addEventListener('click', loadDocumentsList);
}
