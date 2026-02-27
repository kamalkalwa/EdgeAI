/**
 * Voice Input — recording UI and transcript handling.
 */

import type { Message } from '@/lib/types';
import { $, btnVoice, chatInput } from './dom';
import { appendMessage, sendChat } from './chat';

let voiceActive = false;
let voiceModelsLoading = false;
let voiceRecordStart = 0;

const voiceIndicator = $('voice-indicator');

function resetVoiceUI(): void {
  btnVoice.classList.remove('voice-loading', 'recording', 'active');
  btnVoice.title = 'Voice input (click to record)';
  voiceIndicator.classList.remove('active');
  voiceActive = false;
  voiceModelsLoading = false;
}

export function initVoiceListeners(): void {
  btnVoice.addEventListener('click', async () => {
    if (voiceModelsLoading) return;

    if (!voiceActive) {
      btnVoice.classList.add('voice-loading');
      voiceModelsLoading = true;

      let response: { ready?: boolean; error?: string } | undefined;
      try {
        response = await chrome.runtime.sendMessage({ type: 'VOICE_START' });
      } catch {
        resetVoiceUI();
        appendMessage('system-notice', 'Could not start voice input. Please try again.');
        return;
      }

      if (response?.error) {
        resetVoiceUI();
        console.warn('[EdgeAI popup] Voice start error response:', response.error);
        const isMicError = response.error.includes('denied') ||
          response.error.includes('dismissed') ||
          response.error.includes('NotAllowed') ||
          response.error.includes('Microphone') ||
          response.error.includes('not allowed');
        console.log('[EdgeAI popup] isMicError:', isMicError, '| error text:', response.error);
        if (isMicError) {
          chrome.tabs.create({ url: chrome.runtime.getURL('src/mic-grant/mic-grant.html') });
          appendMessage('system-notice', 'Please grant microphone access in the tab that just opened, then try voice input again.');
        } else {
          appendMessage('system-notice', response.error);
        }
        return;
      }

      btnVoice.classList.remove('voice-loading');
      voiceModelsLoading = false;

      btnVoice.classList.add('recording', 'active');
      btnVoice.title = 'Stop recording';
      voiceIndicator.classList.add('active');
      voiceActive = true;
      voiceRecordStart = Date.now();
    } else {
      if (Date.now() - voiceRecordStart < 500) {
        appendMessage('system-notice', 'Recording too short — hold for at least 1 second.');
      }
      await chrome.runtime.sendMessage({ type: 'VOICE_STOP' });
      btnVoice.classList.remove('recording');
      btnVoice.title = 'Processing…';
    }
  });

  chrome.runtime.onMessage.addListener((message: Message) => {
    if (message.type === 'VOICE_PARTIAL') {
      const { text } = message.payload as { text: string };
      chatInput.value = text;
      chatInput.dispatchEvent(new Event('input'));
    }

    if (message.type === 'VOICE_TRANSCRIPT') {
      const { text } = message.payload as { text: string };
      chatInput.value = text;
      chatInput.dispatchEvent(new Event('input'));
      resetVoiceUI();
      sendChat();
    }

    if (message.type === 'VOICE_ERROR') {
      const { error } = message.payload as { error: string };
      resetVoiceUI();
      appendMessage('system-notice', error);
    }
  });
}
