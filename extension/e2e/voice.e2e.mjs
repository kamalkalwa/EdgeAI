/**
 * Voice input, end to end: real Chrome, the built extension, the popup's own
 * mic button, and a fake microphone playing recorded speech.
 *
 *   npm run test:voice        quick run, about 4 minutes
 *   npm run test:voice:full   every clip, clean and noisy, Chrome vs Moonshine
 *
 * Clips are the phrases in voice/phrases.json spoken by macOS voices, plus any
 * real recordings in voice/recordings/ (npm run record:voice makes them).
 * The first run downloads Chrome's English speech pack and Moonshine into
 * e2e/.cache/profile; later runs reuse them.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transcribe, openPopup, openToolbarPopup, openSidePanel, useMic, wordErrors,
  syntheticClips, recordedClips, silentClip, saveResults,
} from './lib.mjs';

const FULL = process.env.VOICE_E2E_FULL === '1';
const QUICK = ['us-samantha', 'in-rishi', 'uk-daniel', 'in-tara-pause'];

// Chrome on-device, measured Oct 2026 on these clips: 1.9% clean (twice), and
// 3.2% then 7.0% noisy: on noisy audio the same clip can come out differently.
const MAX_CLIP_WER = { clean: 0.2, noisy: 0.35 };
const MAX_RECORDING_WER = 0.25;
const MAX_TOTAL_WER = { clean: 0.05, noisy: 0.1 };
const MAX_MOONSHINE_CLIP_WER = 0.35;
// 2 s of that is the deliberate wait for more speech before stopping.
const MAX_READY_AFTER_SPEECH_MS = 4000;

const synthetic = syntheticClips();
const recordings = recordedClips();
const byName = (name) => synthetic.find((c) => c.name === name) ?? assert.fail(`no clip ${name}`);
const rows = [];

function describeRun(r) {
  return `WER ${(r.wer * 100).toFixed(0)}% · ready ${r.readyAfterSpeechMs} ms after speech · "${r.text}"`;
}

const DOWNLOAD_NOTICE = 'downloading its on-device speech model';
// The first run on a new profile also says Chrome is downloading its speech model.
const unexpectedNotices = (r) => r.notices.filter((n) => !n.includes(DOWNLOAD_NOTICE));

function werOf(clip, text) {
  const { errors, words } = wordErrors(clip.text, text);
  return errors / words;
}

/** One question by voice in the popup page that `open` opens from a fresh browser. */
async function askIn(t, open) {
  const clip = byName('us-samantha');
  const opened = await openPopup({ audioFile: clip.file() });
  try {
    const r = await useMic(await open(opened));
    t.diagnostic(`heard "${r.text}"`);
    assert.deepEqual(unexpectedNotices(r), [], 'unexpected notice');
    assert.equal(r.engine, 'chrome');
    assert.ok(r.sent && werOf(clip, r.text) <= MAX_CLIP_WER.clean, `heard "${r.text}"`);
  } finally {
    await opened.close();
  }
}

/** Three voice questions in a row in one popup, as someone asking follow-ups would. */
async function askThreeTimes(t, clip, { stub = {}, engine }) {
  const limit = engine === 'chrome' ? MAX_CLIP_WER.clean : MAX_MOONSHINE_CLIP_WER;
  const { page, close } = await openPopup({ audioFile: clip.repeated(3), stub });
  try {
    for (let i = 1; i <= 3; i++) {
      const r = await useMic(page);
      t.diagnostic(`question ${i}: "${r.text}"`);
      assert.deepEqual(unexpectedNotices(r), [], `question ${i}: unexpected notice`);
      assert.equal(r.engine, engine);
      assert.ok(r.sent && werOf(clip, r.text) <= limit, `question ${i}: heard "${r.text}"`);
    }
  } finally {
    await close();
  }
}

