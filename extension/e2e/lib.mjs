/**
 * End-to-end harness: real Google Chrome with the built extension (dist/) and a
 * fake microphone that plays a WAV file, so voice input can be tested by
 * clicking the popup's own mic button.
 *
 * - Every extension page gets a stub before its scripts run. It blocks
 *   LOAD_MODEL, because each launch reinstalls the extension and the
 *   first-run tab would otherwise start loading the language model mid-test.
 *   It records the messages the page sends, and can override
 *   SpeechRecognition.available/install, make the recognizer refuse at start,
 *   or replace the reply to VOICE_START, to reach the fallback paths.
 * - The profile in .cache/profile is kept between runs: Chrome stores its
 *   speech language pack and EdgeAI's cached Moonshine model there.
 */

import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = path.resolve(HERE, '..');
const DIST = path.join(EXTENSION_DIR, 'dist');
const CACHE = path.join(HERE, '.cache');
const CLIP_CACHE = path.join(CACHE, 'clips');
const RECORDINGS = path.join(HERE, 'voice/recordings');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const PHRASES = JSON.parse(fs.readFileSync(path.join(HERE, 'voice/phrases.json'), 'utf8'));

// ─── Clips ───────────────────────────────────────────────────────────────────

const RATE = 16_000;
const LEAD_SEC = 1;
// The fake mic loops the file; a long silent tail keeps either engine from hearing it twice.
const TAIL_SEC = 15;
const NOISE_SNR_DB = 10;

function readWav(file) {
  const b = fs.readFileSync(file);
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= b.length;) {
    const id = b.toString('ascii', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = b.subarray(o + 8, o + 8 + size);
    if (id === 'data') data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${file}: not a WAV file`);
  if (fmt.readUInt16LE(0) !== 1 || fmt.readUInt16LE(2) !== 1 || fmt.readUInt32LE(4) !== RATE || fmt.readUInt16LE(14) !== 16) {
    throw new Error(`${file}: expected 16 kHz mono 16-bit PCM`);
  }
  return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
}

function writeWav(file, samples) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + samples.length * 2, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(samples.length * 2, 40);
  fs.writeFileSync(file, Buffer.concat([h, Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2)]));
}

/** Seconds from the start of `samples` to the end of the last audible 20 ms frame. */
function speechEndSec(samples) {
  const frame = RATE / 50;
  for (let end = samples.length - (samples.length % frame); end >= frame; end -= frame) {
    let sum = 0;
    for (let i = end - frame; i < end; i++) sum += samples[i] * samples[i];
    if (Math.sqrt(sum / frame) > 500) return end / RATE;
  }
  return 0;
}

function padded(speech) {
  const out = new Int16Array((LEAD_SEC + TAIL_SEC) * RATE + speech.length);
  out.set(speech, LEAD_SEC * RATE);
  return out;
}

// White noise at a fixed SNR, seeded so every run hears the same clip.
function withNoise(samples, speech) {
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const power = speech.reduce((s, v) => s + v * v, 0) / speech.length;
  const sigma = Math.sqrt(power / 10 ** (NOISE_SNR_DB / 10));
  return samples.map((v) => Math.max(-32768, Math.min(32767, Math.round(v + sigma * gauss()))));
}

function makeClip({ name, text, raw, source }) {
  const speech = readWav(raw);
  const base = path.join(CLIP_CACHE, path.basename(raw, '.raw.wav'));
  return {
    name,
    text,
    source,
    speechEndSec: LEAD_SEC + speechEndSec(speech),
    file(variant = 'clean') {
      const file = `${base}.${variant}.wav`;
      if (!fs.existsSync(file)) {
        const pcm = padded(speech);
        writeWav(file, variant === 'noisy' ? withNoise(pcm, speech) : pcm);
      }
      return file;
    },
    /** The clip said `times` times, 5 s apart: for several questions in one popup. */
    repeated(times) {
      const file = `${base}.x${times}.wav`;
      if (!fs.existsSync(file)) {
        const gap = new Int16Array(5 * RATE);
        const parts = [new Int16Array(LEAD_SEC * RATE)];
        for (let i = 0; i < times; i++) parts.push(speech, gap);
        const out = new Int16Array(parts.reduce((n, a) => n + a.length, 0));
        parts.reduce((at, a) => (out.set(a, at), at + a.length), 0);
        writeWav(file, out);
      }
      return file;
    },
  };
}

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

/** The phrases in voice/phrases.json, spoken by macOS voices (cached). Voices that aren't installed are skipped. */
export function syntheticClips() {
  fs.mkdirSync(CLIP_CACHE, { recursive: true });
  return PHRASES.flatMap((p) => {
    const raw = path.join(CLIP_CACHE, `${p.name}-${hash(p.voice + p.text)}.raw.wav`);
    if (!fs.existsSync(raw)) {
      try {
        execFileSync('say', ['-v', p.voice, '-o', raw, '--data-format=LEI16@16000', p.text], { stdio: 'ignore' });
      } catch {
        console.warn(`Skipping ${p.name}: macOS voice "${p.voice}" isn't available`);
        return [];
      }
    }
    const text = p.text.replace(/\s*\[\[slnc \d+\]\]\s*/g, ' ');
    return [makeClip({ name: p.name, text, raw, source: 'synthetic' })];
  });
}

