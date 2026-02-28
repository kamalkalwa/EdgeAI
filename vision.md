# EdgeAI — Vision

> **The "why" — principles, architecture, and product identity.** This document is the north star. It changes rarely. When it does, it means the thesis changed.
>
> For business strategy and competitive analysis: see [docs/strategy.md](docs/strategy.md).
> For milestone tracking, current status, and execution: see [docs/ROADMAP.md](docs/ROADMAP.md).
> For revenue, outreach templates, and pricing: see [docs/CUSTOMER-ACQUISITION-PLAYBOOK.md](docs/CUSTOMER-ACQUISITION-PLAYBOOK.md).
> For complete technical documentation (architecture, data flows, algorithms): see [docs/TECHNICAL.md](docs/TECHNICAL.md).

---

## The Idea

A personal AI that runs entirely in your browser — no server calls, no API keys, no accounts, no data leaving your device. Open a tab, ask anything: translations, general knowledge, coding, research. It works offline. It's free. And over time, it knows you better than any cloud product ever could.

> **"Your AI. Your device. Your data. No one else's."**

---

## The Core Insight

The model is a commodity. Everyone will ship local LLMs soon — Google, Apple, Microsoft. The real moat is not the model. It's the personal context layer: a knowledge graph that has been learning your writing style, your codebase patterns, your notes, your workflow — encrypted on your device, never seen by anyone else.

**Give away the AI for free. Charge for the personal context engine that makes it irreplaceable.**

---

## What Makes It Work Now

- **WebGPU / WASM** — browsers can run ML models using GPU acceleration directly
- **Small language models (2B–7B params)** — Phi-3, Gemma 2B, Mistral 7B run on consumer hardware
- **Libraries** — `web-llm`, `transformers.js`, `llama.cpp` (WASM) already enable in-browser inference
- **Local vector stores** — in-browser vector DBs + IndexedDB for persistent personal indexing

---

## The Architecture

```
┌─────────────────────────────────────┐
│           BROWSER TAB               │
│                                     │
│  ┌───────────┐   ┌──────────────┐  │
│  │  Local SLM │   │ Local Vector │  │
│  │  (2-7B)    │   │ Store        │  │
│  │  WebGPU /  │   │ (your docs,  │  │
│  │  WASM      │   │  history,    │  │
│  └─────┬─────┘   │  context)    │  │
│        │         └──────┬───────┘  │
│        └───────┬────────┘          │
│                │                    │
│        ┌───────▼────────┐          │
│        │    Router /    │          │
│        │  Orchestrator  │          │
│        │ "Can I handle  │          │
│        │  this locally?"│          │
│        └───────┬────────┘          │
│           YES/ │ \NO               │
│          ┌────┘   └────┐           │
│          ▼             ▼           │
│    Local Answer   Cloud Escalation │
│    (instant,      (opt-in,         │
│     private)       better quality) │
└─────────────────────────────────────┘
```

**Default:** everything runs locally — fast, private, free.
**Escalation:** if the user needs a harder answer, they opt-in to a cloud API. They choose when.

---

## The Three Layers (One Product)

```
┌─────────────────────────────────────────────┐
│  LAYER 1: PRIVACY ENGINE                    │
│  Local inference, encrypted storage,        │
│  zero data leaves device                    │
│  "The foundation everything sits on"        │
├─────────────────────────────────────────────┤
│  LAYER 2: PERSONAL CONTEXT ENGINE           │
│  Indexes your files, browsing, notes, code  │
│  Answers from YOUR context first            │
│  "The thing that makes it useful"           │
├─────────────────────────────────────────────┤
│  LAYER 3: PLUGIN / EXTENSION API            │
│  Developers build apps on your local        │
│  AI + context runtime                       │
│  "The thing that makes it a moat"           │
└─────────────────────────────────────────────┘
```

Privacy is the foundation. Productivity is the value. Platform is the business model.

