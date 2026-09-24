/**
 * Trust Panel — data inventory and transparency stats.
 * Milestone 6 features: build info, enhanced inventory, network monitor, audit log.
 */

import type { DocumentMetadata, Message } from '@/lib/types';
import { formatBytes } from '@/lib/utils';
import type { NetworkEntry } from '@/lib/trust/network-monitor';
import { formatEntryUrl } from '@/lib/trust/network-monitor';
import { getAuditLog, clearAuditLog, exportAuditLog, type AuditEntry } from '@/lib/trust/audit-log';
import { $ } from './dom';
import { state, type ChatSession } from './state';

export function populateBuildInfo(): void {
  const el = $('trust-build-info');
  if (!el) return;
  const commit = typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev';
  const version = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '0.0.0';
  el.textContent = `v${version} (${commit})`;

  $('privacy-policy-link').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('src/privacy/privacy.html') });
  });
}

export async function loadTrustStats(): Promise<void> {
  populateBuildInfo();

  // Document stats
  const response = await chrome.runtime.sendMessage({ type: 'LIST_DOCUMENTS' }).catch(() => null);
  const docs = (response?.payload ?? []) as DocumentMetadata[];

  const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);
  const totalChars = docs.reduce((sum, d) => sum + d.charCount, 0);

  $('trust-docs').textContent = String(docs.length);
  $('trust-chunks').textContent = totalChunks.toLocaleString();
  $('trust-storage').textContent = formatBytes(totalChars * 2);

  // Storage quota
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    if (est.usage) {
      $('trust-storage').textContent = formatBytes(est.usage);
    }
    if (est.quota && est.usage !== undefined) {
      const remaining = est.quota - est.usage;
      $('trust-quota').textContent = formatBytes(remaining);
    }
  }

  // Chat sessions count
  const sessResult = await chrome.storage.local.get('chatSessionIndex').catch(() => null);
  const sessions = (sessResult?.chatSessionIndex as ChatSession[] | undefined) ?? [];
  $('trust-sessions').textContent = String(sessions.length);

  // Model cache files count
  try {
    const cacheNames = await caches.keys();
    let totalFiles = 0;
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      totalFiles += keys.length;
    }
    $('trust-model-cache').textContent = `${totalFiles} files across ${cacheNames.length} cache${cacheNames.length === 1 ? '' : 's'}`;
  } catch {
    $('trust-model-cache').textContent = 'N/A';
  }

  // Network monitor
  await loadNetworkLog();

  // Audit log
  await loadAuditLog();
}

// ─── Network Monitor ─────────────────────────────────────────────────────────

let networkLogCache: NetworkEntry[] = [];

async function loadNetworkLog(): Promise<void> {
  const res = await chrome.runtime.sendMessage({ type: 'GET_NETWORK_LOG' }).catch(() => null);
  networkLogCache = (res?.payload ?? []) as NetworkEntry[];
  renderNetworkSummary();
  renderNetworkLog();
}

function renderNetworkSummary(): void {
  const total = networkLogCache.length;
  const other = networkLogCache.filter((e) => e.category !== 'model_download').length;
  $('trust-network-count').textContent = `${total} request${total === 1 ? '' : 's'}`;

  const otherEl = $('trust-network-external');
  otherEl.textContent = other === 0 ? 'None' : `${other} request${other === 1 ? '' : 's'}`;
  otherEl.className = `trust-value ${other === 0 ? 'green' : 'yellow'}`;
}

function describeStatus(code: number): string {
  return code === 0 ? 'no response (failed or blocked)' : `HTTP ${code}`;
}

