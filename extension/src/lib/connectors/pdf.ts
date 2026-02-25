/**
 * PDF Connector (ADR-006)
 *
 * Uses pdf.js to extract text from PDF files.
 * Preserves page numbers for citation metadata.
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { IndexDocumentRequest } from '@/lib/types';

// Use Vite's ?url import to bundle the worker as an extension asset.
// At runtime the URL is chrome-extension://ID/assets/pdf.worker-HASH.mjs,
// which satisfies worker-src 'self' in the extension CSP.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// TextItem is the union member that has `str`; TextMarkedContent does not.

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

export async function indexPdfFile(file: File): Promise<IndexDocumentRequest> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(
      `PDF "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB — exceeds the 50 MB limit. ` +
      `Split it into smaller files before importing.`
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  let pdfDoc: PDFDocumentProxy;
  try {
    const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
    pdfDoc = await loadingTask.promise;
  } catch (err) {
    throw new Error(`Failed to parse PDF "${file.name}": ${err instanceof Error ? err.message : err}`);
  }

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page: PDFPageProxy = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();

    const pageText = content.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str + (item.hasEOL ? '\n' : ' '))
      .join('')
      .trim();

    if (pageText.length > 0) {
      // Tag each page block for citation metadata
      pageTexts.push(`[Page ${pageNum}]\n${pageText}`);
    }
  }

  const fullText = pageTexts.join('\n\n');
  const title = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

  return {
    content: fullText,
    metadata: {
      title,
      source: 'pdf',
      sourcePath: file.name,
      createdAt: file.lastModified,
      updatedAt: file.lastModified,
    },
  };
}

/**
 * Process multiple PDF files from a FileList (drag-and-drop or file input).
 */
export async function* indexPdfFiles(
  files: FileList | File[]
): AsyncGenerator<IndexDocumentRequest> {
  const fileArray = files instanceof FileList ? Array.from(files) : files;
  const pdfFiles = fileArray.filter((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));

  for (const file of pdfFiles) {
    yield await indexPdfFile(file);
  }
}