async function checkOnDevice(t, clip, variant) {
  const r = await transcribe(clip, { variant });
  rows.push(r);
  t.diagnostic(describeRun(r));
  assert.equal(r.timedOut, false, 'voice input never finished');
  assert.deepEqual(unexpectedNotices(r), [], 'unexpected notice');
  assert.equal(r.engine, 'chrome', 'fell back to Moonshine');
  assert.ok(r.sent, 'transcript was not sent to the chat');
  const limit = clip.source === 'recording' ? MAX_RECORDING_WER : MAX_CLIP_WER[variant];
  assert.ok(r.wer <= limit, `heard "${r.text}" for "${clip.text}"`);
  if (clip.source === 'synthetic') {
    assert.ok(r.firstWordMs !== null && r.firstWordMs < r.speechEndMs, 'no words on screen while speaking');
    assert.ok(r.readyAfterSpeechMs <= MAX_READY_AFTER_SPEECH_MS, `text ready ${r.readyAfterSpeechMs} ms after speech`);
  }
  return r;
}

function totalWer(rs) {
  return rs.reduce((n, r) => n + r.errors, 0) / rs.reduce((n, r) => n + r.words, 0);
}

describe('Chrome on-device speech', () => {
  const variants = FULL ? ['clean', 'noisy'] : ['clean'];
  const clips = FULL ? synthetic : QUICK.map(byName);
  const runs = [];

  for (const variant of variants) {
    for (const clip of clips) {
      test(`${clip.name} (${variant})`, async (t) => runs.push(await checkOnDevice(t, clip, variant)));
    }
  }
  if (!FULL) {
    test('in-tara-pause (noisy)', async (t) => runs.push(await checkOnDevice(t, byName('in-tara-pause'), 'noisy')));
  }

  for (const variant of variants) {
    test(`word error rate across ${variant} clips stays under ${MAX_TOTAL_WER[variant] * 100}%`, () => {
      const rs = runs.filter((r) => r.variant === variant);
      assert.ok(rs.length > 0, 'no clips ran');
      assert.ok(totalWer(rs) <= MAX_TOTAL_WER[variant], `WER ${(totalWer(rs) * 100).toFixed(1)}%`);
    });
  }

  for (const clip of recordings) {
    test(`${clip.name} (your recording)`, async (t) => { await checkOnDevice(t, clip, 'clean'); });
  }
});

describe('Chrome on-device speech: other paths', () => {
  test('downloads the language pack first when Chrome needs it', async (t) => {
    const r = await transcribe(byName('us-samantha'), { stub: { available: 'downloadable', install: true } });
    t.diagnostic(describeRun(r));
    assert.ok(r.notices.some((n) => n.includes(DOWNLOAD_NOTICE)), 'no download notice');
    assert.equal(r.installCalls.length, 1);
    assert.equal(r.installCalls[0].processLocally, true);
    assert.equal(r.engine, 'chrome');
    assert.ok(r.sent && r.wer <= MAX_CLIP_WER.clean, `heard "${r.text}"`);
  });

  test('stopping by hand sends what was heard so far', async (t) => {
    const clip = byName('us-samantha-long');
    const r = await transcribe(clip, { stopAfterMs: 4000 });
    t.diagnostic(`stopped 4 s in: "${r.text}"`);
    assert.ok(r.sent, 'nothing was sent');
    assert.equal(r.engine, 'chrome');
    assert.ok(clip.text.toLowerCase().startsWith(r.text.split(' ').slice(0, 3).join(' ').toLowerCase()), `heard "${r.text}"`);
    assert.ok(r.text.split(' ').length < clip.text.split(' ').length, 'kept listening after the stop');
    assert.ok(r.doneAt - r.stopAt <= 2000, `took ${Math.round(r.doneAt - r.stopAt)} ms after the stop`);
  });

  test('works in the real toolbar popup', (t) => askIn(t, async (opened) => {
    // Leave the toolbar popup as the only copy, as a user would have it.
    for (const p of await opened.browser.pages()) if (p.url().includes('popup.html')) await p.close();
    return openToolbarPopup(opened);
  }));

  test('works in the side panel', (t) => askIn(t, openSidePanel));

  test('answers three questions in a row in one popup', (t) => askThreeTimes(t, byName('in-aman'), { engine: 'chrome' }));

  test('says so when nothing is said', async () => {
    const r = await transcribe(silentClip());
    assert.deepEqual(r.notices, ['No speech detected']);
    assert.equal(r.sent, false);
    assert.equal(r.engine, 'chrome');
  });

  test('asks for the mic in a tab, before downloading anything, when it is not allowed yet', async () => {
    const stub = { available: 'downloadable', install: true };
    const { browser, page, close } = await openPopup({ grantMic: false, freshProfile: true, stub });
    try {
      const grantTab = browser.waitForTarget((tg) => tg.url().includes('src/mic-grant/mic-grant.html'), { timeout: 15_000 });
      const r = await useMic(page);
      await grantTab;
      assert.ok(r.notices.some((n) => n.includes('grant microphone access')), `notices: ${r.notices}`);
      assert.equal(r.recAt, null, 'started recording without permission');
      assert.deepEqual(r.installCalls, [], 'downloaded a language pack first');
      assert.ok(!r.messages.includes('VOICE_START'));
    } finally {
      await close();
    }
  });
});