function renderNetworkLog(): void {
  const listEl = $('network-log-list');
  const hideModels = ($('network-hide-models') as HTMLInputElement).checked;

  const filtered = hideModels
    ? networkLogCache.filter((e) => e.category !== 'model_download')
    : networkLogCache;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="network-log-empty">${
      hideModels && networkLogCache.length > 0
        ? 'Every request so far was a model download.'
        : 'No network requests recorded.'
    }</div>`;
    return;
  }

  // Most recent first (pages report as requests finish, so arrival order
  // isn't start order), capped at 100 for rendering performance
  const display = [...filtered].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
  listEl.innerHTML = '';

  for (const entry of display) {
    const row = document.createElement('div');
    row.className = 'network-log-entry';
    const d = new Date(entry.timestamp);
    row.title = `${entry.url}\n${describeStatus(entry.statusCode)} · ${entry.initiatorType} from ${entry.context} · ${d.toLocaleString()}`;

    const time = document.createElement('span');
    time.className = 'nle-time';
    time.textContent = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    // Host and path shrink first, so the file name stays readable
    const { path, file } = formatEntryUrl(entry.url);
    const url = document.createElement('span');
    url.className = 'nle-url';
    const pathEl = document.createElement('span');
    pathEl.className = 'nle-path';
    pathEl.textContent = path;
    const fileEl = document.createElement('span');
    fileEl.className = 'nle-file';
    fileEl.textContent = file;
    url.append(pathEl, fileEl);

    row.appendChild(time);
    row.appendChild(url);

    // Only the unusual outcomes get a status: failures and HTTP errors
    if (entry.statusCode === 0 || entry.statusCode >= 400) {
      const status = document.createElement('span');
      status.className = 'nle-status';
      status.textContent = entry.statusCode === 0 ? 'failed' : String(entry.statusCode);
      row.appendChild(status);
    }

    const badge = document.createElement('span');
    badge.className = `nle-badge ${entry.category}`;
    badge.textContent = entry.category === 'model_download' ? 'model' : 'other';
    row.appendChild(badge);

    listEl.appendChild(row);
  }
}

export function initNetworkLogListeners(): void {
  $('network-hide-models').addEventListener('change', renderNetworkLog);

  $('btn-clear-network-log').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_NETWORK_LOG' }).catch(() => null);
    networkLogCache = [];
    renderNetworkSummary();
    renderNetworkLog();
  });

  // The steps for checking the log with Chrome's own tools live in the privacy policy.
  $('network-log-verify').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('src/privacy/privacy.html#verify-network') });
  });

  // The service worker announces new entries; refresh while the panel is showing.
  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === 'NETWORK_LOG_UPDATED' && state.activeTab === 'trust') loadNetworkLog();
  });
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

let auditLogCache: AuditEntry[] = [];

async function loadAuditLog(): Promise<void> {
  auditLogCache = await getAuditLog();
  renderAuditLog();
}

function renderAuditLog(): void {
  const listEl = $('audit-log-list');

  if (auditLogCache.length === 0) {
    listEl.innerHTML = '<div class="audit-log-empty">No activity recorded yet.</div>';
    return;
  }

  // Most recent first, cap at 100
  const display = auditLogCache.slice(-100).reverse();
  listEl.innerHTML = '';

  for (const entry of display) {
    const row = document.createElement('div');
    row.className = 'audit-entry';

    const header = document.createElement('div');
    header.className = 'audit-entry-header';

    const time = document.createElement('span');
    time.className = 'ae-time';
    const d = new Date(entry.timestamp);
    time.textContent = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

    const badge = document.createElement('span');
    badge.className = `ae-type ${entry.type}`;
    badge.textContent = entry.type.replace('_', ' ');

    const query = document.createElement('span');
    query.className = 'ae-query';
    query.textContent = entry.query ?? entry.documentTitle ?? '—';

    header.appendChild(time);
    header.appendChild(badge);
    header.appendChild(query);

    // Expandable detail section
    const detail = document.createElement('div');
    detail.className = 'audit-entry-detail';

    if (entry.responsePreview) {
      const resp = document.createElement('div');
      resp.className = 'ae-response';
      resp.textContent = entry.responsePreview;
      detail.appendChild(resp);
    }

    if (entry.retrievedChunks && entry.retrievedChunks.length > 0) {
      const chunksDiv = document.createElement('div');
      chunksDiv.className = 'ae-chunks';
      const label = document.createElement('div');
      label.style.fontWeight = '600';
      label.style.marginBottom = '2px';
      label.textContent = `Context retrieved (${entry.retrievedChunks.length} chunks):`;
      chunksDiv.appendChild(label);

      for (const chunk of entry.retrievedChunks) {
        const item = document.createElement('div');
        item.className = 'ae-chunk-item';
        item.textContent = `${chunk.documentTitle} (${chunk.source}) — score ${chunk.score.toFixed(3)}`;
        chunksDiv.appendChild(item);
      }
      detail.appendChild(chunksDiv);
    }

    header.addEventListener('click', () => {
      detail.classList.toggle('open');
    });

    row.appendChild(header);
    row.appendChild(detail);
    listEl.appendChild(row);
  }
}

export function initAuditLogListeners(): void {
  $('btn-clear-audit-log').addEventListener('click', async () => {
    await clearAuditLog();
    auditLogCache = [];
    renderAuditLog();
  });

  $('btn-export-audit-log').addEventListener('click', async () => {
    const entries = await getAuditLog();
    const json = exportAuditLog(entries);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edgeai-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