---

## The Phases (Not Verticals — A Sequence)

```
PHASE 1              PHASE 2              PHASE 3
PRIVACY TOOL    ──►  PRODUCTIVITY TOOL ──► PLATFORM

"Trust me"           "Need me"            "Build on me"

Get users            Keep users           Lock-in ecosystem
via trust            via value            via developers

Months 0–8           Months 6–18          Months 14–30+
```

Each phase earns the right to the next. Phase 1 users become Phase 2 advocates ("I use this at home — we need it at work"). Phase 2 enterprises demand Phase 3 integrations.

> **For detailed milestone tracking and current phase status, see [docs/ROADMAP.md](docs/ROADMAP.md).**

---

## What It Cannot Solve (Be Honest)

- Deep research requiring multi-step reasoning chains
- Coding an entire feature across multiple files
- Complex math or formal logic
- Real-time world knowledge (news, sports, stock prices)
- High-level creative writing

**Don't fight these battles.** Let cloud AI own the hard 20%. Own the 80% of queries that are simple, fast, private — and build the personal context that makes the 80% increasingly powerful over time.

---

## Why Users Won't Leave

It's not the AI. It's the personal data layer.

Once the product knows your writing style, your codebase patterns, your frequently asked questions, your notes and bookmarks, your workflow habits — and all of that lives only on your device — you cannot switch. No cloud product has this context. No competitor can import it.

The local data is the moat, not the local model.

---

## The One-Line Strategy

> Give away the AI for free. Charge for the personal context engine that makes it irreplaceable.

---

---

# Voice-First: How Behavior is Changing and What It Means

---

## The Shift That Changes Everything

People are using phones for more of their computing, and on phones the dominant instinct is to speak, not type. This is not a future trend — it is already the present.

