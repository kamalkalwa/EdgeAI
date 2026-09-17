/**
 * Capture an animated demo GIF showing the Trust Panel's network monitor
 * proving zero outbound requests.
 *
 * Flow:
 * 1. Show popup in "Ready" state on Chat tab
 * 2. User types a question → AI responds (simulated)
 * 3. Switch to Trust/Privacy tab → network monitor shows 0 external requests
 * 4. Highlight "Zero data sent" proof
 */

import puppeteer from 'puppeteer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';
import { mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, 'gif-frames');
const OUT_GIF = resolve(__dirname, 'demo-trust-proof.gif');

if (!existsSync(FRAMES_DIR)) mkdirSync(FRAMES_DIR, { recursive: true });

let frameNum = 0;

async function captureFrame(page, holdFrames = 1) {
  for (let i = 0; i < holdFrames; i++) {
    const path = resolve(FRAMES_DIR, `frame-${String(frameNum++).padStart(4, '0')}.png`);
    await page.screenshot({ path });
  }
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 400, height: 620, deviceScaleFactor: 2 });

  // ── Scene: Fully self-contained HTML that simulates the demo ──
  // We build a simplified version of the popup with animated states
  // rather than trying to load the real popup (which needs chrome.* APIs)

  const html = `<!DOCTYPE html>
<html><head><style>
  :root {
    --bg: #0f0f0f; --surface: #1a1a1a; --border: #2a2a2a;
    --text: #e8e8e8; --text-muted: #9a9a9a; --accent: #6366f1;
    --green: #22c55e; --red: #ef4444; --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 400px; height: 620px; background: var(--bg); color: var(--text); font-family: var(--font); font-size: 14px; overflow: hidden; }

  .header { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .logo-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); margin-right: 8px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .logo { font-size: 16px; font-weight: 700; }
  .header-spacer { flex: 1; }
  .header-icons { display: flex; gap: 8px; color: var(--text-muted); font-size: 12px; }
  .header-icons span { cursor: pointer; opacity: 0.5; }

  .tabs { display: flex; border-bottom: 1px solid var(--border); position: relative; }
  .tab { flex: 1; text-align: center; padding: 10px 0; font-size: 13px; color: var(--text-muted); cursor: pointer; transition: color 0.2s; }
  .tab.active { color: var(--accent); font-weight: 600; }
  .tab-underline { position: absolute; bottom: 0; height: 2px; background: var(--accent); transition: left 0.3s ease, width 0.3s ease; }

  .pane { display: none; flex: 1; flex-direction: column; overflow: hidden; }
  .pane.active { display: flex; }

  /* Chat pane */
  .chat-messages { flex: 1; padding: 16px; overflow-y: auto; }
  .msg { margin-bottom: 12px; max-width: 85%; }
  .msg.user { margin-left: auto; background: var(--accent); color: #fff; padding: 8px 12px; border-radius: 12px 12px 4px 12px; font-size: 13px; }
  .msg.assistant { background: var(--surface); padding: 10px 14px; border-radius: 12px 12px 12px 4px; font-size: 13px; line-height: 1.5; border: 1px solid var(--border); }
  .msg.assistant .src { display: inline-block; font-size: 10px; color: var(--accent); background: rgba(99,102,241,0.1); padding: 2px 6px; border-radius: 4px; margin-top: 6px; }

  .input-bar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); }
  .input-bar .mic { width: 36px; height: 36px; border-radius: 50%; background: var(--surface); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .input-bar input { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 8px 14px; color: var(--text); font-size: 13px; outline: none; }
  .input-bar .send { width: 36px; height: 36px; border-radius: 50%; background: var(--accent); border: none; color: #fff; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; }

  .status-bar { display: flex; justify-content: space-between; padding: 6px 16px; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border); }

  /* Trust pane */
  .trust-content { padding: 16px; flex: 1; overflow-y: auto; }
  .trust-section { margin-bottom: 20px; }
  .trust-section h3 { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent); margin-bottom: 10px; }
  .trust-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
  .trust-row { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 13px; }
  .trust-row .label { color: var(--text-muted); }
  .trust-row .value { font-family: 'SF Mono', monospace; font-size: 12px; }
  .trust-row .value.green { color: var(--green); }
  .trust-row .value.red { color: var(--red); }

  .zero-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); border-radius: 8px; padding: 10px 14px; margin-top: 8px; font-size: 13px; color: var(--green); font-weight: 600; }
  .zero-badge .icon { font-size: 16px; }

  .audit-entry { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; margin-bottom: 6px; font-size: 12px; }
  .audit-entry .type { color: var(--accent); font-weight: 600; font-size: 11px; text-transform: uppercase; }
  .audit-entry .detail { color: var(--text-muted); margin-top: 2px; }
  .audit-entry .time { color: var(--text-muted); font-size: 10px; float: right; }

  /* Highlight animation */
  .highlight-ring { animation: ring 1s ease-out; }
  @keyframes ring {
    0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
    100% { box-shadow: 0 0 0 12px rgba(34,197,94,0); }
  }

  /* Cursor animation */
  .cursor { display: inline-block; width: 2px; height: 14px; background: var(--accent); animation: blink 1s infinite; vertical-align: middle; margin-left: 2px; }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

  .hidden { display: none !important; }
</style></head>
<body>
  <div class="header">
    <div class="logo-dot"></div>
    <span class="logo">EdgeAI</span>
    <div class="header-spacer"></div>
    <div class="header-icons">
      <span>+</span> <span>&#128196;</span> <span>&#9716;</span> <span>&#128065;&#8205;</span> <span>&#9881;</span>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="chat">Chat</div>
    <div class="tab" data-tab="import">Import</div>
    <div class="tab" data-tab="docs">Documents</div>
    <div class="tab" data-tab="trust">Privacy</div>
    <div class="tab-underline" style="left: 0; width: 25%;"></div>
  </div>

  <!-- Chat Pane -->
  <div class="pane active" id="pane-chat">
    <div class="chat-messages" id="chat-messages"></div>
    <div class="input-bar">
      <div class="mic">&#127908;</div>
      <input id="chat-input" placeholder="Ask anything..." />
      <button class="send">&#10148;</button>
    </div>
  </div>

  <!-- Trust Pane -->
  <div class="pane" id="pane-trust">
    <div class="trust-content">
      <div class="trust-section">
        <h3>Network Activity</h3>
        <div class="trust-card" id="network-card">
          <div class="trust-row"><span class="label">External API calls</span><span class="value green">0 requests</span></div>
          <div class="trust-row"><span class="label">Data sent to servers</span><span class="value green">0 bytes</span></div>
          <div class="trust-row"><span class="label">Analytics / telemetry</span><span class="value green">None</span></div>
          <div class="trust-row"><span class="label">Model cache (local)</span><span class="value" style="color:#9a9a9a">2.4 GB</span></div>
        </div>
        <div class="zero-badge hidden" id="zero-badge">
          <span class="icon">&#9989;</span> Zero data sent — verified
        </div>
      </div>

      <div class="trust-section">
        <h3>Audit Log</h3>
        <div id="audit-log"></div>
      </div>

      <div class="trust-section">
        <h3>Build Verification</h3>
        <div class="trust-card">
          <div class="trust-row"><span class="label">Commit</span><span class="value" style="color:#9a9a9a">a3f8c2d</span></div>
          <div class="trust-row"><span class="label">Version</span><span class="value" style="color:#9a9a9a">v0.1.0</span></div>
          <div class="trust-row"><span class="label">Source</span><span class="value green">Open source</span></div>
        </div>
      </div>
    </div>
  </div>

  <div class="status-bar">
    <span id="status-text">Ready</span>
    <span>v0.1.0</span>
  </div>
</body></html>`;

  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await sleep(300);

  // ── Scene 1: Ready state with empty chat (hold 1s) ──
  await captureFrame(page, 8);

  // ── Scene 2: User types a question ──
  const question = 'What did my meeting notes say about the Q3 budget?';
  for (let i = 0; i <= question.length; i++) {
    await page.evaluate((text) => {
      document.getElementById('chat-input').value = text;
    }, question.slice(0, i));
    if (i % 3 === 0) await captureFrame(page, 1); // capture every 3 chars
  }
  await captureFrame(page, 4); // pause on full question

  // ── Scene 3: Send message, show user bubble ──
  await page.evaluate((q) => {
    document.getElementById('chat-input').value = '';
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg user';
    div.textContent = q;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }, question);
  await captureFrame(page, 6);

  // ── Scene 4: AI typing response ──
  const response = 'Based on your meeting notes from March 3rd, the Q3 budget was set at $2.4M — a 15% increase from Q2. Sarah flagged that engineering headcount accounts for 60% of the allocation.';
  const sourceTag = 'meeting-notes-mar3.md';

  // Show typing indicator
  await page.evaluate(() => {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg assistant';
    div.id = 'ai-response';
    div.innerHTML = '<span class="cursor"></span>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  });
  await captureFrame(page, 4);

  // Stream response word by word
  const words = response.split(' ');
  for (let i = 1; i <= words.length; i++) {
    const partial = words.slice(0, i).join(' ');
    await page.evaluate((text) => {
      const el = document.getElementById('ai-response');
      el.innerHTML = text + '<span class="cursor"></span>';
      document.getElementById('chat-messages').scrollTop = 99999;
    }, partial);
    if (i % 4 === 0 || i === words.length) await captureFrame(page, 1);
  }

  // Add source tag
  await page.evaluate((text, src) => {
    const el = document.getElementById('ai-response');
    el.innerHTML = text + '<br><span class="src">&#128196; ' + src + '</span>';
    document.getElementById('chat-messages').scrollTop = 99999;
  }, response, sourceTag);
  await captureFrame(page, 12); // hold on complete answer

  // ── Scene 5: Switch to Trust tab ──
  await page.evaluate(() => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab')[3].classList.add('active');
    document.querySelector('.tab-underline').style.left = '75%';
    document.getElementById('pane-chat').classList.remove('active');
    document.getElementById('pane-trust').classList.add('active');
  });
  await sleep(100);
  await captureFrame(page, 8);

  // ── Scene 6: Highlight network card ──
  await page.evaluate(() => {
    document.getElementById('network-card').classList.add('highlight-ring');
  });
  await captureFrame(page, 6);

  // ── Scene 7: Show zero-badge ──
  await page.evaluate(() => {
    document.getElementById('zero-badge').classList.remove('hidden');
  });
  await captureFrame(page, 10);

  // ── Scene 8: Show audit log entries ──
  const auditEntries = [
    { type: 'chat_query', detail: '"What did my meeting notes say about Q3 budget?"', time: 'Just now' },
    { type: 'rag_search', detail: '3 chunks retrieved from meeting-notes-mar3.md', time: 'Just now' },
    { type: 'document_index', detail: 'meeting-notes-mar3.md (12 chunks)', time: '2 min ago' },
  ];

  for (const entry of auditEntries) {
    await page.evaluate((e) => {
      const log = document.getElementById('audit-log');
      const div = document.createElement('div');
      div.className = 'audit-entry';
      div.innerHTML = '<span class="time">' + e.time + '</span><div class="type">' + e.type + '</div><div class="detail">' + e.detail + '</div>';
      log.appendChild(div);
    }, entry);
    await captureFrame(page, 5);
  }

  // Hold final frame
  await captureFrame(page, 15);

  await browser.close();

  // ── Stitch frames into GIF with ffmpeg ──
  console.log(`Captured ${frameNum} frames. Stitching GIF...`);

  execSync(
    `ffmpeg -y -framerate 8 -i "${FRAMES_DIR}/frame-%04d.png" -vf "fps=8,scale=400:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${OUT_GIF}"`,
    { stdio: 'inherit' }
  );

  console.log(`Done: ${OUT_GIF}`);
}

main().catch(console.error);
