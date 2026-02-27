/**
 * TTS — Text-to-Speech via Web Speech Synthesis API (zero deps)
 *
 * Strips markdown before reading aloud. Respects user settings for
 * speed and voice selection.
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

/**
 * Speak the given text using Web Speech Synthesis.
 * Automatically strips markdown before speaking.
 * Only one utterance at a time — calling speak() while already speaking
 * will stop the current one first.
 */
export function speak(text: string, options: TTSOptions = {}): void {
  stop(); // cancel any existing speech

  const cleanText = stripMarkdown(text);
  if (!cleanText) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = options.speed ?? 1.0;

  // Find the requested voice
  if (options.voiceName) {
    const voices = speechSynthesis.getVoices();
    const match = voices.find((v) => v.name === options.voiceName);
    if (match) utterance.voice = match;
  }

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
}

/** Stop any currently playing speech. */
export function stop(): void {
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
  }
  currentUtterance = null;
}

/** Whether speech is currently in progress. */
export function isSpeaking(): boolean {
  return speechSynthesis.speaking;
}
