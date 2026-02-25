# EdgeAI — Manual Testing Guide

This guide walks through the full Phase 1 sanity check. Run it before any
demo, interview, or "Sell Before Create" validation session.

---

## 0. Prerequisites

- Chrome 120+ (for WebGPU support; enable at `chrome://flags/#enable-webgpu-developer-features` if needed)
- Apple Silicon Mac OR a GPU with ≥4 GB VRAM (Phi-3.5-mini requirement)
- Node.js 20+
- A small Obsidian vault (5–10 notes) and one PDF file for import tests

---

## 1. Build & Type-Check

```bash
cd EdgeAI/extension
npm run type-check       # expect: 0 errors
npm run build            # expect: dist/ folder populated with manifest + chunks
npm test                 # expect: 68 passed, 0 failed, ~500ms
```

**Pass criteria:** No red output from any of the three commands.

---

## 2. Load Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `EdgeAI/extension/dist/`
4. Verify: extension card appears with EdgeAI name, no red error badge

**Check the service worker:**
- Click "Service Worker" link on the extension card
- DevTools console should show: no uncaught exceptions on startup
- You should see a log like `[EdgeAI offscreen] embeddings_and_reranker ready` within ~5s

---

## 3. Model Loading

1. Click the EdgeAI icon in the toolbar → popup opens
2. The status indicator should show **"Loading embeddings…"** briefly
3. Within ~30s (first run: ~2 min, downloads 55MB), status shows **"Embeddings ready"**
4. Click **"Load LLM"** button
5. A progress bar appears — LLM downloads (~2.3GB first time, uses Cache API thereafter)
6. Final status: **"Phi-3.5-mini ready"** (or Llama-3.2-1B on low-VRAM hardware)

**Expected console output (offscreen DevTools):**
```
[EdgeAI] Selected model: Phi-3.5-mini-instruct-q4f16_1-MLC
[EdgeAI offscreen] Model ready
```

**Failure modes:**
- `WebGPU not available` → enable the Chrome flag listed in §0
- Stuck at "Loading…" after 5 min → check chrome://extensions service worker console for errors

---

## 4. Chat (No Documents)

1. Type: `What is the capital of France?`
2. Press Enter or click Send
3. **Expected:** Streaming response arrives token-by-token, answers "Paris"
4. Type a follow-up: `And what's its population?`
5. **Expected:** LLM uses conversation history, answers coherently without re-stating the question

**Pass criteria:**
- Response streams visibly (not all at once)
- Follow-up works (multi-turn context preserved)
- No hanging spinner after response completes

---

## 5. Document Import — Obsidian Vault

### Setup: create a small test vault with these files:

```
test-vault/
  note-1.md     — "Project Orion launch date: 2024-03-15. Budget: $2.5M."
  note-2.md     — "Team structure: Alice (PM), Bob (Eng Lead), Carol (Design)."
  note-3.md     — (any long note, >10 sentences)
  .obsidian/    — (Obsidian config dir — should be skipped silently)
  big-note.md   — (create a file >10 MB to test the size cap)
```

### Steps:

1. Click **Import → Obsidian Vault**
2. Vault picker opens → select `test-vault/`
3. Grant read permission when prompted
4. Watch the progress indicator

**Expected:**
- `note-1.md`, `note-2.md`, `note-3.md` all imported (shown in Documents tab)
- `big-note.md` skipped with console warning `[Obsidian] Skipping oversized file`
- `.obsidian/` contents NOT imported

5. Switch to the **Documents** tab
6. Verify: 3 documents listed with correct titles and chunk counts

**Persistence test:**
7. Close the popup, wait 5 seconds, reopen
8. Documents tab should still show all 3 documents (tests IDB persistence fix)

---

## 6. RAG Chat (With Documents)

After importing the vault from §5:

1. Ask: `When is Project Orion launching?`
2. **Expected:** Answer includes "2024-03-15" and cites `note-1.md`

3. Ask: `Who is the engineering lead?`
4. **Expected:** Answer includes "Bob" and cites `note-2.md`

