/**
 * Speech to text with Chrome's own on-device recognizer (Chrome 139+).
 *
 * `processLocally = true` makes Chrome recognize speech on this computer and
 * fail rather than send audio to its cloud service. Each language needs a
 * one-time download that Chrome fetches itself and shares across all sites.
 *
 * The popup falls back to Moonshine (offscreen document) when
 * onDeviceSupport() says 'unsupported' (older Chrome, Chromium builds without
 * the recognizer, a language Chrome can't do on-device) and when a session
 * reports onRefused.
 */

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LanguageOptions {
  langs: string[];
  processLocally: true;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string } | undefined;
}

interface RecognitionResultEvent {
  readonly results: ArrayLike<RecognitionResult>;
}

interface RecognitionErrorEvent {
  readonly error: string;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(track?: MediaStreamTrack): void;
  stop(): void;
}

interface RecognitionClass {
  new (): Recognition;
  available?(options: LanguageOptions): Promise<Availability>;
  install?(options: LanguageOptions): Promise<boolean>;
}

function recognitionClass(): RecognitionClass | null {
  const g = globalThis as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

export type OnDeviceSupport = 'ready' | 'needs-download' | 'unsupported';

export async function onDeviceSupport(lang: string): Promise<OnDeviceSupport> {
  const SR = recognitionClass();
  if (!SR?.available) return 'unsupported';
  try {
    const status = await SR.available({ langs: [lang], processLocally: true });
    if (status === 'available') return 'ready';
    if (status === 'downloadable' || status === 'downloading') return 'needs-download';
  } catch {
    // Not a valid language tag, or blocked by policy.
  }
  return 'unsupported';
}

/** Asks Chrome to download the language pack. Resolves false if it couldn't. */
export async function installLanguage(lang: string): Promise<boolean> {
  const SR = recognitionClass();
  if (!SR?.install) return false;
  try {
    return await SR.install({ langs: [lang], processLocally: true });
  } catch {
    return false;
  }
}

export function joinResults(results: ArrayLike<RecognitionResult>): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const text = results[i]?.[0]?.transcript.trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

// Chrome refusing to recognize on-device although available() said it could:
// a policy, a Chromium build that turns it off, or a missing language pack.
// Neither is about the microphone.
const REFUSALS = new Set(['service-not-allowed', 'language-not-supported']);

function describeError(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'Microphone access denied. Allow microphone in Chrome site settings for this extension.';
    case 'audio-capture':
      return 'No microphone found. Check that one is connected and not in use by another app.';
    default:
      return `Voice input stopped (${code}). Please try again.`;
  }
}

export interface SpeechCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: Error) => void;
  /** Chrome refused on-device recognition before hearing anything: use another engine. */
  onRefused: () => void;
}

// Stop 2 s after the last word, as the Moonshine session does. Give up if no
// words arrive in the first 5 s; Moonshine allows 3.5 s, but its voice
// detector fires as soon as speech starts, and Chrome's first words come
// about 0.8 s later.
const SILENCE_AFTER_SPEECH_MS = 2000;
const NO_SPEECH_TIMEOUT_MS = 5000;

export class OnDeviceSpeechSession {
  private recognition: Recognition | null = null;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;
  private failed = false;
  private text = '';

  constructor(private readonly lang: string) {}

  async start(callbacks: SpeechCallbacks): Promise<void> {
    const SR = recognitionClass();
    if (!SR) throw new Error('Speech recognition is not available in this browser');

    // Our own track, so echo cancellation and noise suppression apply.
    // Chrome versions that can't take a track ignore it and open the default mic.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });

    const recognition = new SR();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.processLocally = true;

    recognition.onresult = (e) => {
      const text = joinResults(e.results);
      if (!text) return;
      this.text = text;
      callbacks.onPartial(text);
      this.stopAfter(SILENCE_AFTER_SPEECH_MS);
    };
    recognition.onerror = (e) => {
      // Both end the session; onend reports them.
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      this.failed = true;
      if (REFUSALS.has(e.error) && !this.text) callbacks.onRefused();
      else callbacks.onError(new Error(describeError(e.error)));
    };
    recognition.onend = () => {
      this.release();
      if (this.failed) return;
      if (this.text) callbacks.onFinal(this.text);
      else callbacks.onError(new Error('No speech detected'));
    };

    this.recognition = recognition;
    try {
      recognition.start(this.stream.getAudioTracks()[0]);
    } catch (err) {
      this.release();
      throw err;
    }
    this.stopAfter(NO_SPEECH_TIMEOUT_MS);
  }

  /** Ends listening; the final transcript arrives through onFinal. */
  stop(): void {
    if (this.stopping) return;
    this.stopping = true;
    this.clearTimer();
    this.recognition?.stop();
  }

  private stopAfter(ms: number): void {
    if (this.stopping) return;
    this.clearTimer();
    this.timer = setTimeout(() => this.stop(), ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private release(): void {
    this.clearTimer();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recognition = null;
  }
}
