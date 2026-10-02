# EdgeAI — Chrome Web Store Listing

> Copy-paste ready materials for the Chrome Web Store Developer Dashboard.

---

## Extension Name

```
EdgeAI — Private AI Assistant
```

## Short Description (132 chars max)

The store shows the manifest's `description` as the summary, so this must match `extension/src/manifest.json`.

```
Your AI. Your device. Your data. Works offline once the models download. No API keys, no accounts, no data leaves your device.
```

## Detailed Description

```
EdgeAI is a fully private AI assistant that runs entirely on your device. No API keys. No accounts. No cloud servers. Your conversations and documents never leave your browser.

WHAT IT DOES

- Chat with a local AI model (Phi-4-mini, or Llama-3.2-1B on smaller GPUs) — works offline after first setup
- Import your Obsidian vault, PDFs, or Chrome bookmarks — ask questions about YOUR data
- Voice input with real-time transcription (Moonshine ASR)
- AI reads responses back to you (text-to-speech)
- "Index this tab" — save any web page to your personal knowledge base
- Right-click any page to index it from the context menu

HOW IT WORKS

All AI inference runs locally using WebGPU and WebAssembly:
- Large language model: Phi-4-mini (3.8B parameters, 2.2GB, cached after first download)
- Embeddings: bge-small-en-v1.5 (130MB, runs on your GPU)
- Voice: Moonshine-tiny ASR + Silero VAD
- Retrieval: 3-stage hybrid search (BM25 + vector + reranker)

Models download from Hugging Face on first launch (one-time, about 2.4GB). After that, everything works offline.

TRUST & TRANSPARENCY

EdgeAI includes a built-in Trust Panel so you can verify its privacy claims:
- Network log: every request EdgeAI makes, listed as it finishes. Once the models are downloaded, nothing new should appear
- Audit Log: every query, search, and import is logged locally
- Build Verification: verify the exact source code commit
- Data Inventory: see exactly what's stored and how much space it uses

The only network requests are model downloads from Hugging Face on first use. The privacy policy shows how to check the network log against Chrome's own DevTools.

EdgeAI can't see the sites you visit. It reads a page only when you ask it to index that page.

REQUIREMENTS

- Chrome 116+ with WebGPU enabled
- ~4GB available RAM (for AI model inference)
- ~3GB disk space (for cached model files)

OPEN SOURCE

EdgeAI is open source under the MIT license: github.com/kamalkalwa/EdgeAI. Every line of code is auditable. No telemetry, no analytics, no tracking.
```

## Category

```
Productivity
```

## Language

```
English
```

## Website

```
https://kamalkalwa.github.io/EdgeAI/
```

## Privacy Policy URL

```
https://kamalkalwa.github.io/EdgeAI/privacy.html
```

## Support / Homepage (Additional Fields)

```
https://github.com/kamalkalwa/EdgeAI/issues
```

---

## Privacy Practices (Chrome Web Store Form)

### Single Purpose Description

```
EdgeAI provides a fully local AI assistant that lets users chat with an AI model, search their personal documents, and use voice input — all processed on-device without sending any data to external servers.
```

### Does your extension collect or use personal data?

**No.** EdgeAI does not collect, transmit, or share any user data. All processing happens locally on the user's device.

### Data Usage Disclosures

| Data Type | Collected? | Used? | Notes |
|-----------|-----------|-------|-------|
| Personally identifiable information | No | No | No accounts or sign-up |
| Health information | No | No | |
| Financial information | No | No | |
| Authentication information | No | No | |
| Personal communications | No | No | Chat is local-only |
| Location | No | No | |
| Web history | No | No | Only pages user explicitly indexes |
| User activity | No | No | |
| Website content | No | No | |

### Are you using remote code?

**No.** All executable code — the JavaScript bundles, the ONNX Runtime WebAssembly, and web-llm's compiled model libraries (WebAssembly, bundled under `mlc/`) — ships inside the package. The only files downloaded at runtime are AI model weight files (binary tensors, not executable code) from huggingface.co, cached locally via the Cache API.

### Permission Justifications

| Permission | Justification |
|-----------|--------------|
| `offscreen` | Required to run WebGPU-based AI inference in a background document, as service workers cannot access WebGPU |
| `storage` / `unlimitedStorage` | Store user's imported documents, vector embeddings, chat history, and cached model files locally |
| `activeTab` / `scripting` | Read the text of the current tab when the user asks to index it ("Index this tab" in the popup, or "Index this page with EdgeAI" in the right-click menu). A function is injected into that tab at that moment and returns the page text. EdgeAI has no content scripts and no host permissions |
| `contextMenus` | Add "Index this page with EdgeAI" to the right-click context menu |
| `notifications` | Confirm that a page chosen from the right-click menu is being indexed, or say why it can't be read; report a bookmark import that finished after the popup closed |
| `sidePanel` | Allow EdgeAI to open in Chrome's side panel for persistent use alongside web content |
| `bookmarks` (optional) | Requested at runtime, only when the user chooses Import → Chrome Bookmarks. Bookmark titles and URLs are indexed locally; the pages are not fetched |

No host permissions: model files download from huggingface.co, which serves them with CORS headers, so the extension needs no access to any site.

### Certify no data sold to third parties

**Certified.** EdgeAI does not sell user data to third parties. No user data is transmitted to any server.

---

## SEO Keywords

```
private AI, local AI, offline AI assistant, AI chrome extension, private chatbot,
no cloud AI, on-device AI, personal AI assistant, document search, voice AI,
privacy-first AI, WebGPU AI, obsidian AI, PDF search, local LLM
```

---

## Store Assets Checklist

- [x] Icon: 128x128 PNG — `extension/public/icons/icon128.png`
- [x] Screenshots (1280x800): `store-assets/store-screenshot-1-hero.png` (chat, ready), `store-assets/store-screenshot-2-trust.png` (Privacy tab: the network log after a first run). Both render the built popup with demo data: `cd extension && npm run build:prod`, then `cd ../store-assets && node capture-screenshots.mjs`
- [ ] Optional extra screenshots: document import, voice, "Index this tab" — regenerate with `store-assets/capture-screenshots.mjs`
- [x] Promotional tile 440x280: `store-assets/promo-tile-440x280.png`
- [x] Demo GIF: `store-assets/demo-trust-proof.gif` (README; the store form takes a YouTube link only). A hand-built mockup of the popup: keep its Privacy tab in step with the real one
- [ ] Package: `cd extension && npm run build:store` → `extension/edgeai-chrome-store.zip` (commit first — the Trust Panel shows the build's git hash)