5. Ask: `What's the budget for the project?`
6. **Expected:** Answer includes "$2.5M"

**This is the critical end-to-end test. It validates:**
- Embedding model working (generates query vector)
- BM25 + vector search returning relevant chunks
- RRF fusion ranking correctly
- LLM using retrieved context in its answer

**Pass criteria:** All three questions answered correctly with source citations.

---

## 7. Document Import — PDF

1. Click **Import → PDF**
2. Select a multi-page PDF (≤50 MB, primarily text-based)
3. Verify: document appears in Documents tab with correct title and chunk count
4. Ask a question about content from the PDF
5. **Expected:** LLM answer references PDF content

**Edge case — size limit:**
6. Try importing a PDF >50 MB
7. **Expected:** Error message "PDF … exceeds the 50 MB limit", no crash

---

## 8. Document Import — Bookmarks

1. Create a Chrome bookmarks folder called "EdgeAI Test" with:
   - 2–3 real public URLs (e.g., `https://github.com`, `https://en.wikipedia.org/wiki/AI`)
   - 1 local URL: `http://localhost:3000` (should be blocked)
   - 1 internal: `http://192.168.1.1` (should be blocked)

2. Click **Import → Bookmarks**
3. **Expected:**
   - Public URLs fetched and indexed (progress increments for each)
   - `localhost` and `192.168.1.1` silently skipped (no error, just not indexed)
   - Documents tab shows only the public bookmark content

**IPv6 test (security regression):**
4. Add bookmark: `http://[::1]/admin` — should be blocked by SSRF protection
5. Verify it is not fetched (not in Documents tab after import)

---

## 9. Delete Document

1. In the Documents tab, click the **delete icon** on any document
2. **Expected:** Document removed from list immediately
3. Ask a question about content from that document
4. **Expected:** LLM answer does NOT include the deleted content (may say "I don't know")

---

## 10. Streaming & Error Recovery

### Test: close popup mid-stream

1. Send a chat message (any question)
2. While response is streaming, **close the popup**
3. Reopen popup
4. **Expected:** No hanging spinner, UI is in a clean state (empty input, no loading indicator)

### Test: 120-second timeout (stress test)

1. In offscreen DevTools, set a breakpoint in `handleChat` so streaming stalls
2. Wait 2 minutes
3. **Expected:** Popup shows "Response timed out" and re-enables the Send button

---

## 11. Trust Panel

1. Click the **Trust** tab in the popup
2. **Expected:**
   - Storage usage shown (e.g., "12.4 MB of 2 GB quota")
   - List of indexed document sources visible
   - "Clear all data" button present

3. After importing documents, verify storage estimate increases

---

## 12. Multi-Session Persistence

This is the full restart test:

1. Import ≥2 documents from different sources (Obsidian + PDF)
2. Close Chrome completely (`⌘Q`)
3. Relaunch Chrome
4. Open EdgeAI popup
5. **Expected:**
   - Documents tab shows all previously imported documents
   - Ask a RAG question → still gets correct context-augmented answer
   - (Note: LLM weights are cached in Cache API, so reload should be fast)

---

## Known Gaps (Phase 1 — Intentional, Not Bugs)

| Gap | Impact | Phase |
|-----|--------|-------|
| Indexing same file twice creates duplicate entries | Cosmetic, affects search noise | Phase 2 |
| No progress for LLM token count / cost | Observability | Phase 2 |
| Voice input not wired to UI (VAD/ASR code exists) | Feature gap | Phase 2 |
| YAML list-style tags (`- tag1`) not parsed in Obsidian | Minor metadata loss | Phase 2 |
| No notion/Google Drive connector | Feature gap | Phase 3 |

---

## Quick Smoke Test (30-second check)

If you only have 30 seconds:

```
1. Load extension in Chrome
2. Open popup → embeddings load
3. Type "hello" → streaming response appears
4. Done ✓
```

Full test suite (§1–§12) takes ~45 minutes end-to-end.
