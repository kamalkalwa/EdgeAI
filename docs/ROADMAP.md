# EdgeAI — Roadmap

> **Living document.** Updated as work progresses. For the product vision, see [vision.md](../vision.md). For business strategy, see [strategy.md](strategy.md). For revenue and outreach, see [CUSTOMER-ACQUISITION-PLAYBOOK.md](CUSTOMER-ACQUISITION-PLAYBOOK.md). For technical documentation, see [TECHNICAL.md](TECHNICAL.md).

Last updated: 2026-02-28

---

## Status Legend

- **Done** — merged, tested, working
- **In Progress** — actively being built
- **Next** — committed to building next
- **Planned** — on the roadmap, not yet started
- **Deferred** — intentionally pushed to a later phase

---

## Current State: Milestone 6 Complete — "Trust & Enterprise Readiness"

The core engine is built and functional. Local LLM chat, RAG pipeline, document indexing, voice input (VAD-gated Moonshine ASR), TTS output, guided onboarding, settings panel, and "Index this tab" all work. The Trust Panel (Milestone 6) adds live network monitoring, audit log, data inventory, build verification, and a privacy policy page. **Next up: Chrome Web Store launch (Milestone 8) then MCP Server (Milestone 7).**

---

## Phase 1: Prove It — "Trust Me"

### Milestone 1: Core Engine (Done)

| Feature | Status | Notes |
|---------|--------|-------|
| Chrome extension (MV3) with offscreen doc architecture | Done | ADR-001 implemented exactly |
| Local LLM via web-llm (Phi-3.5-mini, WebGPU) | Done | Llama-3.2-1B fallback for weak hardware |
| Streaming chat with multi-turn conversation | Done | 120s timeout, 10-turn context window |
| Embeddings (bge-small-en-v1.5, ONNX) | Done | 384-dim, ~33MB |
| Cross-encoder reranker (ms-marco-MiniLM) | Done | ~22MB, ONNX |
| 3-stage hybrid retrieval (BM25 + Vector + Rerank + RRF) | Done | ADR-005 implemented exactly |
| Semantic chunking (compromise.js + embedding similarity) | Done | ADR-004 implemented exactly |
| Vector store (Orama + IndexedDB persistence) | Done | BM25 + brute-force cosine (MVP) |
| Document metadata store (Dexie.js) | Done | Versioned schema |
| Service worker keepalive (content script ping) | Done | 25s interval |
| ONNX Runtime CSP workaround (WASM file copy) | Done | Vite plugin |
| Prompt injection mitigation (chunk sanitization) | Done | Strip injection patterns, hard cap 1200 chars |

### Milestone 2: Document Import (Done)

| Feature | Status | Notes |
|---------|--------|-------|
| Obsidian vault import (File System Access API) | Done | Recursive .md, frontmatter parsing, incremental re-index |
| PDF import (pdf.js) | Done | Page-level extraction, 50MB limit |
| Chrome bookmarks import | Done | Metadata-only + full-text modes, private address blocking |
| Backpressure indexing queue | Done | Sequential promise chain prevents OOM |
| Import progress UI | Done | Progress bar, count, success animation |

### Milestone 3: Voice Input (Done)

| Feature | Status | Notes |
|---------|--------|-------|
| Moonshine ASR (moonshine-tiny, ONNX) | Done | Replaced Whisper. Per-module dtype: encoder fp32, decoder q4/q8. ~30ms inference. |
| Silero VAD (voice activity detection) | Done | ~1MB, 512-sample frames at 16kHz, threshold 0.5 |
| VAD-gated segment transcription | Done | Each speech segment transcribed exactly once — zero flickering. 400ms silence = segment boundary. |
| Intent classification (rule-based) | Done | note/search/remind/ask/unknown |
| Mic permission handling | Done | Dedicated mic-grant page |
| Voice recording UI (button + pulse animation) | Done | States: idle → voice-loading → recording → processing → idle |
| TTS voice output (Web Speech Synthesis API) | Done | AI speaks responses back. Zero dependencies. Markdown stripping. |

### Milestone 4: Chat & Session Management (Done)

| Feature | Status | Notes |
|---------|--------|-------|
| Persistent chat sessions (chrome.storage.local) | Done | Max 20 sessions, 50 messages each |
| Session history sidebar | Done | Create, load, delete sessions |
| Model loading progress (2-step: embeddings then LLM) | Done | Real-time progress broadcasts |
| Error handling with humanized messages | Done | WebGPU, OOM, network errors |
| Retry mechanism | Done | Re-triggers initialization |
| Stealth mode (Document PiP) | Done | Not in original vision — bonus feature |

