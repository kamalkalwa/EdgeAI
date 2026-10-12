/**
 * Records your voice for the voice test (needs ffmpeg).
 *
 *   npm run record:voice                    every phrase in voice/phrases.json
 *   npm run record:voice -- in-rishi        one phrase, by name (to redo it)
 *   npm run record:voice -- "Any sentence"  a sentence of your own
 *
 * Saves voice/recordings/<name>.wav and <name>.txt. Every later
 * `npm run test:voice` plays them through the fake mic. Set VOICE_MIC to a
 * device name or index to choose the microphone.
 */

import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { fileURLToPath } from 'url';
import { PHRASES } from './lib.mjs';

const RECORDINGS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'voice/recordings');

function pickMic() {
  if (process.env.VOICE_MIC) return process.env.VOICE_MIC;
  let listing = '';
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { stdio: 'pipe' });
  } catch (err) {
    listing = String(err.stderr ?? '');
  }
  const audio = listing.split('audio devices:')[1] ?? '';
  const devices = [...audio.matchAll(/\[(\d+)\] (.+)/g)].map((m) => ({ index: m[1], name: m[2].trim() }));
  const mic = devices.find((d) => /MacBook.*Microphone|Built-in Microphone/i.test(d.name))
    ?? devices.find((d) => /Microphone/i.test(d.name))
    ?? devices[0];
  if (!mic) throw new Error('No microphone found (is ffmpeg installed? brew install ffmpeg)');
  return mic.name;
}

function record(file, mic) {
  const ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'avfoundation', '-i', `:${mic}`,
    '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ffmpeg.on('exit', (code) => (code === 0 || fs.existsSync(file) ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
  return { stop: () => { ffmpeg.stdin.write('q'); return done; }, done };
}

const arg = process.argv.slice(2).join(' ').trim();
const phrases = !arg
  ? PHRASES
  : PHRASES.filter((p) => p.name === arg).length
    ? PHRASES.filter((p) => p.name === arg)
    : [{ name: `custom-${Date.now()}`, text: arg }];

fs.mkdirSync(RECORDINGS, { recursive: true });
const mic = pickMic();
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Microphone: ${mic}. Speak normally, as you would to EdgeAI.\n`);

for (const p of phrases) {
  const text = p.text.replace(/\s*\[\[slnc \d+\]\]\s*/g, ' ');
  const file = path.join(RECORDINGS, `${p.name}.wav`);
  console.log(`${p.name}:\n  "${text}"`);
  await rl.question('  Enter to start… ');
  const rec = record(file, mic);
  await rl.question('  Recording. Enter when you have finished… ');
  await rec.stop();
  fs.writeFileSync(path.join(RECORDINGS, `${p.name}.txt`), `${text}\n`);
  const seconds = (fs.statSync(file).size - 44) / 32000;
  console.log(`  Saved ${seconds.toFixed(1)} s. Redo with: npm run record:voice -- ${p.name}\n`);
}
rl.close();