/** Real recordings: any audio file in voice/recordings/ with a .txt of what was said beside it. */
export function recordedClips() {
  if (!fs.existsSync(RECORDINGS)) return [];
  fs.mkdirSync(CLIP_CACHE, { recursive: true });
  return fs.readdirSync(RECORDINGS)
    .filter((f) => /\.(wav|m4a|aiff?|caf|mp3)$/i.test(f))
    .flatMap((f) => {
      const name = f.replace(/\.[^.]+$/, '');
      const txt = path.join(RECORDINGS, `${name}.txt`);
      if (!fs.existsSync(txt)) return [];
      const src = path.join(RECORDINGS, f);
      const raw = path.join(CLIP_CACHE, `rec-${name}-${hash(String(fs.statSync(src).mtimeMs))}.raw.wav`);
      if (!fs.existsSync(raw)) execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', src, raw]);
      return [makeClip({ name: `rec-${name}`, text: fs.readFileSync(txt, 'utf8').trim(), raw, source: 'recording' })];
    });
}

export function silentClip() {
  fs.mkdirSync(CLIP_CACHE, { recursive: true });
  const raw = path.join(CLIP_CACHE, 'silence.raw.wav');
  if (!fs.existsSync(raw)) writeWav(raw, new Int16Array(RATE));
  return makeClip({ name: 'silence', text: '', raw, source: 'synthetic' });
}

// ─── Word error rate ─────────────────────────────────────────────────────────

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function words(s) {
  return s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean)
    .map((w) => (/^\d+$/.test(w) && Number(w) <= 10 ? NUMBER_WORDS[Number(w)] : w));
}

