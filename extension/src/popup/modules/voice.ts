/**
 * Voice Input — recording UI and transcript handling.
 *
 * Chrome's on-device recognizer runs here in the popup when the browser has
 * it; otherwise the offscreen document records and transcribes with Moonshine.
 */

import type { Message } from '@/lib/types';
import { OnDeviceSpeechSession, onDeviceSupport, installLanguage } from '@/lib/voice/on-device-speech';
import { $, btnVoice, chatInput } from './dom';
import { appendMessage, sendChat } from './chat';

let voiceActive = false;
let voiceStarting = false;
let voiceRecordStart = 0;
let onDeviceSession: OnDeviceSpeechSession | null = null;

const voiceIndicator = $('voice-indicator');

function resetVoiceUI(): void {
  btnVoice.classList.remove('voice-loading', 'recording', 'active');
  btnVoice.title = 'Voice input (click to record)';
  voiceIndicator.classList.remove('active');
  voiceActive = false;
  voiceStarting = false;
  onDeviceSession = null;
}

function showStarting(): void {
  btnVoice.classList.add('voice-loading');
  voiceStarting = true;
}

function showRecording(): void {
  btnVoice.classList.remove('voice-loading');
  voiceStarting = false;

  btnVoice.classList.add('recording', 'active');
  btnVoice.title = 'Stop recording';
  voiceIndicator.classList.add('active');
  voiceActive = true;
  voiceRecordStart = Date.now();
}

function showTranscript(text: string): void {
  chatInput.value = text;
  chatInput.dispatchEvent(new Event('input'));
}

function finishWithTranscript(text: string): void {
  showTranscript(text);
  resetVoiceUI();
  sendChat();
}

function isMicError(error: string): boolean {
  return error.includes('denied') ||
    error.includes('dismissed') ||
    error.includes('NotAllowed') ||
    error.includes('Microphone') ||
    error.includes('not allowed');
}

function reportStartError(error: string): void {
  resetVoiceUI();
  if (isMicError(error)) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/mic-grant/mic-grant.html') });
    appendMessage('system-notice', 'Please grant microphone access in the tab that just opened, then try voice input again.');
  } else {
    appendMessage('system-notice', error);
  }
}

// The popup can't show Chrome's permission prompt, so ask in a tab instead.
async function micGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state === 'granted';
  } catch {
    return true; // getUserMedia will say if it isn't
  }
}

async function startOnDevice(lang: string): Promise<void> {
  const session = new OnDeviceSpeechSession(lang);
  try {
    await session.start({
      onPartial: showTranscript,
      onFinal: finishWithTranscript,
      onError: (err) => {
        resetVoiceUI();
        appendMessage('system-notice', err.message);
      },
      // Chrome said it could, then refused: Moonshine takes this one.
      onRefused: () => {
        resetVoiceUI();
        showStarting();
        void startMoonshine();
      },
    });
  } catch (err) {
    console.warn('[EdgeAI popup] On-device voice start failed:', err);
    reportStartError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    return;
  }
  onDeviceSession = session;
  showRecording();
}

async function startMoonshine(): Promise<void> {
  let response: { ready?: boolean; error?: string; payload?: { error?: string } } | null | undefined;
  try {
    response = await chrome.runtime.sendMessage({ type: 'VOICE_START' });
  } catch {
    response = null;
  }

  // Only the offscreen document's { ready: true } means it is recording.
  if (!response?.ready) {
    const error = response?.error ?? response?.payload?.error;
    console.warn('[EdgeAI popup] Voice start failed:', error ?? response);
    reportStartError(error ?? 'Could not start voice input. Please try again.');
    return;
  }
  showRecording();
}

async function startVoice(): Promise<void> {
  showStarting();

  // Before any download: no point fetching a speech model without a mic.
  if (!(await micGranted())) {
    reportStartError('Microphone access denied');
    return;
  }

  const lang = navigator.language || 'en-US';
  let support = await onDeviceSupport(lang);
  if (support === 'needs-download') {
    appendMessage('system-notice', 'Chrome is downloading its on-device speech model. This happens once.');
    support = (await installLanguage(lang)) ? 'ready' : 'unsupported';
  }

  if (support === 'ready') await startOnDevice(lang);
  else await startMoonshine();
}

export function initVoiceListeners(): void {
  btnVoice.addEventListener('click', async () => {
    if (voiceStarting) return;

    if (!voiceActive) {
      await startVoice();
      return;
    }

    if (Date.now() - voiceRecordStart < 500) {
      appendMessage('system-notice', 'Recording too short — hold for at least 1 second.');
    }
    if (onDeviceSession) onDeviceSession.stop();
    else await chrome.runtime.sendMessage({ type: 'VOICE_STOP' });
    btnVoice.classList.remove('recording');
    btnVoice.title = 'Processing…';
  });

  // Moonshine results from the offscreen document
  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === 'VOICE_PARTIAL') {
      const { text } = message.payload as { text: string };
      showTranscript(text);
    }

    if (message.type === 'VOICE_TRANSCRIPT') {
      const { text } = message.payload as { text: string };
      finishWithTranscript(text);
    }

    if (message.type === 'VOICE_ERROR') {
      const { error } = message.payload as { error: string };
      resetVoiceUI();
      appendMessage('system-notice', error);
    }
  });
}
