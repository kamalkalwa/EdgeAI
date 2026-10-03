/**
 * TTS — Text-to-Speech via Web Speech Synthesis API (zero deps)
 *
 * Strips markdown before reading aloud. Respects user settings for
 * speed and voice selection.
 *
 * Reads only with voices that run on this computer. A voice with
 * `localService: false` (Chrome's "Google …" voices) is a remote speech
 * service: the text would leave the device.
 */

export interface TTSOptions {
  speed?: number;         // 0.8–1.5, default 1.0
  voiceName?: string | null;  // null = system default
  onEnd?: () => void;
}

/**
 * Strip markdown formatting to produce clean text for speech synthesis.
 * Handles code blocks, inline code, headers, links, bold, italic, images, HR, lists.
 */
export function stripMarkdown(text: string): string {
  return text
    // Remove fenced code blocks (```lang\n...\n```)
    .replace(/```[\s\S]*?```/g, ' code block omitted ')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Convert links [text](url) to just text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headers (# ... ######)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2')
    // Remove strikethrough
    .replace(/~~(.*?)~~/g, '$1')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove blockquote markers
    .replace(/^>\s?/gm, '')
    // Remove list markers (- * + or 1.)
    .replace(/^[\s]*[-*+]\s/gm, '')
    .replace(/^[\s]*\d+\.\s/gm, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse multiple newlines/spaces
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let speakRequests = 0;

/** Voices that run on this computer, in the order the browser lists them. */
export function onDeviceVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis.getVoices().filter((v) => v.localService);
}

/**
 * The voice to read with: the chosen one, then the default, then one for the
 * user's language, then any — always one that runs on this computer.
 * Undefined when there is none.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  voiceName: string | null | undefined,
  lang: string,
): SpeechSynthesisVoice | undefined {
  const local = voices.filter((v) => v.localService);
  const language = lang.slice(0, 2).toLowerCase();
  return local.find((v) => v.name === voiceName)
    ?? local.find((v) => v.default)
    ?? local.find((v) => v.lang.toLowerCase().startsWith(language))
    ?? local[0];
}

/** Chrome fills the voice list after the first getVoices() call. */
function loadedVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1000);
  });
}

/**
 * Speak the given text using Web Speech Synthesis.
 * Automatically strips markdown before speaking.
 * Only one utterance at a time — calling speak() while already speaking
 * will stop the current one first. With no on-device voice it says nothing
 * and calls onEnd.
 */
export function speak(text: string, options: TTSOptions = {}): void {
  stop(); // cancel any existing speech

  const cleanText = stripMarkdown(text);
  if (!cleanText) return;

  const request = speakRequests;
  void loadedVoices().then((voices) => {
    if (request !== speakRequests) return; // stopped, or another speak() started
    const voice = pickVoice(voices, options.voiceName, navigator.language);
    if (!voice) {
      options.onEnd?.();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = options.speed ?? 1.0;
    utterance.voice = voice;

    utterance.onend = () => {
      currentUtterance = null;
      options.onEnd?.();
    };

    utterance.onerror = () => {
      currentUtterance = null;
      options.onEnd?.();
    };

    currentUtterance = utterance;
    speechSynthesis.speak(utterance);
  });
}

/** Stop any currently playing speech. */
export function stop(): void {
  speakRequests++;
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }
  currentUtterance = null;
}

/** Whether speech is currently in progress. */
export function isSpeaking(): boolean {
  return speechSynthesis.speaking;
}