export function wordErrors(reference, heard) {
  const r = words(reference);
  const h = words(heard);
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const row = [i];
    for (let j = 1; j <= h.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return { errors: prev[h.length], words: r.length };
}

// ─── Browser ─────────────────────────────────────────────────────────────────

let puppeteer;
function getPuppeteer() {
  if (puppeteer) return puppeteer;
  const require = createRequire(path.resolve(EXTENSION_DIR, '../store-assets/package.json'));
  try {
    puppeteer = require('puppeteer');
  } catch {
    throw new Error('Puppeteer is missing: run `npm install` in store-assets/.');
  }
  return puppeteer;
}

// Runs in every extension page before its own scripts.
function installStubs(stub) {
  if (!globalThis.chrome?.runtime?.sendMessage || globalThis.__e2e) return;
  const sent = [];
  const replies = [];
  const installCalls = [];
  globalThis.__e2e = { sent, replies, installCalls };
  const send = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = (message, ...rest) => {
    sent.push(message?.type);
    if (message?.type === 'LOAD_MODEL') return Promise.resolve(null);
    if (message?.type === 'VOICE_START' && 'voiceStartReply' in stub) return Promise.resolve(stub.voiceStartReply);
    const reply = send(message, ...rest);
    const t0 = performance.now();
    reply?.then?.(
      (value) => replies.push({ type: message?.type, ms: Math.round(performance.now() - t0), value: value === undefined ? 'undefined' : value }),
      (error) => replies.push({ type: message?.type, ms: Math.round(performance.now() - t0), error: String(error) }),
    );
    return reply;
  };
  const SR = globalThis.SpeechRecognition;
  if (SR && stub.available) SR.available = () => Promise.resolve(stub.available);
  if (SR && 'install' in stub) {
    SR.install = (options) => {
      installCalls.push(options);
      return Promise.resolve(stub.install);
    };
  }
  if (SR && stub.refuseWith) {
    // What Chrome does when it won't recognize on-device after all: an error, then end.
    SR.prototype.start = function () {
      setTimeout(() => {
        this.onerror?.({ error: stub.refuseWith });
        this.onend?.();
      }, 100);
    };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs in the extension's service worker. False if Chrome hasn't given the
// worker chrome.* yet: a new worker is reachable about 50 ms before that.
function dropLoadModel() {
  if (!globalThis.chrome?.runtime) return false;
  const send = chrome.runtime.sendMessage.bind(chrome.runtime);
  chrome.runtime.sendMessage = (m, ...rest) => (m?.type === 'LOAD_MODEL' ? Promise.resolve(null) : send(m, ...rest));
  return true;
}

// While Chrome runs it keeps a SingletonLock symlink ("host-pid") in the
// profile. Returns that pid only if it is still a Chrome using this profile.
function profileHolder(userDataDir) {
  try {
    const pid = Number(fs.readlinkSync(path.join(userDataDir, 'SingletonLock')).split('-').pop());
    const command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
    return command.includes(userDataDir) ? pid : null;
  } catch {
    return null;
  }
}

/** Waits for the test Chrome that used this profile to exit; stops it if it hangs. */
async function releaseProfile(userDataDir) {
  for (let i = 0; i < 50 && profileHolder(userDataDir); i++) await sleep(100);
  const pid = profileHolder(userDataDir);
  if (!pid) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone.
  }
  for (let i = 0; i < 50 && profileHolder(userDataDir); i++) await sleep(100);
}

async function injectIntoEveryPage(browser, source) {
  const cdp = await browser.target().createCDPSession();
  const connection = cdp.connection();
  cdp.on('Target.attachedToTarget', async ({ sessionId, targetInfo, waitingForDebugger }) => {
    const session = connection.session(sessionId);
    if (!session) return;
    if (targetInfo.type === 'page') {
      // The script only takes effect while this session has the Page domain on.
      await session.send('Page.enable').catch(() => {});
      await session.send('Page.addScriptToEvaluateOnNewDocument', { source }).catch(() => {});
    }
    if (waitingForDebugger) await session.send('Runtime.runIfWaitingForDebugger').catch(() => {});
  });
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  return cdp;
}

/**
 * Launches Chrome with the extension and opens the popup in a tab.
 * `audioFile` is what the fake mic plays; `grantMic: false` leaves the
 * permission unanswered, as on a real first run.
 */
export async function openPopup(options = {}) {
  if (!fs.existsSync(path.join(DIST, 'manifest.json'))) throw new Error('No build in dist/: run `npm run build:prod` first.');
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}. Set CHROME_PATH.`);
  fs.mkdirSync(CACHE, { recursive: true });

  // Now and then the first-run tab starts before the stub is in place; it
  // would load the language model, so start over then too.
  for (let attempt = 1; ; attempt++) {
    let opened;
    try {
      opened = await launchOnce(options);
    } catch (err) {
      // Now and then Chrome hangs while starting; launchOnce has stopped it.
      if (attempt === 3) throw err;
      continue;
    }
    const stubbed = await Promise.all(opened.browser.targets()
      .filter((t) => t.type() === 'page' && t.url().startsWith(`chrome-extension://${opened.extensionId}/`))
      .map(async (t) => (await t.page())?.evaluate(() => !!globalThis.__e2e).catch(() => true)));
    if (!stubbed.includes(false) || attempt === 3) return opened;
    await opened.close();
  }
}

