import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickVoice, speak, stop } from '../tts';

type Voice = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService' | 'default'>;
const voice = (name: string, lang: string, localService: boolean, isDefault = false): Voice =>
  ({ name, lang, localService, default: isDefault });

const samantha = voice('Samantha', 'en-US', true, true);
const amelie = voice('Amélie', 'fr-CA', true);
const googleUS = voice('Google US English', 'en-US', false);
const googleDefault = voice('Google UK English Female', 'en-GB', false, true);

let voices: Voice[] = [];
let spoken: Array<{ text: string; voice: Voice | null }> = [];
const listeners: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  voices = [samantha, amelie, googleUS];
  spoken = [];
  listeners.length = 0;
  vi.stubGlobal('navigator', { language: 'en-US' });
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    rate = 1;
    voice: Voice | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public text: string) {}
  });
  vi.stubGlobal('speechSynthesis', {
    speaking: false,
    pending: false,
    getVoices: () => voices,
    speak: (u: { text: string; voice: Voice | null }) => spoken.push({ text: u.text, voice: u.voice }),
    cancel: vi.fn(),
    addEventListener: (_type: string, fn: () => void) => listeners.push(fn),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const asVoices = (v: Voice[]) => v as SpeechSynthesisVoice[];

describe('pickVoice', () => {
  it('uses the chosen voice when it runs on this computer', () => {
    expect(pickVoice(asVoices(voices), 'Amélie', 'en-US')?.name).toBe('Amélie');
  });

  it('never picks a remote voice, even when it was chosen', () => {
    expect(pickVoice(asVoices(voices), 'Google US English', 'en-US')?.name).toBe('Samantha');
  });

  it("skips a remote default and takes an on-device voice for the user's language", () => {
    expect(pickVoice(asVoices([googleDefault, amelie, voice('Daniel', 'en-GB', true)]), null, 'en-US')?.name).toBe('Daniel');
  });

  it('returns nothing when every voice is remote', () => {
    expect(pickVoice(asVoices([googleUS, googleDefault]), null, 'en-US')).toBeUndefined();
  });
});

describe('speak', () => {
  it('reads with an on-device voice when a remote one is saved in settings', async () => {
    speak('Hello **there**', { voiceName: 'Google US English' });
    await vi.runAllTimersAsync();
    expect(spoken).toEqual([{ text: 'Hello there', voice: samantha }]);
  });

  it('says nothing and calls onEnd when there is no on-device voice', async () => {
    voices = [googleUS, googleDefault];
    const onEnd = vi.fn();
    speak('Hello', { onEnd });
    await vi.runAllTimersAsync();
    expect(spoken).toEqual([]);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("waits for Chrome to load the voice list", async () => {
    voices = [];
    speak('Hello');
    await Promise.resolve();
    expect(spoken).toEqual([]);
    voices = [googleUS, samantha];
    listeners.forEach((fn) => fn());
    await vi.runAllTimersAsync();
    expect(spoken).toEqual([{ text: 'Hello', voice: samantha }]);
  });

  it('does not start once stopped while the voice list loads', async () => {
    voices = [];
    speak('Hello');
    stop();
    voices = [samantha];
    listeners.forEach((fn) => fn());
    await vi.runAllTimersAsync();
    expect(spoken).toEqual([]);
  });
});