### Milestone 5: The Magic Moment (Done)

> *"Find the single moment where your product does something ChatGPT literally cannot do. Make it happen in under 5 minutes."* — vision.md

| Feature | Status | Notes |
|---------|--------|-------|
| "Index this tab" button (content script) | Done | Content script extracts 10K chars (noise-stripped), chunked, embedded, stored. requestId correlation for concurrent indexing. |
| Guided first-run onboarding | Done | On first launch: "Let's make this yours" → pick Obsidian / PDF / bookmarks → index → ask a question from your data. |
| TTS voice output (Web Speech Synthesis API) | Done | Moved to Milestone 3 (voice). Markdown stripping, zero libraries. |
| Settings panel | Done | Model size choice, storage management, clear cache. Persisted via chrome.storage.local. |

### Milestone 6: Trust & Enterprise Readiness (Done)

| Feature | Status | Notes |
|---------|--------|-------|
| Phase 0 — Modularize popup.ts | Done | 1,654 → 335 lines. 9 ES modules: state, dom, chat, sessions, documents, voice, settings, onboarding, trust |
| Trust Panel — open source verification | Done | Build-time commit hash + version via Vite define block |
| Trust Panel — live data inventory | Done | Docs, chunks, storage quota, chat sessions, model cache files |
| Trust Panel — live network monitor | Done | `webRequest` API captures all outbound requests. Category badges, filter toggle, "zero external requests" proof |
| Trust Panel — audit log | Done | Append-only log of every query, search, index, delete. Expandable entries, export JSON, 500-entry FIFO cap |
| Privacy policy page | Done | Standalone HTML page. Permissions explained. Linked from Trust Panel |

### Milestone 8: Chrome Web Store Launch (In Progress)

> Reordered ahead of MCP — distribution first, platform play second.

| Feature | Status | Notes |
|---------|--------|-------|
| Store listing copy (title, description, category) | In Progress | SEO: "local AI assistant", "private AI", "offline AI" |
| Store assets (screenshots, promo tile) | Planned | 1280x800 screenshots, 440x280 tile |
| Production build hardening | Planned | Strip console.log, `build:store` script, manifest review |
| Privacy practices disclosure | Planned | Chrome Web Store privacy form |
| Demo GIF (network monitor showing zero outbound calls) | Planned | The trust proof |
| Landing page | Planned | GitHub Pages — hero, demo, enterprise section |

### Milestone 7: MCP Server (Planned — post-launch)

> *"Expose an MCP server from day 1... you stop being an AI product and become the personal context layer that makes all AI products smarter."* — vision.md

| Feature | Status | Notes |
|---------|--------|-------|
| Native messaging bridge (extension side) | Planned | `chrome.runtime.connectNative` + message forwarding to offscreen doc |
| Go binary (`edgeai-mcp`) | Planned | MCP stdio server. ~3MB. macOS + Windows. `edgeai-mcp install` registers native host |
| MCP tools: `edgeai_search`, `edgeai_list_documents`, `edgeai_get_document` | Planned | Semantic search + doc browsing from Claude Desktop, Cursor, etc. |
| MCP status UI in popup | Planned | Connection state + call count |

---

## Phase 2: Scale It — "Need Me"

### Milestone 9: Deeper Connectors (Planned)

| Feature | Status | Notes |
|---------|--------|-------|
| Notion import (OAuth + block flattener) | Planned | ADR-006: medium effort, 3 req/sec rate limit |
| Google Drive import (chrome.identity OAuth) | Planned | ADR-006: medium effort |
| Plain text / Markdown drag-and-drop | Planned | ADR-006: trivial |
| Email / Gmail import | Deferred | High effort, Phase 2 |

### Milestone 10: Encrypted Sync (Planned)

| Feature | Status | Notes |
|---------|--------|-------|
| Automerge CRDT for document sync | Planned | ADR-008 |
| libsodium.js encryption (XChaCha20-Poly1305) | Planned | Argon2id key derivation from passphrase |
| Cloudflare Worker relay (encrypted mailbox) | Planned | Free tier: 100K req/day. ~30 lines of code. |
| Multi-device index rebuild from synced docs | Planned | Sync documents, rebuild vector index locally |

### Milestone 11: Enterprise Features (Planned)