async function launchOnce({ audioFile, grantMic = true, freshProfile = false, stub = {} }) {
  const userDataDir = freshProfile ? fs.mkdtempSync(path.join(CACHE, 'profile-')) : path.join(CACHE, 'profile');

  const args = [
    '--use-fake-device-for-media-stream',
    // Chrome's sandboxed audio service can't read the fake mic's file otherwise.
    '--disable-features=AudioServiceSandbox',
    '--enable-unsafe-extension-debugging',
    '--enable-unsafe-webgpu',
  ];
  if (grantMic) args.push('--use-fake-ui-for-media-stream');
  if (audioFile) args.push(`--use-file-for-fake-audio-capture=${audioFile}`);

  const cleanUp = async () => {
    await releaseProfile(userDataDir);
    if (freshProfile) fs.rmSync(userDataDir, { recursive: true, force: true });
  };

  await releaseProfile(userDataDir);
  let browser;
  try {
    browser = await getPuppeteer().launch({
      headless: !process.env.HEADFUL,
      executablePath: CHROME,
      userDataDir,
      pipe: true,
      // Every call is short (useMic polls), so a hung Chrome fails fast.
      protocolTimeout: 60_000,
      enableExtensions: true,
      args,
    });
  } catch (err) {
    await cleanUp();
    throw err;
  }
  const close = async () => {
    await browser.close().catch(() => {});
    await cleanUp();
  };

  try {
    const stubSource = `(${installStubs})(${JSON.stringify(stub)})`;
    const cdp = await injectIntoEveryPage(browser, stubSource);
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: DIST });
    // Second layer for pages the stub can't reach before their scripts run
    // (the toolbar popup): the service worker drops LOAD_MODEL on its way
    // to the offscreen document.
    const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith(`chrome-extension://${id}/`));
    const worker = await sw.worker();
    for (let i = 0; !(await worker.evaluate(dropLoadModel).catch(() => false)); i++) {
      if (i === 100) throw new Error("The extension's service worker never got the chrome.* APIs");
      await sleep(50);
    }
    const page = await browser.newPage();
    await page.goto(`chrome-extension://${id}/src/popup/popup.html`);
    await page.waitForSelector('#btn-voice');
    // Opened milliseconds after install, the popup can send before the service
    // worker is up and get empty replies; no person clicks that fast. Wait
    // until the extension answers, and fail loudly if it never does.
    await page.waitForFunction(
      async () => (await chrome.runtime.sendMessage({ type: 'GET_STATUS' }))?.payload != null,
      { polling: 100, timeout: 15_000 },
    ).catch(() => { throw new Error('The extension never answered GET_STATUS'); });
    return { browser, page, extensionId: id, stubSource, close };
  } catch (err) {
    await close();
    throw err;
  }
}

/**
 * Clicks the mic button and waits until voice input is over: the button is
 * idle again and either recording happened or a notice explains why not.
 * `stopAfterMs` clicks the button again that long after recording starts.
 */
