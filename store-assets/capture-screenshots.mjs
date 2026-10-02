/**
 * Capture extension UI screenshots for the Chrome Web Store.
 *
 * Renders the built popup (run `npm run build:prod` in extension/ first) from
 * a local server, with chrome.* replaced by a stub that answers with demo
 * data: a finished install with a few documents and chats. Its network log
 * holds the requests a real first run makes: the ones the Trust Panel logged
 * in a test install for the embedding, reranker, speech and VAD models, then
 * Phi-4-mini's config, tokenizer and 66 weight shards. The UI is the real one;
 * only the state is staged.
 */

import puppeteer from 'puppeteer';
import http from 'http';
import { resolve, dirname, extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '../extension/dist');
const OUT = resolve(__dirname);

function toDataUri(pngPath) {
  const buf = readFileSync(pngPath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

// ─── Demo state ───────────────────────────────────────────────────────────────

const HF = 'https://huggingface.co';
const PHI = 'mlc-ai/Phi-4-mini-instruct-q4f16_1-MLC';

// [status, repo, file] in the order a first run requests them. transformers.js
// probes most files with a range request (206) before downloading them (200).
const FIRST_RUN_REQUESTS = [
  [200, 'Xenova/bge-small-en-v1.5', 'config.json'],
  [206, 'Xenova/bge-small-en-v1.5', 'tokenizer_config.json'],
  [206, 'Xenova/bge-small-en-v1.5', 'tokenizer.json'],
  [206, 'Xenova/bge-small-en-v1.5', 'onnx/model.onnx'],
  [200, 'Xenova/bge-small-en-v1.5', 'tokenizer_config.json'],
  [200, 'Xenova/bge-small-en-v1.5', 'tokenizer.json'],
  [200, 'Xenova/bge-small-en-v1.5', 'onnx/model.onnx'],
  [200, 'Xenova/ms-marco-MiniLM-L-6-v2', 'config.json'],
  [206, 'Xenova/ms-marco-MiniLM-L-6-v2', 'tokenizer_config.json'],
  [206, 'Xenova/ms-marco-MiniLM-L-6-v2', 'tokenizer.json'],
  [200, 'Xenova/ms-marco-MiniLM-L-6-v2', 'tokenizer_config.json'],
  [200, 'Xenova/ms-marco-MiniLM-L-6-v2', 'tokenizer.json'],
  [206, 'Xenova/ms-marco-MiniLM-L-6-v2', 'onnx/model_int8.onnx'],
  [206, 'Xenova/ms-marco-MiniLM-L-6-v2', 'onnx/model_int8.onnx'],
  [200, 'Xenova/ms-marco-MiniLM-L-6-v2', 'onnx/model_int8.onnx'],
  [200, 'onnx-community/silero-vad', 'onnx/model.onnx'],
  [200, 'onnx-community/moonshine-tiny-ONNX', 'config.json'],
  [206, 'onnx-community/moonshine-tiny-ONNX', 'tokenizer_config.json'],
  [206, 'onnx-community/moonshine-tiny-ONNX', 'preprocessor_config.json'],
  [206, 'onnx-community/moonshine-tiny-ONNX', 'tokenizer.json'],
  [206, 'onnx-community/moonshine-tiny-ONNX', 'generation_config.json'],
  [206, 'onnx-community/moonshine-tiny-ONNX', 'onnx/encoder_model.onnx'],
  [206, 'onnx-community/moonshine-tiny-ONNX', 'onnx/decoder_model_merged_q4.onnx'],
  [200, 'onnx-community/moonshine-tiny-ONNX', 'preprocessor_config.json'],
  [200, 'onnx-community/moonshine-tiny-ONNX', 'tokenizer_config.json'],
  [200, 'onnx-community/moonshine-tiny-ONNX', 'tokenizer.json'],
  [200, 'onnx-community/moonshine-tiny-ONNX', 'generation_config.json'],
  [200, 'onnx-community/moonshine-tiny-ONNX', 'onnx/encoder_model.onnx'],
  [200, 'onnx-community/moonshine-tiny-ONNX', 'onnx/decoder_model_merged_q4.onnx'],
  [200, PHI, 'mlc-chat-config.json'],
  [200, PHI, 'tensor-cache.json'],
  [200, PHI, 'tokenizer.json'],
  ...Array.from({ length: 66 }, (_, i) => [200, PHI, `params_shard_${i}.bin`]),
];

const INSTALLED_AT = Date.UTC(2026, 8, 22, 9, 14, 0);
const NETWORK_LOG = FIRST_RUN_REQUESTS.map(([statusCode, repo, file], i) => {
  const url = `${HF}/${repo}/resolve/main/${file}`;
  return {
    id: `offscreen:${INSTALLED_AT}:${i}:${url}`,
    url,
    timestamp: INSTALLED_AT + i * 2400,
    statusCode,
    initiatorType: 'fetch',
    context: 'offscreen',
    category: 'model_download',
  };
});

const DAY = 86_400_000;
const DOCUMENTS = [
  ['Reading notes: Designing Data-Intensive Applications', 'obsidian', 21],
  ['Weekly review, Sep 19', 'obsidian', 4],
  ['Trip plan: Lisbon', 'obsidian', 6],
  ['Attention Is All You Need.pdf', 'pdf', 38],
  ['Lease agreement 2026.pdf', 'pdf', 27],
  ['WebGPU fundamentals', 'web_page', 12],
  ['How the Chrome extension service worker lifecycle works', 'web_page', 9],
  ['Home renovation budget', 'obsidian', 5],
].map(([title, source, chunkCount], i) => ({
  id: `doc-${i}`,
  title,
  source,
  sourcePath: source === 'web_page' ? `https://example.com/${i}` : `${title}`,
  createdAt: INSTALLED_AT + i * DAY / 3,
  updatedAt: INSTALLED_AT + i * DAY / 3,
  charCount: chunkCount * 900,
  chunkCount,
}));

const SESSIONS = [
  'What does the lease say about notice periods?',
  'Summarize the replication chapter',
  'Lisbon day trips',
  'Renovation costs so far',
].map((title, i) => ({ id: `session-${i}`, title, updatedAt: INSTALLED_AT + (i + 1) * DAY / 2, messageCount: 4 + i * 2 }));

const STORAGE = {
  onboardingComplete: true,
  chatSessionIndex: SESSIONS,
  activeSessionId: 'session-new',
  'chatSession_session-new': [],
};

// What the Privacy tab reads straight from the browser.
const STORAGE_ESTIMATE = { usage: 2_430_000_000, quota: 2_430_000_000 + 180_000_000_000 };
const CACHE_FILES = { 'webllm/config': 3, 'webllm/model': 66, 'transformers-cache': 16 };

function installChromeStub({ storage, documents, networkLog, estimate, cacheFiles }) {
  const noop = () => {};
  const store = { ...storage };
  const pick = (keys) => {
    if (keys == null) return { ...store };
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
  };
  const replies = {
    GET_STATUS: { type: 'STATUS', payload: { llmReady: true, embeddingsReady: true, storeReady: true, modelId: 'Phi-4-mini-instruct-q4f16_1-MLC' } },
    LIST_DOCUMENTS: { type: 'DOCUMENTS_LIST', payload: documents },
    GET_NETWORK_LOG: { type: 'NETWORK_LOG', payload: networkLog },
  };
  window.chrome = {
    runtime: {
      id: 'demo',
      sendMessage: (message) => Promise.resolve(replies[message?.type] ?? { acknowledged: true }),
      onMessage: { addListener: noop, removeListener: noop },
      getURL: (path) => `/${path}`,
    },
    storage: {
      local: {
        get: (keys) => Promise.resolve(pick(keys)),
        set: (items) => { Object.assign(store, items); return Promise.resolve(); },
        remove: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      },
      onChanged: { addListener: noop },
    },
    tabs: {
      query: () => Promise.resolve([{ id: 1, url: 'https://example.com', title: 'Example' }]),
      create: () => Promise.resolve({}),
    },
    windows: { getCurrent: () => Promise.resolve({ id: 1 }) },
    sidePanel: { open: () => Promise.resolve() },
    permissions: { contains: () => Promise.resolve(true), request: () => Promise.resolve(true) },
  };
  navigator.storage.estimate = () => Promise.resolve(estimate);
  const names = Object.keys(cacheFiles);
  window.caches.keys = () => Promise.resolve(names);
  window.caches.open = (name) => Promise.resolve({ keys: () => Promise.resolve(Array.from({ length: cacheFiles[name] ?? 0 })) });
}

// ─── Local server for the built extension ────────────────────────────────────

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
};

function serve(root) {
  const server = http.createServer((req, res) => {
    const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(server)));
}

// ─── Capture ─────────────────────────────────────────────────────────────────

async function openPopup(browser, base, { height, query = '' }) {
  const page = await browser.newPage();
  await page.setViewport({ width: 380, height, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(installChromeStub, {
    storage: STORAGE, documents: DOCUMENTS, networkLog: NETWORK_LOG,
    estimate: STORAGE_ESTIMATE, cacheFiles: CACHE_FILES,
  });
  await page.goto(`${base}/src/popup/popup.html${query}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.getElementById('status-text')?.textContent === 'Ready');
  await sleep(800); // let animations settle
  return page;
}

async function showTab(page, name) {
  await page.evaluate((n) => document.querySelector(`.tab[data-tab="${n}"]`).click(), name);
  await sleep(600);
}

// Chrome sizes the toolbar popup to its body, which can be shorter than the viewport
async function capturePopup(page, name) {
  const height = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  const viewport = page.viewport();
  await page.screenshot({
    path: resolve(OUT, `${name}.png`),
    clip: { x: 0, y: 0, width: viewport.width, height: Math.min(height, viewport.height) },
  });
  console.log(`Captured: ${name}.png`);
}

async function main() {
  if (!existsSync(join(DIST, 'src/popup/popup.html'))) {
    throw new Error('No build found. Run `npm run build:prod` in extension/ first.');
  }
  const server = await serve(DIST);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ headless: true });

  // The toolbar popup: 380x600
  const popup = await openPopup(browser, base, { height: 600 });
  await capturePopup(popup, 'popup-chat');
  await showTab(popup, 'docs');
  await capturePopup(popup, 'popup-docs');

  // The Privacy tab as the side panel shows it, tall enough for the network log
  const panel = await openPopup(browser, base, { height: 720, query: '?stealth=1' });
  await showTab(panel, 'trust');
  await panel.waitForFunction(() => document.getElementById('trust-network-count')?.textContent !== '–');
  await panel.evaluate(() => document.getElementById('network-hide-models').click()); // show the downloads
  await sleep(400);
  await capturePopup(panel, 'popup-trust');

  // ── Chrome Web Store format: 1280x800 composite mockups ──

  // Create a wider page with the popup centered on a dark background
  const compositePage = await browser.newPage();
  await compositePage.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });

  // Generate a store-ready composite: popup mockup on gradient background
  await compositePage.setContent(`
    <!DOCTYPE html>
    <html>
    <head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1280px;
        height: 800px;
        background: linear-gradient(135deg, #0a0a0a 0%, #141428 50%, #0a0a0a 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #eaeaea;
        overflow: hidden;
        position: relative;
      }
      .glow {
        position: absolute;
        width: 500px;
        height: 500px;
        background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
      .content {
        display: flex;
        align-items: center;
        gap: 60px;
        position: relative;
        z-index: 1;
      }
      .text-side {
        max-width: 420px;
      }
      .text-side h1 {
        font-size: 42px;
        font-weight: 800;
        line-height: 1.1;
        margin-bottom: 16px;
      }
      .text-side h1 .accent { color: #6366f1; }
      .text-side p {
        font-size: 16px;
        color: #888;
        line-height: 1.6;
        margin-bottom: 24px;
      }
      .badges {
        display: flex;
        gap: 8px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        padding: 5px 12px;
        font-size: 12px;
        color: #999;
      }
      .dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #22c55e;
      }
      .popup-frame {
        width: 380px;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(99,102,241,0.1);
        border: 1px solid rgba(255,255,255,0.08);
        background: #0f0f0f;
      }
      .popup-frame img {
        display: block;
        width: 100%;
      }
    </style></head>
    <body>
      <div class="glow"></div>
      <div class="content">
        <div class="text-side">
          <h1><span class="accent">Private AI</span> in your browser</h1>
          <p>Chat with a local AI, search your documents, use voice &mdash; everything runs on your device. No cloud. No API keys.</p>
          <div class="badges">
            <span class="badge"><span class="dot"></span> 100% Local</span>
            <span class="badge"><span class="dot"></span> Offline</span>
            <span class="badge"><span class="dot"></span> Open Source</span>
          </div>
        </div>
        <div class="popup-frame">
          <img src="${toDataUri(resolve(OUT, 'popup-chat.png'))}" />
        </div>
      </div>
    </body>
    </html>
  `, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await compositePage.screenshot({
    path: resolve(OUT, 'store-screenshot-1-hero.png'),
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  console.log('Captured: store-screenshot-1-hero.png');

  // Second composite: Trust Panel focus
  await compositePage.setContent(`
    <!DOCTYPE html>
    <html>
    <head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1280px;
        height: 800px;
        background: linear-gradient(135deg, #0a0a0a 0%, #0a1a14 50%, #0a0a0a 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #eaeaea;
        overflow: hidden;
        position: relative;
      }
      .glow {
        position: absolute;
        width: 500px;
        height: 500px;
        background: radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%);
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }
      .content {
        display: flex;
        align-items: center;
        gap: 60px;
        position: relative;
        z-index: 1;
      }
      .text-side { max-width: 440px; }
      .text-side h1 {
        font-size: 38px;
        font-weight: 800;
        line-height: 1.1;
        margin-bottom: 16px;
      }
      .text-side h1 .accent { color: #22c55e; }
      .text-side p { font-size: 16px; color: #888; line-height: 1.6; margin-bottom: 24px; }
      .proof-box {
        background: rgba(34,197,94,0.06);
        border: 1px solid rgba(34,197,94,0.2);
        border-radius: 10px;
        padding: 16px 20px;
      }
      .proof-row {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        padding: 4px 0;
        font-size: 13px;
      }
      .proof-row .label { color: #888; }
      .proof-row .value { color: #22c55e; font-family: 'SF Mono', monospace; font-size: 12px; }
      .popup-frame {
        width: 380px;
        height: 720px;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(34,197,94,0.08);
        border: 1px solid rgba(255,255,255,0.08);
        background: #0f0f0f;
      }
      .popup-frame img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
    </style></head>
    <body>
      <div class="glow"></div>
      <div class="content">
        <div class="text-side">
          <h1><span class="accent">Check</span> every request</h1>
          <p>The Trust Panel lists every network request EdgeAI makes: the one-time model downloads from Hugging Face, and nothing else. The privacy policy shows how to confirm it in Chrome DevTools.</p>
          <div class="proof-box">
            <div class="proof-row">
              <span class="label">Requests other than model downloads</span>
              <span class="value">None</span>
            </div>
            <div class="proof-row">
              <span class="label">Pages read without you asking</span>
              <span class="value">None</span>
            </div>
            <div class="proof-row">
              <span class="label">Accounts, API keys, analytics</span>
              <span class="value">None</span>
            </div>
          </div>
        </div>
        <div class="popup-frame">
          <img src="${toDataUri(resolve(OUT, 'popup-trust.png'))}" />
        </div>
      </div>
    </body>
    </html>
  `, { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  await compositePage.screenshot({
    path: resolve(OUT, 'store-screenshot-2-trust.png'),
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  console.log('Captured: store-screenshot-2-trust.png');

  await browser.close();
  server.close();
  console.log('Done — all screenshots captured.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
