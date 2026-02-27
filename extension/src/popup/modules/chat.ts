/**
 * Chat — message rendering, streaming, send logic, and TTS speak buttons.
 */

import type { Message } from '@/lib/types';
import { marked } from 'marked';
import { speak, stop as ttsStop, isSpeaking } from '@/lib/voice/tts';
import { state, currentSettings } from './state';
import {
  $, escapeHtml,
  chatMessages, chatInput, btnSend,
} from './dom';
import { saveChatHistory } from './sessions';

// ─── Markdown ────────────────────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return addCodeBlockHeaders(html);
}

function addCodeBlockHeaders(html: string): string {
  return html.replace(
    /<pre><code(?:\s+class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang: string | undefined, code: string) => {
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
      return `<div class="code-block-wrapper">`
        + `<div class="code-block-header">${label}<button class="code-copy-btn" type="button">Copy</button></div>`
        + `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${code}</code></pre>`
        + `</div>`;
    },
  );
}

// ─── TTS Speak Button ────────────────────────────────────────────────────────

const SPEAK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 010 7.07"/><path d="M19.07 4.93a10 10 0 010 14.14"/></svg>`;
const STOP_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>`;

export function createSpeakButton(content: string): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'message-actions hidden';

  const btn = document.createElement('button');
  btn.className = 'msg-action-btn msg-speak-btn';
  btn.innerHTML = `${SPEAK_SVG} <span>Speak</span>`;
  btn.title = 'Read aloud';

  btn.addEventListener('click', () => {
    if (isSpeaking()) {
      ttsStop();
      btn.innerHTML = `${SPEAK_SVG} <span>Speak</span>`;
      btn.classList.remove('speaking');
    } else {
      speak(content, {
        speed: currentSettings.ttsSpeed,
        voiceName: currentSettings.ttsVoiceName,
        onEnd: () => {
          btn.innerHTML = `${SPEAK_SVG} <span>Speak</span>`;
          btn.classList.remove('speaking');
        },
      });
      btn.innerHTML = `${STOP_SVG} <span>Stop</span>`;
      btn.classList.add('speaking');
    }
  });

  bar.appendChild(btn);
  return bar;
}

// ─── Message Bubbles ─────────────────────────────────────────────────────────

const AI_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
  <path d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"/>
</svg>`;

export function appendMessage(role: 'user' | 'assistant' | 'system-notice', content: string): HTMLElement {
  if (role === 'system-notice') {
    const div = document.createElement('div');
    div.className = 'message system-notice';
    div.textContent = content;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `message-wrapper ${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = AI_AVATAR_SVG;
    wrapper.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = content;
  wrapper.appendChild(bubble);

  if (role === 'assistant') {
    const speakBar = createSpeakButton(content);
    wrapper.appendChild(speakBar);
  }

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

export function removeWelcomeMessage(): void {
  document.getElementById('welcome-msg')?.remove();
}

// ─── Send Chat ───────────────────────────────────────────────────────────────

export async function sendChat(): Promise<void> {
  const text = chatInput.value.trim();
  if (!text || state.isStreaming) return;

  if (!state.modelReady) {
    appendMessage('system-notice', 'AI model is still loading. Please wait for setup to complete.');
    return;
  }

  removeWelcomeMessage();
  chatInput.value = '';
  chatInput.style.height = '';

  state.conversationHistory.push({ role: 'user', content: text });
  appendMessage('user', text);

  const assistantBubble = appendMessage('assistant', '');
  assistantBubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

  state.isStreaming = true;
  btnSend.disabled = true;

  const requestId = crypto.randomUUID();
  let assistantContent = '';
  let dirty = false;
  let lastRenderTime = 0;
  let rafId = 0;
  const RENDER_THROTTLE_MS = 150;

  const renderLoop = () => {
    const now = performance.now();
    if (dirty && now - lastRenderTime >= RENDER_THROTTLE_MS) {
      assistantBubble.innerHTML = renderMarkdown(assistantContent)
        + '<span class="streaming-cursor">\u258A</span>';
      lastRenderTime = now;
      dirty = false;
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
    rafId = requestAnimationFrame(renderLoop);
  };

  const cleanup = () => {
    clearTimeout(streamingTimeout);
    cancelAnimationFrame(rafId);
    chrome.runtime.onMessage.removeListener(onChunk);
  };

  const onChunk = (message: Message) => {
    if (message.type === 'CHAT_CHUNK') {
      const { token, requestId: rid } = message.payload as { token: string; requestId: string };
      if (rid !== requestId) return;

      if (assistantContent === '' && assistantBubble.querySelector('.typing-indicator')) {
        assistantBubble.innerHTML = '';
        rafId = requestAnimationFrame(renderLoop);
      }
      assistantContent += token;
      dirty = true;
    }

    if (message.type === 'CHAT_DONE') {
      const { requestId: rid } = message.payload as { requestId: string };
      if (rid !== requestId) return;

      state.conversationHistory.push({ role: 'assistant', content: assistantContent });
      assistantBubble.innerHTML = renderMarkdown(assistantContent);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      state.isStreaming = false;
      btnSend.disabled = false;
      saveChatHistory();
      cleanup();

      const wrapper = assistantBubble.closest('.message-wrapper');
      const speakBar = wrapper?.querySelector('.message-actions');
      if (speakBar) {
        speakBar.classList.remove('hidden');
        speakBar.innerHTML = '';
        const freshBar = createSpeakButton(assistantContent);
        speakBar.appendChild(freshBar.firstChild!);
      }
      if (currentSettings.ttsEnabled && assistantContent) {
        speak(assistantContent, {
          speed: currentSettings.ttsSpeed,
          voiceName: currentSettings.ttsVoiceName,
        });
      }
    }

    if (message.type === 'CHAT_ERROR') {
      const { requestId: rid, error } = message.payload as { requestId: string; error: string };
      if (rid !== requestId) return;

      let userMsg = error;
      if (error.includes('LLM not loaded')) {
        userMsg = 'The AI model is still loading. Please wait for setup to complete and try again.';
      } else if (error.includes('Storage not initialized')) {
        userMsg = 'Storage is still initializing. Please try again in a moment.';
      }
      assistantBubble.textContent = userMsg;
      assistantBubble.style.color = 'var(--red)';
      assistantBubble.style.fontSize = '12px';
      state.isStreaming = false;
      btnSend.disabled = false;
      cleanup();
    }
  };

  const STREAM_TIMEOUT_MS = 120_000;
  const streamingTimeout = setTimeout(() => {
    chrome.runtime.onMessage.removeListener(onChunk);
    cancelAnimationFrame(rafId);
    if (state.isStreaming) {
      assistantBubble.innerHTML = renderMarkdown(assistantContent) + '\n[Response timed out]';
      state.isStreaming = false;
      btnSend.disabled = false;
    }
  }, STREAM_TIMEOUT_MS);

  chrome.runtime.onMessage.addListener(onChunk);

  await chrome.runtime.sendMessage({
    type: 'CHAT',
    requestId,
    payload: {
      messages: state.conversationHistory.slice(-10),
      useRag: true,
    },
  });
}

// ─── Event Listeners ─────────────────────────────────────────────────────────

export function initChatListeners(): void {
  btnSend.addEventListener('click', sendChat);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  // Copy button delegation
  chatMessages.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.code-copy-btn') as HTMLButtonElement | null;
    if (!btn) return;

    const wrapper = btn.closest('.code-block-wrapper');
    const code = wrapper?.querySelector('code');
    if (!code) return;

    navigator.clipboard.writeText(code.textContent ?? '').then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  });

  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = '';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 80) + 'px';
  });
}