describe('Moonshine fallback', () => {
  const unavailable = { available: 'unavailable' };

  test("takes over when Chrome can't recognize speech on-device", async (t) => {
    const r = await transcribe(byName('us-samantha'), { stub: unavailable });
    rows.push(r);
    t.diagnostic(describeRun(r));
    assert.equal(r.engine, 'moonshine');
    assert.ok(r.sent && r.wer <= MAX_MOONSHINE_CLIP_WER, `heard "${r.text}"`);
  });

  test("takes over when Chrome can't download the language pack", async (t) => {
    const r = await transcribe(byName('in-rishi'), { stub: { available: 'downloadable', install: false } });
    t.diagnostic(describeRun(r));
    assert.equal(r.installCalls.length, 1);
    assert.equal(r.engine, 'moonshine');
    assert.ok(r.sent && r.wer <= MAX_MOONSHINE_CLIP_WER, `heard "${r.text}"`);
  });

  test('takes over when Chrome refuses on-device recognition after saying it could', async (t) => {
    const r = await transcribe(byName('us-samantha'), { stub: { refuseWith: 'service-not-allowed' } });
    t.diagnostic(describeRun(r));
    assert.deepEqual(r.notices, []);
    assert.equal(r.engine, 'moonshine');
    assert.ok(r.sent && r.wer <= MAX_MOONSHINE_CLIP_WER, `heard "${r.text}"`);
  });

  test('says so, instead of "Listening…", when VOICE_START gets no answer', async () => {
    const { page, close } = await openPopup({ stub: { ...unavailable, voiceStartReply: null } });
    try {
      const r = await useMic(page, { timeoutMs: 15_000 });
      assert.equal(r.recAt, null, 'showed recording without a recording');
      assert.deepEqual(r.notices, ['Could not start voice input. Please try again.']);
    } finally {
      await close();
    }
  });

  test('answers three questions in a row in one popup', (t) => askThreeTimes(t, byName('in-aman'), { stub: unavailable, engine: 'moonshine' }));

  if (FULL) {
    for (const variant of ['clean', 'noisy']) {
      for (const clip of [...synthetic, ...recordings]) {
        if (variant === 'noisy' && clip.source === 'recording') continue;
        test(`${clip.name} (${variant})`, async (t) => {
          const r = await transcribe(clip, { variant, stub: unavailable });
          rows.push(r);
          t.diagnostic(describeRun(r));
          assert.equal(r.engine, 'moonshine');
          assert.ok(r.sent, 'transcript was not sent to the chat');
        });
      }
    }
  }
});

// Last, so its lines print after every result.
test('results', (t) => {
  if (!rows.length) return;
  t.diagnostic(`saved to ${saveResults(rows)}`);
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.engine} ${r.variant}${r.clip.startsWith('rec-') ? ' (your recordings)' : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, rs] of groups) {
    const errors = rs.reduce((n, r) => n + r.errors, 0);
    const words = rs.reduce((n, r) => n + r.words, 0);
    const ready = rs.map((r) => r.readyAfterSpeechMs).filter((x) => x !== null).sort((a, b) => a - b);
    t.diagnostic(`${key}: WER ${((100 * errors) / words).toFixed(1)}% (${errors}/${words} words), text ready ${ready[Math.floor(ready.length / 2)]} ms after speech (median of ${rs.length})`);
  }
});
