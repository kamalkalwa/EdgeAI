/**
 * Capture extension UI screenshots for Chrome Web Store.
 *
 * The popup HTML renders its full CSS layout even without Chrome APIs.
 * We mock chrome.* minimally so JS doesn't throw on load, then capture
 * the static UI at various states.
 */

import puppeteer from 'puppeteer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function toDataUri(pngPath) {
  const buf = readFileSync(pngPath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}
const POPUP_HTML = resolve(__dirname, '../extension/src/popup/popup.html');
const OUT = resolve(__dirname);

async function capturePopup(page, name, options = {}) {
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({
    path,
    clip: options.clip,
    ...(!options.clip && { fullPage: false }),
  });
  console.log(`Captured: ${name}.png`);
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set popup dimensions (380x600 is the extension popup size)
  await page.setViewport({ width: 380, height: 600, deviceScaleFactor: 2 });

  // Mock chrome APIs before page loads so scripts don't crash
  await page.evaluateOnNewDocument(() => {
    const noop = () => {};
    const noopPromise = () => Promise.resolve({});
    const noopCb = () => ({ catch: noop });

    window.chrome = {
      runtime: {
        sendMessage: () => Promise.resolve({
          type: 'STATUS',
          payload: { llmReady: true, embeddingsReady: true, storeReady: true },
        }),
        onMessage: {
          addListener: noop,
          removeListener: noop,
        },
        getURL: (path) => path,
        id: 'mock-extension-id',
      },
      storage: {
        local: {
          get: (keys) => Promise.resolve({}),
          set: noopPromise,
        },
        onChanged: { addListener: noop },
      },
      tabs: {
        query: () => Promise.resolve([{ id: 1, url: 'https://example.com', title: 'Example' }]),
        sendMessage: noopPromise,
        create: noopPromise,
      },
      windows: {
        getCurrent: () => Promise.resolve({ id: 1 }),
      },
      sidePanel: {
        open: noopPromise,
      },
      permissions: {
        contains: () => Promise.resolve(true),
      },
    };
  });

  await page.goto(`file://${POPUP_HTML}`, { waitUntil: 'networkidle0' });
  await sleep(1000); // Let animations settle

  // Screenshot 1: Main chat UI (default state)
  await capturePopup(page, 'popup-chat');

  // Click the Docs tab to show documents pane
  const tabs = await page.$$('.tab');
  if (tabs.length >= 2) {
    await tabs[1].click();
    await sleep(500);
    await capturePopup(page, 'popup-docs');
  }

  // Click the Trust tab
  if (tabs.length >= 3) {
    await tabs[2].click();
    await sleep(500);
    await capturePopup(page, 'popup-trust');
  }

  // Back to chat tab
  if (tabs.length >= 1) {
    await tabs[0].click();
    await sleep(300);
  }

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
        height: 560px;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(99,102,241,0.1);
        border: 1px solid rgba(255,255,255,0.08);
        background: #0f0f0f;
      }
      .popup-frame img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: top;
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
      .text-side { max-width: 420px; }
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
        padding: 4px 0;
        font-size: 13px;
      }
      .proof-row .label { color: #888; }
      .proof-row .value { color: #22c55e; font-family: 'SF Mono', monospace; font-size: 12px; }
      .popup-frame {
        width: 380px;
        height: 560px;
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
          <h1><span class="accent">Verify</span> your privacy</h1>
          <p>Built-in Trust Panel shows every network request, every operation, every byte. Prove to yourself &mdash; and your compliance team &mdash; that no data leaves your device.</p>
          <div class="proof-box">
            <div class="proof-row">
              <span class="label">External API calls</span>
              <span class="value">0 requests</span>
            </div>
            <div class="proof-row">
              <span class="label">Data sent to servers</span>
              <span class="value">0 bytes</span>
            </div>
            <div class="proof-row">
              <span class="label">Analytics / telemetry</span>
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
  console.log('Done — all screenshots captured.');
}

main().catch(console.error);