| Feature | Status | Notes |
|---------|--------|-------|
| MDM / managed Chrome policy deployment | Planned | |
| Admin dashboard (usage analytics, no content) | Planned | |
| Pro tier ($9/mo) | Planned | Sync + larger models + cloud escalation |
| Cloud escalation (opt-in, user's own API key) | Planned | Router: "can I handle this locally?" |

### Milestone 12: Side Panel Mode (Planned)

| Feature | Status | Notes |
|---------|--------|-------|
| Chrome side panel API integration | Planned | Persistent alongside page content, better for "ask about this page" |
| Adaptive layout (popup vs. side panel vs. stealth) | Planned | Same UI, different containers |

---

## Phase 3: Own the Ecosystem — "Build on Me"

| Feature | Status | Notes |
|---------|--------|-------|
| Developer SDK | Deferred | Local AI runtime with user context access (with permission) |
| Plugin marketplace | Deferred | Third-party apps on local AI + context |
| Safari extension | Deferred | Same codebase, different packaging |
| PWA for mobile | Deferred | Voice-first interface, smaller models (1B-2B) |
| Native mobile app | Deferred | Background transcription, widgets |
| Vision model (moondream2 / Phi-3-vision) | Deferred | Image/screenshot Q&A locally |

---

## Technical Debt & Known Limitations

| Item | Severity | Notes |
|------|----------|-------|
| Vector search is brute-force cosine | Low (MVP) | Scales to ~50K chunks. Migrate to PGlite+pgvector at scale. |
| No WASM CPU fallback (wllama) | Medium | Vision calls for Llama-3.2-1B GGUF fallback for no-WebGPU devices |
| Single-threaded ONNX (numThreads: 1) | Low | CSP constraint. Acceptable for MVP model sizes. |
| No model update lifecycle | Medium | Users can't upgrade to Phi-4 when it ships. Design versioned model management. |
| Popup closes on click-away | Medium | Side panel would be persistent. Current UX interrupts flow. |
| No data export/backup | Medium | Users can't take their data with them. Trust issue. |
| Voice is English-only | Low | Moonshine-tiny (English-only). Multilingual model not yet available. |
| No ambient/contextual surfacing | Low | Phase 2+. Zero-action context before user asks. |

---

## Architecture Decisions (Reference)

All ADRs live in [vision.md](../vision.md) under "Architecture Decision Record."

| ADR | Decision | Status |
|-----|----------|--------|
| ADR-001 | Offscreen document for all inference | Implemented |
| ADR-002 | web-llm (LLM) + transformers.js (embeddings, ASR, reranker) | Implemented |
| ADR-003 | Orama for MVP, PGlite+pgvector for production | Orama implemented |
| ADR-004 | Semantic chunking (compromise + embedding similarity) | Implemented |
| ADR-005 | 3-stage hybrid retrieval with RRF fusion | Implemented |
| ADR-006 | Obsidian, PDF, Bookmarks first; Notion, Drive second | First 3 implemented |
| ADR-007 | MCP client first, native messaging host server Phase 2 | Not started |
| ADR-008 | Automerge + libsodium.js + Cloudflare Worker relay | Not started |
| ADR-009 | transformers.js Moonshine + Web Speech Synthesis + Silero VAD | ASR (Moonshine) + VAD + TTS all implemented |
| ADR-010 | Full stack reference | Reference only |

---

## Priority Stack (What to Build Next)

Ordered by impact on the vision's core thesis: *"Give away the AI for free. Charge for the personal context engine that makes it irreplaceable."*

```
1. ✅ "Index this tab" — DONE (Milestone 5)
2. ✅ Guided onboarding — DONE (Milestone 5)
3. ✅ TTS output — DONE (Milestone 3)
4. ✅ Settings panel — DONE (Milestone 5)
5. ✅ Trust Panel — DONE (Milestone 6)
6. Chrome Web Store listing — distribution first (Milestone 8) ← NEXT
7. MCP server — the platform play, post-launch (Milestone 7)
8. Side panel mode — persistent UX for page context (Milestone 12)
9. Voice notes as first-class data — "Note that..." stores directly
10. Notion + Google Drive connectors — more data sources (Milestone 9)
```

---

## Metrics to Track (When Launched)

| Metric | Target | Why |
|--------|--------|-----|
| Time to first personal answer | < 3 minutes | The "magic moment" — retention depends on this |
| Documents indexed per user (day 7) | > 10 | Measures context depth = switching cost |
| Daily active usage | > 40% of installers | Product-market fit signal |
| Queries using RAG vs. generic | > 60% RAG | Proves the context engine is the value |
| Chrome Web Store rating | > 4.5 stars | Trust signal for new users |
| Waitlist signups | > 200 | Signal to invest in Pro tier |
| Enterprise pilot conversations | > 1 | Signal to build enterprise features |
