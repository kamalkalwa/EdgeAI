/**
 * Settings Panel — TTS config, data export, clear all.
 */

import type { DocumentMetadata, EdgeAISettings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/types';
import { formatBytes } from '@/lib/utils';
import { currentSettings, setCurrentSettings } from './state';
import { $, showToast } from './dom';

const settingsPanel = $('settings-panel');
const settingTtsToggle = $('setting-tts-toggle') as HTMLInputElement;
const settingTtsSpeed = $('setting-tts-speed') as HTMLInputElement;
const settingTtsSpeedVal = $('setting-tts-speed-val');
const settingTtsVoice = $('setting-tts-voice') as HTMLSelectElement;

export async function loadSettings(): Promise<EdgeAISettings> {
  const result = await chrome.storage.local.get('edgeai_settings').catch(() => null);
  return (result?.edgeai_settings as EdgeAISettings | undefined) ?? { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings: EdgeAISettings): Promise<void> {
  setCurrentSettings(settings);
  await chrome.storage.local.set({ edgeai_settings: settings }).catch(console.error);
}

function populateVoiceDropdown(): void {
  const voices = speechSynthesis.getVoices();
  while (settingTtsVoice.options.length > 1) settingTtsVoice.remove(1);
  for (const voice of voices) {
    const opt = document.createElement('option');
    opt.value = voice.name;
    opt.textContent = `${voice.name} (${voice.lang})`;
    settingTtsVoice.appendChild(opt);
  }
  if (currentSettings.ttsVoiceName) {
    settingTtsVoice.value = currentSettings.ttsVoiceName;
  }
}

function populateSettingsUI(): void {
  settingTtsToggle.checked = currentSettings.ttsEnabled;
  settingTtsSpeed.value = String(currentSettings.ttsSpeed);
  settingTtsSpeedVal.textContent = `${currentSettings.ttsSpeed}x`;
  populateVoiceDropdown();
}

async function populateSettingsStorage(): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: 'LIST_DOCUMENTS' }).catch(() => null);
  const docs = (response?.payload ?? []) as DocumentMetadata[];
  const totalChunks = docs.reduce((sum, d) => sum + d.chunkCount, 0);
  $('settings-doc-count').textContent = String(docs.length);
  $('settings-chunk-count').textContent = totalChunks.toLocaleString();
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    $('settings-storage-size').textContent = est.usage ? formatBytes(est.usage) : '--';
  }
}

export function openSettingsPanel(): void {
  populateSettingsUI();
  populateSettingsStorage();
  settingsPanel.classList.add('open');
}

function closeSettingsPanel(): void {
  settingsPanel.classList.remove('open');
}

/**
 * Two-click confirmation for destructive buttons: the first click arms the
 * button and shows `armedLabel` for a few seconds, the second runs `action`.
 * The button is disabled while the action runs; from then on the action owns
 * the label (it may restore it, or leave a final state and reload the page).
 */
function confirmThenRun(btn: HTMLButtonElement, armedLabel: string, action: () => Promise<void>): void {
  const idleLabel = btn.textContent ?? '';
  let disarmTimer: ReturnType<typeof setTimeout> | undefined;
  btn.addEventListener('click', async () => {
    if (btn.dataset['armed'] !== 'true') {
      btn.dataset['armed'] = 'true';
      btn.textContent = armedLabel;
      disarmTimer = setTimeout(() => {
        delete btn.dataset['armed'];
        btn.textContent = idleLabel;
      }, 4000);
      return;
    }
    clearTimeout(disarmTimer);
    delete btn.dataset['armed'];
    btn.disabled = true;
    try {
      await action();
    } finally {
      btn.disabled = false;
    }
  });
}

export function initSettingsListeners(): void {
  $('settings-panel-close').addEventListener('click', closeSettingsPanel);

  settingTtsToggle.addEventListener('change', () => {
    currentSettings.ttsEnabled = settingTtsToggle.checked;
    saveSettings(currentSettings);
  });

  settingTtsSpeed.addEventListener('input', () => {
    const val = parseFloat(settingTtsSpeed.value);
    settingTtsSpeedVal.textContent = `${val}x`;
    currentSettings.ttsSpeed = val;
    saveSettings(currentSettings);
  });

  settingTtsVoice.addEventListener('change', () => {
    currentSettings.ttsVoiceName = settingTtsVoice.value || null;
    saveSettings(currentSettings);
  });

  speechSynthesis.addEventListener?.('voiceschanged', populateVoiceDropdown);

  $('btn-export-data').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'LIST_DOCUMENTS' }).catch(() => null);
    const docs = (response?.payload ?? []) as DocumentMetadata[];
    const blob = new Blob([JSON.stringify(docs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `edgeai-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported');
  });

  const clearBtn = $('btn-clear-all-data') as HTMLButtonElement;
  confirmThenRun(clearBtn, 'Are you sure? Click again to confirm', async () => {
    clearBtn.textContent = 'Clearing…';

    // 1. Documents, chunks, embeddings and the saved vault handle are IndexedDB
    //    databases owned by the offscreen document; only it can close and delete them.
    const res = await chrome.runtime.sendMessage({ type: 'CLEAR_ALL_DATA' }).catch(() => null);
    if (res?.success !== true) {
      // Either the offscreen reported an error or the service-worker relay failed
      // ({ type: 'CLEAR_ALL_DATA_ERROR', payload: { error } }). Stop here: clearing
      // chrome.storage while the databases still hold data would misreport "cleared".
      clearBtn.textContent = 'Clear All Data';
      showToast(`Could not clear documents: ${res?.error ?? res?.payload?.error ?? 'no response from engine'}`);
      return;
    }
    // 2. The network log is held in service-worker memory as well as storage.
    await chrome.runtime.sendMessage({ type: 'CLEAR_NETWORK_LOG' }).catch(() => null);
    // 3. Chat sessions, audit log, settings, onboarding flag.
    await chrome.storage.local.clear().catch(console.error);

    clearBtn.textContent = 'All data cleared';
    showToast('All data cleared — reloading');
    setTimeout(() => location.reload(), 1200);
  });

  const modelsBtn = $('btn-delete-models') as HTMLButtonElement;
  confirmThenRun(modelsBtn, 'Re-downloads ~2.4 GB next launch — click again', async () => {
    modelsBtn.textContent = 'Deleting…';
    try {
      // web-llm and transformers.js keep model files in the Cache API, same origin as this popup
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      showToast('Model files deleted. They download again next time EdgeAI starts.');
    } catch (err) {
      showToast(`Could not delete model cache: ${err instanceof Error ? err.message : String(err)}`);
    }
    modelsBtn.textContent = 'Delete Downloaded Models';
    populateSettingsStorage();
  });
}