export async function useMic(page, { stopAfterMs = null, timeoutMs = 180_000 } = {}) {
  await page.evaluate(({ stopAfterMs, timeoutMs }) => {
    globalThis.__mic = null;
    const btn = document.getElementById('btn-voice');
    const input = document.getElementById('chat-input');
    // With no model loaded, the last transcript stays in the box; start empty.
    input.value = '';
    const noticeEls = () => [...document.querySelectorAll('.message.system-notice')];
    const before = noticeEls().length;
    const t0 = performance.now();
    let recAt = null;
    let stopAt = null;
    let firstWordAt = null;
    btn.click();
    const timer = setInterval(() => {
      const t = performance.now() - t0;
      if (recAt === null && btn.classList.contains('recording')) recAt = t;
      if (stopAfterMs !== null && recAt !== null && stopAt === null && t - recAt >= stopAfterMs) {
        stopAt = t;
        btn.click();
      }
      if (firstWordAt === null && input.value.trim()) firstWordAt = t;
      const busy = btn.classList.contains('active') || btn.classList.contains('voice-loading');
      const notices = noticeEls().slice(before).map((n) => n.textContent.trim());
      const timedOut = t > timeoutMs;
      if ((!busy && (recAt !== null || notices.length > 0)) || timedOut) {
        clearInterval(timer);
        globalThis.__mic = {
          recAt, stopAt, doneAt: t, firstWordAt, timedOut, notices,
          text: input.value.trim(),
          messages: [...(globalThis.__e2e?.sent ?? [])],
          replies: (globalThis.__e2e?.replies ?? []).filter((r) => r.type?.startsWith('VOICE')),
          installCalls: [...(globalThis.__e2e?.installCalls ?? [])],
        };
      }
    }, 50);
  }, { stopAfterMs, timeoutMs });

  let r = null;
  const deadline = Date.now() + timeoutMs + 15_000;
  while (!r) {
    if (Date.now() > deadline) throw new Error('The popup stopped responding');
    await sleep(200);
    r = await page.evaluate(() => globalThis.__mic);
  }

  // With no language model loaded, sendChat() answers with this notice: it means the transcript was sent.
  const sentNotice = (n) => n.startsWith('AI model is still loading');
  return {
    ...r,
    sent: r.notices.some(sentNotice),
    notices: r.notices.filter((n) => !sentNotice(n)),
    engine: r.messages.includes('VOICE_START') ? 'moonshine' : 'chrome',
  };
}

// For a popup page Chrome opened itself: wait until the extension answers it.
async function readyPopup(target, stubSource) {
  const page = await target.asPage();
  await page.waitForSelector('#btn-voice');
  await page.waitForFunction(
    async () => (await chrome.runtime.sendMessage({ type: 'GET_STATUS' }))?.payload != null,
    { polling: 100, timeout: 15_000 },
  );
  // The page starts before the stub can be put in; add it now so its
  // messages are recorded (its LOAD_MODEL was already dropped by the worker).
  if (!(await page.evaluate(() => !!globalThis.__e2e))) await page.evaluate(stubSource);
  return page;
}

/** Opens the extension's real toolbar popup (chrome.action.openPopup) in a browser from openPopup(). */
export async function openToolbarPopup({ browser, extensionId, stubSource }) {
  const isPopup = (t) => t.url() === `chrome-extension://${extensionId}/src/popup/popup.html`;
  const before = new Set(browser.targets().filter(isPopup));
  const sw = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(extensionId));
  await (await sw.worker()).evaluate(() => chrome.action.openPopup());
  const target = await browser.waitForTarget((t) => isPopup(t) && !before.has(t), { timeout: 10_000 });
  return readyPopup(target, stubSource);
}

/** Opens the side panel as a user does, with a real click on the popup's hide button. */
export async function openSidePanel({ browser, page, extensionId, stubSource }) {
  // Puppeteer's click waits for a painted frame, and a background tab never paints.
  await page.bringToFront();
  await page.click('#btn-hide');
  const panelUrl = `chrome-extension://${extensionId}/src/popup/popup.html?stealth=1`;
  const target = await browser.waitForTarget((t) => t.url() === panelUrl, { timeout: 10_000 });
  return readyPopup(target, stubSource);
}

/** Plays `clip` into the mic, presses the button, and scores what came back. */
export async function transcribe(clip, { variant = 'clean', stub = {}, stopAfterMs = null } = {}) {
  const { page, close } = await openPopup({ audioFile: clip.file(variant), stub });
  try {
    const r = await useMic(page, { stopAfterMs });
    const { errors, words } = wordErrors(clip.text, r.text);
    const speechEndMs = clip.speechEndSec * 1000;
    return {
      ...r,
      clip: clip.name,
      variant,
      errors,
      words,
      wer: words ? errors / words : 0,
      // Time origin is the moment the button turned red; the fake mic starts a few ms before.
      readyAfterSpeechMs: r.recAt === null ? null : Math.round(r.doneAt - r.recAt - speechEndMs),
      firstWordMs: r.firstWordAt === null || r.recAt === null ? null : Math.round(r.firstWordAt - r.recAt),
      speechEndMs,
    };
  } finally {
    await close();
  }
}

export function saveResults(rows) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `voice-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 1));
  return file;
}
