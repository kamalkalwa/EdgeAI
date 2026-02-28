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

  $('btn-clear-all-data').addEventListener('click', async () => {
    const btn = $('btn-clear-all-data') as HTMLButtonElement;
    if (btn.dataset['confirm'] !== 'true') {
      btn.textContent = 'Are you sure? Click again to confirm';
      btn.dataset['confirm'] = 'true';
      setTimeout(() => {
        btn.textContent = 'Clear All Data';
        delete btn.dataset['confirm'];
      }, 3000);
      return;
    }
    await chrome.storage.local.clear().catch(console.error);
    btn.textContent = 'All data cleared';
    delete btn.dataset['confirm'];
    showToast('All data cleared');
    setTimeout(() => { btn.textContent = 'Clear All Data'; }, 2000);
  });
}