**The numbers:**
- [71% of consumers prefer voice over typing when possible](https://marketingltb.com/blog/statistics/voice-search-statistics/)
- [Voice is 30% faster than typing on average](https://www.demandsage.com/voice-search-statistics/)
- [52% of people use voice search daily or almost daily](https://www.yaguara.co/voice-search-statistics/)
- [8.4 billion voice-enabled devices in use worldwide](https://seoprofy.com/blog/voice-search-statistics/)
- [77% of 18–34 year olds use voice search on smartphones](https://searchendurance.com/voice-search-statistics/) — the cohort whose habits define the next decade
- [70% of voice queries happen in natural conversational language](https://www.gwi.com/blog/voice-search-trends) — not commands, not keywords, actual sentences

---

## What This Means for the Product

The current vision is built around a chat interface — you open a tab or extension, type a question, read an answer. That is the right starting point but the wrong destination.

If the interaction model is shifting toward voice, then the product that wins is not the one with the best chat UI. It is the one that is closest to zero friction: always available, activated by voice, responds in your ear, remembers what you said.

The north star is not "ChatGPT in the browser." It is "a second brain that listens, remembers, and answers — privately, on your device, always there."

---

## Why Voice + Local = An Unbreakable Moat

Voice data is the most sensitive data type in existence.

When you speak, you reveal:
- Medical questions you would never type into a search bar
- Business strategy conversations you would never paste into ChatGPT
- Emotional state, relationships, personal context
- The names of people, places, and projects that define your world

**No one will trust a cloud company to store their voice history.** The mental model people have for voice assistants — "it heard that but forgot it immediately" — means the moment you try to build a cloud-backed voice memory product, you hit a wall of privacy anxiety that is nearly impossible to overcome.

But a local product that stores your voice history encrypted on your own device, never sends audio anywhere, and makes that history searchable and useful? That is a product people will actually use for sensitive things. And the more they use it, the deeper the moat becomes.

After 6 months of indexed voice notes, meeting summaries, and spoken queries, the switching cost is not just inconvenient — it is unthinkable.

---

## The "Least Action" Design Principle

The user behavior shift is not just about voice — it is about minimizing the number of steps between a thought and an answer. Every extra tap, every required login, every context switch destroys the experience.

**Design for this hierarchy:**

```
0 actions:  Ambient — surfaces relevant context before you ask
1 action:   Tap to speak — no typing, no navigation, no setup
2 actions:  Tap, type short query — for precision follow-ups
3+ actions: The product has failed the user for this moment
```

The product has to feel like a thought completing itself, not a tool you pick up and use.

---

## How Voice Changes the Architecture

```
┌──────────────────────────────────────────────────────┐
│                  USER INTERFACE                      │
│                                                      │
│  [Tap to speak] → Mic → Local ASR → Text transcript │
│       ↑                    ↓                         │
│  Audio played ←  TTS  ← LLM response                │
│                            ↑                         │
│              ┌─────────────┴──────────────┐          │
│              │   Local Context Engine     │          │
│              │   (your voice notes,       │          │
│              │    past queries,           │          │
│              │    indexed documents)      │          │
│              └────────────────────────────┘          │
└──────────────────────────────────────────────────────┘
```

Every layer stays local:
- **ASR (speech → text):** Moonshine-tiny ONNX via transformers.js — fully offline, no audio leaves the device
- **LLM (text → answer):** `web-llm` via WebGPU as before
- **TTS (answer → speech):** Web Speech Synthesis API, built into the browser, no server needed
- **Memory:** voice transcripts chunked, embedded, and stored in IndexedDB alongside documents

---

## New Capabilities Voice Unlocks

### Voice Notes as First-Class Data
"Note that the client wants the redesign delivered by Friday."

The transcript is stored locally, embedded, and indexed. Two weeks later: "What did I say about the client deadline?" — it answers correctly. No app-switching, no typing, no forgetting.

### Passive Meeting Intelligence
Opt-in local transcription of meetings. The audio never leaves the device. Summarized locally. Searchable locally. The product becomes an assistant that was in every meeting you had — and remembers all of it.

### Contextual Surfacing
You walk into a meeting: the product recognizes the calendar event and surfaces relevant notes, past conversations, and documents — before you ask. Zero actions.

### Hands-Free Work
Driving, cooking, walking. The 40% of the day when your hands are occupied but your mind is working. This is currently completely unserved by AI products that require typing.

---

## Revised North Star

The product vision evolves from:

> "A chat assistant that runs locally in your browser"

To:

> "A private ambient intelligence that learns from everything you say, read, and write — and is always one tap away, on any device, with no account, no server, and no one else listening."

The interface is not a chat box. It is a tap. The answer comes back in your ear or on the screen. The memory compounds silently. You stop thinking of it as a product you use and start thinking of it as a layer of your cognition.

That is the product that is impossible to leave.

---

---

# Product Design Principles (Blind Spots to Design For)

These are the things most founding teams miss until they hit them. Design for these from day one.

---

## 1. The Cold Start Problem — Day 1 Has No Value

The product is only powerful after the user has built up context. But on day 1, there are no indexed documents, no voice notes, no conversation history. The user opens it, asks a question, gets a generic answer a 3B model would give anyone. They close it and never return.

**This is the most common reason personal AI products fail to retain users.**

The fix is import-first onboarding. On first launch, before anything else:
- Connect Google Drive, Notion, Obsidian vault, or drop a folder
- Import Chrome bookmarks and reading history (opt-in)
- Import from common note-taking apps (Evernote, Bear, Apple Notes export)

The goal: make the product answer a question from the user's own data within the first 3 minutes. That is the moment of retention. Everything before that is a loading screen.

---

## 2. Context Contamination and Selective Forgetting

If you index everything, eventually the AI will surface something the user did not mean to expose — on a screen share, in a meeting, on a shared device. This is a trust-destroying event.

You need:
- **Selective indexing:** explicit user control over what is indexed and what is not. No surprise indexing of sensitive folders.
- **Selective forgetting:** the ability to delete any indexed item and have that deletion cascade through the vector store immediately
- **A "private mode":** temporarily suspend indexing and context retrieval without deleting anything
- **Audit log:** a locally stored, human-readable log of everything the model has accessed — so the user always knows what it knows

The product that gets this wrong will generate a "my AI revealed my salary to my colleague" story on Hacker News. Design for this before it ships.

---

## 3. The Ambient Listening Liability

The voice section describes passive ambient listening as a future capability. This needs to be approached with extreme caution.

Legal exposure:
- **Wiretapping laws** (US: ECPA, state laws in CA, IL, WA, FL require all-party consent for recording)
- **GDPR Article 9** — voice data can reveal health, ethnicity, emotional state — special category data
- **Children's privacy** — COPPA in the US, Article 8 GDPR in EU — if a child's voice is captured, even accidentally, the liability is severe

Ethical exposure:
- Users will say things near their devices they do not intend as input
- "Ambient" + "AI" + "stored locally forever" = a scenario that requires explicit, granular, revocable consent for every session — not a one-time toggle

**Recommendation:** Do not ship ambient listening in Phase 1 or 2. Ship explicit tap-to-record and always-on-screen meeting transcription first. Build the trust. Earn the ambient permission later.

---

## 4. Hardware Fragmentation Is Worse Than You Think

WebGPU behavior varies significantly across GPU vendors and OS combinations:
- NVIDIA on Windows: generally good
- Apple Silicon (M1/M2/M3): excellent — WebGPU is mature on Metal
- Intel integrated graphics: frequent driver bugs, limited memory bandwidth
- AMD on Linux: inconsistent
- Older laptops without dedicated GPUs: falls back to WASM/CPU — 5–10x slower

A model that runs at 20 tokens/second on an M2 MacBook may run at 2 tokens/second on a 2019 Intel laptop. At 2 tokens/second, the product feels broken.

**Mitigation strategy:**
- Detect GPU capability at install time — show the user their expected performance tier
- Match model size to detected hardware automatically (Gemma 2B on weak hardware, Phi-3 Mini on good hardware)
- WASM CPU fallback must be a first-class experience, not an afterthought
- Benchmark on the lowest hardware tier you want to support before marketing

---

## 5. The Model Update Lifecycle

When Phi-4 ships, when Gemma 3B releases, when a better model becomes available — how does the user upgrade? The context vector store is model-agnostic (vectors are just numbers from your embedding model). But the LLM inference engine and its quantized model weights need to be replaced.

Design the update experience from day 1:
- Models are versioned assets, downloaded on demand
- User can choose to upgrade or stay on the current model
- Model update does not touch the context store
- Old model weights are deleted from disk after confirmation to free space

If you do not design this, you will have users running a stale model from 2025 in 2027 because they do not know how to update it.

---

---

# Architecture Decision Record (ADR)

Every technical decision that matters, evaluated and decided. This is the build specification.

> **For implementation status of each ADR, see [docs/ROADMAP.md](docs/ROADMAP.md).**

---

## ADR-001: Extension Architecture — Where Does the Model Run?

**Problem:** Chrome Manifest V3 service workers terminate after 30 seconds of inactivity. They also have no access to WebGPU or the DOM. Running a 2–4GB LLM in a service worker is architecturally impossible.

**Decision: Run all inference in an Offscreen Document.**

```
[Popup UI / Content Script]
         │ chrome.runtime.sendMessage
         ▼
[Service Worker (MV3)]          ← lightweight router only
         │ chrome.runtime.sendMessage
         ▼
[Offscreen Document]            ← full DOM, WebGPU access
  ├── web-llm (WebGPU)          ← generative LLM
  ├── transformers.js (WebGPU)  ← embeddings, Moonshine ASR, re-ranker
  └── PGlite / hnswlib          ← vector store (IndexedDB backed)
```

**Keeping the Service Worker alive:** A content script injected into any active tab sends a keepalive ping every 25 seconds. The service worker handles the ping and resets its idle timer. This prevents the 30-second termination. On restart (if it does die), the offscreen document re-attaches and model state is restored from Cache API.

**Offscreen document lifetime:** Use reason `AUDIO_PLAYBACK` or `USER_MEDIA` to maintain persistence during voice sessions. For text-only use, keep it alive via the SW keepalive loop.

**Constraint:** Only one offscreen document can exist per extension at a time. All inference (LLM, embeddings, ASR) must run in this single document, multiplexed via message passing.

---

## ADR-002: LLM Runtime Selection

**Evaluated:** web-llm, transformers.js, wllama (llama.cpp WASM)

**Decisions:**

| Use Case | Runtime | Model | Size | Reason |
|---|---|---|---|---|
| Primary generative LLM | **web-llm** | Phi-3.5-mini-q4 or Llama-3.2-3B-q4 | ~2.3GB | Best WebGPU performance (35–60 tok/s on M2). MLC team maintains Chrome extension example. |
| Embeddings | **transformers.js** | bge-small-en-v1.5 | ~33MB | 5,000+ ONNX models available on HF. 3–6ms/sentence on CPU. |
| ASR (voice → text) | **transformers.js** | moonshine-tiny (ONNX) | ~60MB | ~30ms inference on desktop. Per-module dtype: encoder fp32, decoder q4/q8. VAD-gated segment transcription. |
| Re-ranking | **transformers.js** | ms-marco-MiniLM-L-6-v2 int8 | ~22MB | 200–500ms for 10 candidates. Pre-exported ONNX at huggingface.co/Xenova. |
| CPU fallback (weak hardware) | **wllama** | Llama-3.2-1B-q4 GGUF | ~0.7GB | Pure WASM, no WebGPU required. 8–15 tok/s — slow but functional. |
| Vision / screenshots (Phase 2) | **transformers.js** | moondream2 or Phi-3-vision | ~2.5GB | Enables image/screenshot Q&A locally. |

**Rejected:** llama.cpp WASM directly — requires COOP/COEP headers for multi-threading, complex setup, no GPU. wllama is the cleaner WASM path but only as fallback.

**Model weights storage:** Cache API (not IndexedDB) — faster for large binary files, survives service worker restarts. web-llm uses Cache API natively. Initial download: 2–4GB, 5–15 minutes on average broadband. Subsequent loads: 3–8 seconds.

**Critical constraint on iOS Safari:** No SharedArrayBuffer (removed in Safari 15.2, never restored). Multi-threaded WASM is impossible on iOS. Use transformers.js + WebGPU only on iOS. Moonshine-tiny ONNX runs at ~1–2x realtime on A15+ via WebGPU. No wllama fallback on iOS — offer cloud escalation instead.

---

## ADR-003: Vector Store

**Evaluated:** PGlite+pgvector, hnswlib-wasm, Orama, Vectra

**Rejected immediately:** Vectra — brute-force only, unacceptable at >20K vectors.

**Decision matrix:**

| | PGlite+pgvector | hnswlib-wasm | Orama |
|---|---|---|---|
| HNSW | Yes (native) | Yes (best WASM) | Yes (TypeScript) |
| 10K query latency | 5–20ms | 1–3ms | 5–15ms |
| 100K query latency | 20–50ms | 3–8ms | 30–80ms |
| Hybrid BM25+vector | Yes (SQL) | No (manual) | Yes (built-in) |
| IndexedDB persistence | Native | Manual serialization | Via JSON export |
| Cold start | 2–5s (WASM init) | Fast | Instant |
| Developer experience | SQL (familiar) | Low-level | Best |
| Bundle size | ~30MB | ~5MB | ~500KB |

**Decision: Orama for MVP, PGlite+pgvector for production at scale.**

- **Orama** is the fastest path to a working hybrid search pipeline. Built-in BM25 + HNSW vector search + RRF fusion. ~500KB bundle. TypeScript-native. Use this to ship fast.
- **PGlite+pgvector** becomes worth the complexity at >50K documents or when you need full SQL power (complex metadata filters, time-range queries, joins). Migrate to it in Phase 2.

**Vector dimensions:** Use 384-dim embeddings (bge-small-en-v1.5) not 1536-dim. Storage: 100K chunks x 384 x 4 bytes = ~150MB. This fits comfortably in IndexedDB.

---

## ADR-004: Chunking Strategy

**Decision: Semantic chunking using sentence boundaries + embedding similarity.**

Fixed-size chunking (512 tokens, fixed) is rejected. It breaks semantic units arbitrarily, splits tables, and destroys document structure.

**Implementation (without LangChain dependency):**

```
1. Parse document → extract text (pdf.js / remark / compromise)
2. Split to sentences using compromise.js (handles abbreviations, etc.)
3. Group sentences into windows of 3
4. Embed each window with bge-small-en-v1.5 (batched, ~3ms/sentence)
5. Compute cosine similarity between adjacent windows
6. Split where similarity < 0.6 OR chunk > 1,500 characters
7. Apply 15% overlap: last 2 sentences of chunk N → start of chunk N+1
8. Store chunk + metadata: {source, page, section_heading, created_at, char_offset}
```

**Libraries:** `compromise` (~250KB, browser-safe) for sentence splitting. `transformers.js` for embeddings (already loaded). No additional dependencies required.

**Why metadata matters:** The metadata enables citations ("from your notes, March 12, section 3") and time-based filtering ("what did I write last week?"). Store it with every chunk from day one — retrofitting it is painful.

---

## ADR-005: Retrieval Pipeline

**Decision: Three-stage hybrid retrieval with RRF fusion.**

Naive vector-only retrieval fails on exact-match queries ("what is the API endpoint?"). BM25-only fails on semantic queries ("what was my approach to the auth problem?"). Hybrid wins on both.

```
QUERY: "what did I decide about the database schema?"
         │
         ├── Stage 1: BM25 full-text search (Orama)
         │   → top 20 by keyword match
         │
         ├── Stage 2: ANN vector search (Orama HNSW)
         │   → top 20 by semantic similarity
         │
         ▼
     RRF Fusion (k=60)
     → unified ranked list, top 20 candidates
         │
         ▼
     Stage 3: Cross-encoder re-ranking
     → ms-marco-MiniLM-L-6-v2 scores each of top 10
     → re-ranked top 5 by true relevance (~300ms)
         │
         ▼
     Context injection into LLM prompt
     → "From your notes (design-doc.md, Feb 14): [chunk text]"
         │
         ▼
     LLM generates answer with attribution
```

**RRF implementation (25 lines, no library):**
```typescript
function rrf(lists: Array<{id: string}[]>, k = 60): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      scores.set(item.id, (scores.get(item.id) || 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}
```

**Context window management:** Phi-3.5-mini has an 128K context window (unusually large for a 3.8B model). This significantly reduces the need for map-reduce on long documents. Still implement sliding window summarization for multi-turn conversation history to keep prompts tight.

---

## ADR-006: Import Connectors

**Priority order (by impact x ease):**

| Connector | Library / API | Auth needed | Effort | Priority |
|---|---|---|---|---|
| Local folder (Obsidian, any) | File System Access API — `showDirectoryPicker()` | None | Low | **Build first** |
| PDF | pdf.js in Web Worker | None | Low | **Build first** |
| Chrome bookmarks | `chrome.bookmarks` API (built-in) | None | Low | **Build first** |
| Notion | `@notionhq/client` + block flattener | OAuth | Medium | Build second |
| Google Drive | `chrome.identity` OAuth + Drive REST API | OAuth | Medium | Build second |
| Plain text / Markdown | Native file reading | None | Trivial | **Build first** |
| Email (Gmail) | Gmail API | OAuth | High | Phase 2 |

**Obsidian connector is the easiest and most impactful.** No API, no auth, no rate limits. User clicks "Open Vault", grants directory access via `showDirectoryPicker()`, extension reads all `.md` files recursively. The File System Access API persists the permission — subsequent loads don't re-prompt. Parse markdown with `remark` or plain text stripping.

```typescript
const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
// Store handle in IndexedDB for future access
await saveHandleToIDB(dirHandle);

// Recursively read .md files
async function* readMarkdownFiles(handle: FileSystemDirectoryHandle) {
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file' && name.endsWith('.md')) {
      const file = await entry.getFile();
      yield { name, content: await file.text() };
    } else if (entry.kind === 'directory') {
      yield* readMarkdownFiles(entry as FileSystemDirectoryHandle);
    }
  }
}
```

**Notion block flattener:** The Notion API returns nested block JSON. You must recursively fetch all child blocks. Build a utility that flattens the block tree to plain text, preserving heading hierarchy. Rate limit: 3 req/sec — build with exponential backoff.

---

## ADR-007: MCP Server Architecture

**Problem:** A Chrome extension cannot bind to TCP ports or act as a WebSocket server. Direct MCP serving from an extension is architecturally impossible.

**Decision: Ship MCP client first, defer MCP server to native companion.**

**Phase 1 (no native install required):** The extension acts as an MCP client — it can connect to external MCP servers and pull context from them (e.g., a user's self-hosted knowledge base). This is useful but not the platform play.

**Phase 2 (opt-in native companion):** A small Go binary (~3MB, zero runtime dependencies) installed as a Chrome native messaging host. It:
1. Binds `localhost:3773` for MCP over HTTP+SSE
2. Communicates with the extension via `chrome.runtime.connectNative` (stdin/stdout)
3. Exposes tools: `search_personal_context(query)`, `list_documents()`, `get_document(id)`, `add_voice_note(text)`

Claude Desktop, Cursor, and any MCP-compatible client can then be configured to query `localhost:3773` and get the user's personal context in any AI conversation.

**Distribution:** The native host binary is distributed alongside the extension installer. On Windows: registry entry. On macOS/Linux: manifest JSON in a well-known path. The extension registers the native host in its manifest.

**Why this matters:** Users who prefer Claude or Cursor for their primary AI interface can still have your personal context layer without using your chat UI. You become infrastructure, not a walled garden.

---

## ADR-008: Encrypted Sync Architecture

**Decision: Automerge + libsodium.js + Cloudflare Worker relay.**

**What to sync:** Document content and metadata only. NOT the vector index. Each device rebuilds its own index from synced documents.

**Why not sync the index:** The HNSW index binary is large (hundreds of MB), format-dependent, and not CRDT-mergeable. Syncing document text and rebuilding the index locally is simpler and more robust.

**Encryption:**
```
User passphrase
    │
    ▼ Argon2id (libsodium)
Master Key (256-bit, never leaves device)
    │
    ├── Derives Document Encryption Key via HKDF
    └── Derives Sync Authentication Key via HKDF

Each document encrypted with: XChaCha20-Poly1305
Nonce: random 192-bit, prepended to ciphertext
```

**CRDT layer:** Automerge `automerge-repo` with `@automerge/automerge-repo-storage-indexeddb`. Each document is an Automerge document. Changes are encoded as compact binary diffs (Automerge sync protocol). The encrypted binary diff is what travels over the wire.

**Relay:** A Cloudflare Worker (free tier: 100K requests/day). It receives encrypted binary blobs keyed by device pair ID. It cannot decrypt anything. Acts as a mailbox: device A deposits, device B retrieves. Total Cloudflare Worker code: ~30 lines. Cost: free for most users, pennies at scale.

**Key recovery:** If the user forgets their passphrase, data is unrecoverable (by design). Offer export-to-encrypted-file as a backup mechanism. This is a feature, not a bug — it is provably zero-knowledge.

---

## ADR-009: Voice Pipeline

**Decision: transformers.js Moonshine ASR + Web Speech Synthesis API + Silero VAD**

```
Microphone (getUserMedia)
    │
    ▼
Silero VAD (ONNX, ~1MB)          ← detect speech, skip silence
    │ speech detected
    ▼
moonshine-tiny (ONNX)            ← ~30ms inference on desktop
    │ transcript
    ▼
Intent classification             ← "note that X" vs "ask X" vs "search X"
    │
    ├── "note that..." → embed + store in IndexedDB
    ├── "search / ask..." → retrieval pipeline → LLM → response
    └── "remind me..." → chrome.alarms API
            │
            ▼
        LLM response (web-llm)
            │
            ▼
        Web Speech Synthesis API  ← text-to-speech, built into browser
            │
            ▼
        Audio output
```

**Silero VAD** (https://github.com/snakers4/silero-vad) — ONNX model, ~1MB, ~1ms inference. Detects voice activity to gate Moonshine transcription. Each speech segment is transcribed exactly once — zero flickering, zero re-transcription.

**iOS Safari constraints:** No SharedArrayBuffer → multi-threaded WASM unavailable → Moonshine ONNX + WebGPU only. Latency: ~1–2x realtime on A15+. Acceptable for voice notes. Not acceptable for real-time meeting transcription on iOS.

**Voice note intent detection:** A simple rule-based classifier before calling the LLM: if transcript starts with "note that", "remember", "add note" → store directly without LLM call. This makes voice notes instant (~0ms) even if the LLM is not loaded.

---

## ADR-010: Full Stack Reference

```
LAYER                   TECHNOLOGY              SIZE        NOTE
─────────────────────────────────────────────────────────────────────
Generative LLM          web-llm (WebGPU)        ~2.3GB      Cache API
Embeddings              transformers.js ONNX    ~33MB       bge-small-en-v1.5
ASR                     transformers.js ONNX    ~60MB       moonshine-tiny
Re-ranker               transformers.js ONNX    ~22MB       ms-marco MiniLM int8
Voice activity          Silero VAD ONNX         ~1MB        silence detection
CPU LLM fallback        wllama                  ~0.7GB      Llama-3.2-1B q4 GGUF
─────────────────────────────────────────────────────────────────────
Vector store (MVP)      Orama                   ~500KB      BM25+HNSW hybrid
Vector store (prod)     PGlite+pgvector         ~30MB WASM  SQL + HNSW
Document store          IndexedDB (Dexie.js)    —           chunk metadata
Model weights           Cache API               2-4GB       persists across restarts
─────────────────────────────────────────────────────────────────────
Chunking                compromise + custom     ~250KB      semantic splitting
RAG fusion              Custom RRF              ~25 lines   no library
CRDT sync               Automerge-repo          ~200KB WASM document sync
Encryption              libsodium.js            ~300KB WASM XChaCha20-Poly1305
─────────────────────────────────────────────────────────────────────
PDF parsing             pdf.js                  ~1.5MB      in Web Worker
Markdown parsing        remark                  ~150KB      Obsidian connector
Notion API              @notionhq/client        ~50KB       adapt for browser
File access             File System Access API  built-in    local folder connector
─────────────────────────────────────────────────────────────────────
TTS                     Web Speech Synthesis    built-in    no library
Chrome bookmarks        chrome.bookmarks API    built-in    no library
Keep-alive              content script ping     ~5 lines    every 25 seconds
─────────────────────────────────────────────────────────────────────
TOTAL RUNTIME OVERHEAD  (excl. model weights)  ~3-5MB      —
```
