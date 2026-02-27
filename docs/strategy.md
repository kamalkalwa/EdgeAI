# EdgeAI — Strategy

> **The "how" — business model, competitive positioning, and strategic decisions.** Reference document. Update when strategic decisions change, not every sprint.
>
> For the product vision and principles, see [vision.md](../vision.md).
> For milestone tracking and execution status, see [ROADMAP.md](ROADMAP.md).
> For revenue, outreach templates, and pricing, see [CUSTOMER-ACQUISITION-PLAYBOOK.md](CUSTOMER-ACQUISITION-PLAYBOOK.md).
> For complete technical documentation, see [TECHNICAL.md](TECHNICAL.md).

---

## The Money Map

> **Detailed pricing tiers, validation methodology, and the Obsidian pricing model live in [CUSTOMER-ACQUISITION-PLAYBOOK.md](CUSTOMER-ACQUISITION-PLAYBOOK.md).**

| Phase | Who Pays | Model | Price |
|---|---|---|---|
| Phase 1 | Individuals | Freemium → Pro | $8–15/mo or $99/yr |
| Phase 2 | Companies | Per-seat license | $15–30/seat/mo |
| Phase 3 | Developers | Rev share + API fees | 20–30% cut |

---

## Technical Bets (CTO View)

| Bet | Decision | Risk | Mitigation |
|---|---|---|---|
| Model runtime | `web-llm` (WebGPU) + WASM fallback | WebGPU not universal yet | Progressive enhancement; WebGPU standard within 12 months |
| Starting model | Phi-3 Mini (3.8B) or Gemma 2B | Quality gap vs. frontier models | Own the context layer, not the model — model is replaceable |
| Local vector store | `hnswlib-wasm` + IndexedDB | — | This IS the moat — the richer the index, the harder to leave |
| Device sync | E2EE + CRDTs (Signal-style) | Complex to build | Massive trust signal; hard to replicate |
| The race condition | Google ships Gemini Nano in Chrome natively | They ship generic AI | You ship personal AI — they're the model, you're the memory |

---

---

# Strategic Analysis: Pain, Risk, and Path

---

## 1. Hair-on-Fire Problems (Ranked by Urgency)

These are problems people are actively suffering right now — not theoretical needs.

### #1 — Enterprise Data Leakage (THE one)

This is the single sharpest pain point with the most money attached to it.

**The data:**
- [77% of employees paste company secrets into ChatGPT](https://www.esecurityplanet.com/news/shadow-ai-chatgpt-dlp/) — LayerX Enterprise AI Security Report 2025
- 82% of those pastes come from personal, unmanaged accounts — invisible to IT
- 40% of uploaded files contain PII or PCI data
- Average employee: 3.8 sensitive pastes per day
- [Samsung engineers pasted semiconductor source code and internal meeting recordings into ChatGPT](https://www.cybersecuritydive.com/news/Samsung-Electronics-ChatGPT-leak-data-privacy/647219/) — Samsung banned all GenAI tools company-wide in response
- [Employees Regularly Paste Company Secrets into ChatGPT (The Register, Oct 2025)](https://www.theregister.com/2025/10/07/gen_ai_shadow_it_secrets/)

**Why it's hair-on-fire:** CISOs, legal, and compliance teams are actively looking for a solution right now. Banning AI doesn't work — employees use it anyway via personal accounts. The only real fix is a safe, local alternative. This is a buying conversation, not an education conversation.

**Your answer:** AI that runs entirely on the device. IT can verify with a live network monitor demo. Zero data exfiltration is architecturally guaranteed, not policy-enforced.

---

### #2 — Developer Codebase Privacy

Developers are the highest-value early adopter segment. Their specific pain:

- Pasting proprietary code into GitHub Copilot / ChatGPT violates most enterprise NDAs
- Cloud coding assistants have no context of the full local repo — they only see what you paste
- Switching between tools to get context destroys flow state
- "I can't ask Copilot about this module because it's under NDA"

**Why it's hair-on-fire for devs:** They know the risk, they feel the friction daily, and they are willing to pay for tools that solve workflow problems. Devs are also the best word-of-mouth channel — they blog, tweet, and evangelize tools they love.

**Your answer:** A local coding assistant with full codebase indexing that never sends a byte out. Think Cursor, but local.

---

### #3 — Always-On Offline Access

- Traveling professionals, field workers, military, air-gapped environments
- Healthcare workers in hospitals with strict network controls
- Researchers on slow or metered connections
- "I'm on a plane for 8 hours and need to work"

**Why it's real pain:** Cloud AI tools fail completely when offline. A tool that works identically offline and online is genuinely rare.

---

### #4 — AI Subscription Fatigue

- People are paying $20/mo for ChatGPT Plus, $20/mo for Copilot, $20/mo for Claude — and still hitting limits
- "I ran out of GPT-4 messages mid-task"
- Zero-cost-anxiety ("should I waste a query on this?") is a real psychological tax

**Why this is weaker:** Cost alone isn't enough to make people switch — the quality bar has to be close enough. This pain only converts to users if your quality is adequate. Use it as a secondary pitch, not the primary hook.

---

## 2. The Competitive Landscape (Threats You Must Know)

### The Biggest Threat: Chrome Built-in AI (Gemini Nano)

This is the thing that could kill the product.

- [Gemini Nano is already shipped in Chrome 137+](https://developer.chrome.com/docs/ai/built-in) with Prompt API, Summarizer, Translator, Writer, Rewriter APIs
- [CPU support expanding in Chrome 140](https://developer.chrome.com/blog/gemini-nano-cpu-support) — reaching Linux, macOS, Windows users without a dedicated GPU
- [Google I/O 2025 session on built-in AI](https://io.google/2025/explore/technical-session-42/) — Google is actively pushing developers to build on top of it
- It is free, built-in, zero download, zero setup — and it is Google's model

**The honest threat:** If Gemini Nano gets good enough and is just there by default in Chrome, casual users have no reason to install your extension. You get commoditized before you launch.

**Your defense:** Google ships a generic AI. You ship a personal AI. Gemini Nano has zero knowledge of your documents, your codebase, your writing style, your past conversations. The personal context layer is the moat — not the model. Build that layer as deep as possible, as fast as possible.

### Other Competitors to Watch

| Product | What they do | Your edge over them |
|---|---|---|
| [BrowserOS](https://www.browseros.com/) | Open-source local AI browser | You're an extension, not a browser replacement — far lower friction |
| [Brave Leo](https://brave.com/leo/) | Local AI in Brave browser | Locked to Brave users; no personal context indexing |
| [Sigma Browser](https://siliconangle.com/2025/12/22/sigma-launches-privacy-focused-ai-native-browser-local-llm/) | Privacy-first AI native browser | Browser replacement, not extension |
| [Fellou](https://fellou.ai/) | Agentic browser with memory | Cloud-based memory, not truly local |
| [Side Space](https://www.sidespace.app/) | AI sidebar extension | Cloud-backed, no offline, no local indexing |
| ChatGPT Enterprise | Cloud AI with privacy controls | Still sends data to servers; expensive |

**The pattern:** Everyone building a browser replacement. You're building an extension that works in the browser people already use. That's a 10x lower adoption barrier.

---

## 3. What Will Make It Fail

Be brutally honest about these before you start.

### Kill #1 — The quality gap is too large for the target use case
- If you pick "developer coding assistant" as your wedge and the 3B model can't write useful code, users try it once and uninstall
- The local model quality is real: 2–7B models are adequate for Q&A, translation, summarization — they are not adequate for complex reasoning or multi-file code generation
- **Mitigation:** Pick a wedge use case where the quality bar is genuinely achievable. Translation and document Q&A are much more feasible than code generation.

### Kill #2 — First load kills conversion
- A 2–4GB model download on first install is a massive conversion killer
- Users who hit a slow progress bar with no explanation will close and uninstall
- **Mitigation:** Progressive download (smallest model first, prompt to upgrade), aggressive UI feedback ("downloading once, then it's yours forever"), background prefetch after install

### Kill #3 — Google / Apple absorb your thesis natively
- Chrome's Gemini Nano is already in stable release
- Apple ships on-device models via Apple Intelligence in Safari / iOS
- In 18 months, the "local AI in browser" idea may be a built-in browser feature
- **Mitigation:** You cannot win on "local AI." You must win on "personal context + local AI." The model is free infrastructure. The indexed, private, growing knowledge graph of the user's life is not replaceable. Speed up the indexing strategy above everything else.

### Kill #4 — No clear monetization in Phase 1
- A free, local product with no server costs is nice — but it also generates no revenue signal
- Without revenue, you can't validate willingness to pay and can't fundraise
- **Mitigation:** Launch with a Pro tier from day one, even if it's minimal. Charge for cloud escalation credits, larger model support, or multi-device encrypted sync. Get someone to pay within the first 60 days.

### Kill #5 — Privacy positioning attracts only privacy nerds, not the mainstream
- The people who care most about privacy are also the least likely to pay
- Enterprise is where the money is — but enterprise sales cycles are long (6–12 months)
- **Mitigation:** Use privacy as the enterprise sales pitch (compliance, GDPR, data governance), not the consumer pitch. For consumers, lead with "it's faster and works offline," not "it's private."

### Kill #6 — Memory and performance issues in real browser use
- A 4B model loaded in a tab alongside 40 other tabs = real memory pressure
- Service Worker / background script limits in Chrome MV3 are restrictive
- **Mitigation:** Lazy model loading, unload when tab not active, use a WebWorker for inference, profile memory hard before marketing

---

## 4. What Will Make It Succeed

### Green Light #1 — WebGPU is ready right now
- [WebGPU ships in Chrome, Firefox, Safari, and Edge as of late 2025](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/)
- Global browser coverage ~70% and growing
- [web-llm (MLC team) achieves 80% of native GPU performance in-browser](https://arxiv.org/abs/2412.15803) — this is not a toy
- The technical risk is largely resolved. The window is open.

### Green Light #2 — The enterprise pain is provable in a demo
- Open a network monitor. Show zero outbound calls. Ask it a "sensitive" question. That demo closes enterprise conversations.
- Compliance teams can verify it themselves — no trust required
- Samsung is a case study you can use in every enterprise pitch deck

### Green Light #3 — Developer-led growth is the fastest path
- Developers self-install, self-configure, share with their team
- A well-made GitHub README and a HN post can get you 1,000 installs in 24 hours
- Developers become internal champions for enterprise sales

### Green Light #4 — The personal context moat compounds over time
- Every document indexed, every conversation remembered, every preference learned = harder to leave
- After 90 days of daily use, the switching cost is high
- No competitor — including Google — can replicate a user's specific personal index
- This is a product that gets more valuable the longer you use it

### Green Light #5 — The cost structure is exceptional
- No GPU servers. Near-zero marginal cost per user.
- Can afford to be free-tier generous to drive adoption
- Unit economics are fundamentally better than any cloud AI product

---

## 5. How to Approach It

**Rule 1: Pick the sharpest wedge and go 10x deep before expanding**

Don't build a general assistant first. Pick one:
- **Option A (Enterprise path):** Local coding assistant for developers at security-conscious companies. Wedge: "Cursor, but nothing leaves your machine." Monetize via team/enterprise licenses.
- **Option B (Consumer path):** Personal knowledge base. "Index your notes, PDFs, bookmarks, and ask questions across all of them." Wedge: like Notion AI but truly private and offline.
- **Option C (Niche B2B):** Legal / healthcare / finance document Q&A. Sectors where data governance is regulatory, not just preference. Smaller market, higher willingness to pay.

**Rule 2: Make the first 10 minutes magical**

The moment that makes users stay is the first time the product answers a question using *their* data — not generic knowledge. "How did I describe the payment logic in our codebase?" and it answers correctly. That moment is everything. Get to that moment in onboarding as fast as possible.

**Rule 3: Build the context engine before the AI UI**

The chat interface is a commodity. The indexing pipeline (chunking, embedding, retrieval) is the actual product. Spend disproportionate engineering time on: quality of chunking, accuracy of retrieval, speed of indexing.

**Rule 4: Enterprise demo before enterprise sales**

Before you build admin dashboards and MDM integrations, get one enterprise team (5–10 developers at a friend's company) to use it for two weeks. Measure their adoption. Watch what they actually use it for. Enterprise features should be driven by observed usage, not assumed needs.

---

## 6. Open Source and Research to Build On

### Inference Engines (the model runtime)
- **[web-llm (MLC-AI)](https://github.com/mlc-ai/web-llm)** — the most production-ready WebGPU LLM runtime. Supports Llama, Phi, Gemma, Mistral. OpenAI-compatible API. 80% of native GPU performance. Start here.
- **[transformers.js (Hugging Face)](https://github.com/xenova/transformers.js/)** — WASM/ONNX runtime. Better CPU fallback than web-llm. Wider model support for smaller tasks (embeddings, classification). Use this for your embedding model.
- **[browser-llm-webgpu](https://github.com/hannes-sistemica/browser-llm-webgpu)** — proof of concept for reasoning models in-browser with WebGPU. Good for studying architecture.

### Personal Context / Vector Layer (the real product)
- **[SemanticFinder](https://github.com/do-me/SemanticFinder)** — open source, frontend-only semantic search using transformers.js. Client-side embeddings + cosine similarity. Study this implementation carefully.
- **[RxDB + transformers.js local vector DB](https://rxdb.info/articles/javascript-vector-database.html)** — shows how to combine a reactive local DB with in-browser embeddings over IndexedDB. Good architecture reference.
- **[PGlite with pgvector](https://pglite.dev/)** — full PostgreSQL with pgvector HNSW indexing running in the browser. Serious option for the vector store layer.

### Chrome Platform
- **[Chrome Built-in AI / Prompt API](https://developer.chrome.com/docs/ai/built-in)** — study what Google is doing. You can actually use Gemini Nano via their API as a fallback model (free, already installed for Chrome users). Integrate it instead of fighting it.
- **[Built-in AI Challenge Winners 2025](https://developer.chrome.com/blog/ai-challenge-winners-2025)** — read what others built with Chrome's built-in AI. Understand the design space and gaps.

### Research Papers
- **[WebLLM: A High-Performance In-Browser LLM Inference Engine (arXiv 2412.15803)](https://arxiv.org/abs/2412.15803)** — the academic paper behind web-llm. Read the performance benchmarks and limitations.
- **[Intel's Guide to In-Browser LLMs](https://www.intel.com/content/www/us/en/developer/articles/technical/web-developers-guide-to-in-browser-llms.html)** — practical engineering guide covering WASM vs WebGPU tradeoffs, memory limits, and model selection.

### Market Evidence
- **[LayerX Enterprise AI Security Report 2025](https://layerxsecurity.com/generative-ai/chatgpt-data-leak/)** — use the 77% statistic and the 3.8 daily pastes number in every enterprise pitch
- **[The Register: Employees Regularly Paste Company Secrets into ChatGPT](https://www.theregister.com/2025/10/07/gen_ai_shadow_it_secrets/)** — cite this in your deck
- **[Samsung ChatGPT leak case study (Cybersecurity Dive)](https://www.cybersecuritydive.com/news/Samsung-Electronics-ChatGPT-leak-data-privacy/647219/)** — the definitive enterprise risk story. Know it cold.

---

## The One Question That Decides Your First 90 Days

**What is the single moment where your product does something that ChatGPT, Copilot, and Gemini Nano literally cannot do — because the data never existed outside your device?**

Find that moment. Make it happen in under 5 minutes of onboarding. Make it feel like magic. Everything else is secondary.

---

## MCP — The Platform Play

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/specification/2025-11-25) is an open standard introduced by Anthropic in November 2024, now governed by the Linux Foundation with OpenAI, Google DeepMind, and Block as co-founders. It has become the industry standard for connecting AI clients to data sources.

**The insight:** If you build your local context engine as an MCP server, then every MCP-compatible AI client — Claude Desktop, Cursor, any future client — can query your user's local personal knowledge graph. You stop being "an AI product" and become "the personal context layer that makes all AI products smarter."

This is a platform play that requires almost no extra engineering. You build the context engine once (indexing, retrieval, embedding). You expose it via MCP. Suddenly you have distribution through every AI application that adopts MCP.

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Claude       │    │   Cursor    │    │  Any future │
│ Desktop      │    │             │    │  MCP client │
└──────┬───────┘    └──────┬──────┘    └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │  MCP protocol
                  ┌────────▼────────┐
                  │  YOUR LOCAL     │
                  │  CONTEXT ENGINE │
                  │  (MCP server)   │
                  │                 │
                  │  Personal docs, │
                  │  voice notes,   │
                  │  conversation   │
                  │  history        │
                  └─────────────────┘
                  (runs locally, private)
```

The model in Claude or Cursor becomes smarter because it has your context. Your product gets credit for that. Users install your MCP server even if they prefer a different AI client UI.

---

## The EU AI Act Is Your Regulatory Moat

[The EU AI Act is in full enforcement as of August 2026.](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) Cloud AI providers now carry significant compliance burdens: data residency, audit trails, transparency obligations, GPAI model registration.

**On-device AI is architecturally compliant by default.** If no personal data leaves the device, the EU AI Act's most burdensome provisions do not apply in the same way — there is no data processing on servers to regulate, no cross-border transfer, no persistent storage on third-party infrastructure.

[Meta has already moved toward on-device AI for European users specifically to avoid cloud-based AI Act compliance risk.](https://peerobyte.com/blog/eu-cloud-ai-act-for-cloud-infrastructure-what-you-need-to-get-done-by-2025-2026-and-how-it-affects-architecture-and-logs/) This is not theoretical — it is happening now.

**Your enterprise pitch in Europe is not "we're private." It is "we make your AI Act compliance trivial."** That is a legal and procurement argument, not a product argument. Legal and compliance teams make procurement decisions.

---

## The Multi-Device Problem

The "second brain" concept breaks completely if the brain only lives on one device. Users will immediately ask: "I indexed everything on my laptop. Now I'm on my phone. Where is my data?"

If you cannot answer that question, the product feels like a toy, not a second brain. Encrypted sync between a user's own devices is not a Phase 2 premium feature — it is a table-stakes requirement for the core promise to hold.

The right model: end-to-end encrypted sync derived from a user-held passphrase. You never see the data or the key, even in transit. Think Signal's encryption model applied to a personal knowledge graph. Use [CRDTs (Conflict-free Replicated Data Types)](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) to merge local stores across devices without conflicts or a central coordinator.

This is hard to build. Build it early. It is what separates a tool from a platform.

---

## Voice-First Wedge Use Cases (Ranked)

**#1 — Private voice note-taker and search**
"Note that..." and "What did I say about..." — zero friction capture and recall. No cloud, no subscription, no account. This is immediately useful for everyone and requires no complex reasoning from the model.

**#2 — Hands-free offline assistant**
For commuters, drivers, field workers. "Translate this sentence to Spanish." "What does EBITDA mean?" Simple queries that work perfectly at 3B parameters, work fully offline, and require zero typing.

**#3 — Meeting companion (local transcription)**
The opt-in recording and local transcription of calls and meetings. The model summarizes and indexes locally. This is a high-willingness-to-pay enterprise feature: "we want meeting intelligence but cannot send recordings to Otter or Fireflies."

**#4 — Voice-first personal knowledge base**
The long-term play: everything you say, read, and write, indexed privately. A year from now you ask "what was my thinking on the pricing model back in March?" and it answers from your own voice notes and documents.

---

## The Mobile Problem (and How to Solve It)

Chrome extensions do not work on iOS. Safari on iOS has limited extension support. This is a real distribution constraint for mobile-first users.

**The path:**

| Timeline | Platform | Approach |
|---|---|---|
| Month 0–4 | Desktop Chrome | Extension — fastest to build, full WebGPU access |
| Month 3–6 | Desktop Safari | Safari Web Extension — same codebase, different packaging |
| Month 4–8 | Mobile | PWA (Progressive Web App) — installable on home screen, Web Speech API for voice, WASM for inference |
| Month 8–14 | Mobile native | React Native or Swift wrapper around the same local engine — unlocks background processing, better mic access, widgets |

The PWA is the fastest path to mobile without an app store. It works in mobile Safari and Chrome, installs like an app, and can use Web Speech API for voice input. Model sizes need to be smaller on mobile (1B–2B) but the context layer logic is identical.

---

## Technical Feasibility: The Specific Decisions

This is what to actually build, with specific technology choices.

### Model Selection (tested and recommended)

| Task | Model | Size | Why |
|---|---|---|---|
| LLM (text generation) | Phi-3 Mini 3.8B Q4 | ~2.3GB | Best quality/size in class. Outperforms larger models at its task. |
| LLM fallback (weak hardware) | Gemma 2B Q4 | ~1.5GB | Faster on CPU, smaller memory footprint |
| Embeddings | `all-MiniLM-L6-v2` via transformers.js | 23MB | Fast, small, good quality. Standard for semantic search. |
| ASR (speech) | Whisper-base via whisper.cpp WASM | 145MB | Good quality, ~200ms/segment latency. Tiny model (39M) for faster UX. |
| Vision (Phase 2) | Phi-3-vision or MiniCPM-V 2B | ~2.5GB | Enables image, screenshot, and PDF-with-images understanding locally |

**On Apple Silicon:** all of these perform 3–5x better than on equivalent Intel hardware due to unified memory architecture. Target Mac users first for best experience.

---

### The Retrieval Pipeline (where most products get it wrong)

Naive vector search is not good enough. You will get semantically similar but wrong results, and the LLM will hallucinate confidently from the wrong context.

Build a three-stage retrieval pipeline:

```
Query
  │
  ▼
Stage 1: BM25 keyword search (fast, exact match)
  + Stage 2: Vector similarity search (semantic match)
  │
  ▼ top 20 candidates (union of both)
  │
Stage 3: Cross-encoder re-ranking
  (a small model scores each candidate against the query
   for true relevance — much more accurate than cosine sim)
  │
  ▼ top 3–5 highly relevant chunks
  │
Stage 4: Inject into LLM context window with attribution
  │
  ▼ Answer with source citations ("from your notes, March 12")
```

This is the architecture used by production RAG systems. The cross-encoder re-ranking step alone improves answer quality significantly. It adds ~100ms of latency and is worth every millisecond.

---

### Chunking Strategy (the underrated part)

How you split documents into chunks determines retrieval quality more than almost anything else.

- **Do not use fixed-size chunking** (512 tokens regardless of content). It breaks sentences, splits tables, and destroys semantic coherence.
- **Use semantic chunking:** embed sentences as you process them, detect when the embedding shifts significantly (new topic), and cut there. Libraries like `semantic-text-splitter` implement this.
- **Overlap chunks by 10–15%:** the end of chunk N appears at the start of chunk N+1. This ensures queries that span a chunk boundary still retrieve both pieces.
- **Store metadata with each chunk:** source file, page number, section heading, creation date, last access date. This metadata enables "from your notes in March" citation and time-based filtering.

---

### Context Window Management for Long Documents

A 3B model has a 4K–8K token context window. A 50-page PDF has ~60,000 tokens. You cannot fit it in. Use map-reduce:

```
Long document
  │
  ├── Chunk 1 → LLM → Partial answer 1
  ├── Chunk 2 → LLM → Partial answer 2
  ├── Chunk 3 → LLM → Partial answer 3
  └── ...
          │
          ▼
    Synthesis LLM call
    (partial answers → final answer)
```

For multi-turn conversations where history grows long: summarize previous turns progressively. Keep the last 2–3 turns verbatim, summarize everything older. This is how GPT-4 handles long conversations — replicate it locally.

---

### The Trust Panel (non-negotiable)

Every enterprise sale requires proof. Build a visible "Trust Panel" inside the extension:

- **Live network monitor:** shows all outbound requests made since install. Should show zero after initial model download. Users can inspect it themselves.
- **Local data inventory:** "Here is everything indexed on your device. Size: X. Documents: Y. Conversations: Z."
- **Cryptographic audit log:** locally stored, timestamped record of every query and what context was retrieved. User can read and delete it.
- **Open source verification:** link to the GitHub repo from within the extension, with a commit hash of the exact version running. Users who trust code can verify it themselves.

This panel is the sales demo for enterprise. It is also the thing that differentiates you from every cloud product that says "we're private" without any verifiable mechanism.

---

### Encrypted Sync Architecture

```
User's Passphrase
      │
      ▼
  Key Derivation (PBKDF2 or Argon2)
      │
      ▼
  Encryption Key (never leaves user's devices)
      │
      ├──── Encrypts local data before upload
      │
      ▼
  Your Sync Server
  (stores only: encrypted blobs + CRDT metadata)
  (cannot decrypt anything without the user's key)
      │
      ▼
  User's other devices
  (decrypt locally with the same key)
```

You never hold decryption keys. A subpoena of your servers returns encrypted blobs. This is not just a privacy feature — it is a legal architecture that eliminates an entire class of government data request liability.

---

## The Winning Strategy in One Framework

```
TRUST          →    VALUE          →    LOCK-IN
(Open source       (Personal           (Ecosystem +
 core, zero         context that        data that
 telemetry,         compounds           cannot be
 verifiable         daily)              migrated)
 privacy)

WHO: Privacy        WHO: Anyone         WHO: Developers
 nerds, devs,        with data           who build
 enterprise          they care about     on your runtime
 early adopters

HOW: HN, GitHub,    HOW: The "magic     HOW: MCP server,
 r/LocalLLaMA        moment" in          plugin API,
                     onboarding          marketplace
```

You cannot skip trust. You cannot skip value. Lock-in is the result of doing both well for a sustained period.

---

## The Obsidian Playbook (Proven)

> **Full pricing model and tier breakdown live in [CUSTOMER-ACQUISITION-PLAYBOOK.md](CUSTOMER-ACQUISITION-PLAYBOOK.md).**

[Obsidian grew to $2M revenue with 18 people](https://getlatka.com/companies/obsidian.md). The model to replicate: free for personal use, paid for sync and commercial use. No telemetry by default. Plugin ecosystem for lock-in. Local-first as identity, not just feature.

---

## The Future State (Year 2–3)

If the first 18 months succeed — 10K paying users, 5 enterprise pilots, a working MCP layer — here is what the product becomes:

### The Local AI Runtime

You stop being a product and become infrastructure. Developers build apps on your runtime:
- Local AI email composer (knows your writing style from indexed emails)
- Local AI code reviewer (knows your entire repo, not just the file you paste)
- Local AI meeting summarizer (transcribes locally, no audio to Otter)
- Local AI form filler (knows your personal information from your own data)
- Local AI health journal (ask about patterns in your symptoms — things you would never put in a cloud app)

Each of these third-party apps sends zero data to a server because they run on your local engine. The platform becomes the trust layer for personal AI applications.

### The Personal Context Standard

If MCP is the standard for connecting AI to data sources, and your local context engine is the most widely used MCP server for personal data — you become the standard that application developers target. Like how developers target the iOS App Store not because of Apple but because that is where the users are. Developers target your runtime because that is where the personal context lives.

### The Regulatory Tailwind

By 2026–2027, enforcement of the EU AI Act creates real friction for cloud AI providers. Companies in regulated sectors (healthcare, finance, legal, government) actively look for AI that is architecturally compliant rather than contractually compliant. On-device is the only architecture where "we process no personal data on servers" is verifiably true. Your market expands without you doing anything — the regulatory environment expands it for you.

---

## The Voice Platform Implication

If you build a local voice intelligence layer that:
- Transcribes privately
- Indexes the transcripts
- Answers from them

...then third-party developers can build on top of it:
- A local voice journaling app
- A hands-free coding assistant
- A private meeting summarizer
- A local voice-to-task manager

The platform is not just local AI + personal documents. It is local AI + the full stream of what you say and ask every day. That data layer, fully private, is something no cloud company has ever been able to build. You can, because you are not a cloud company.

---

## Technical Resources for Voice

- **[whisper.cpp (ggml-org)](https://github.com/ggml-org/whisper.cpp)** — C++ Whisper port with working WASM example. Runs fully offline in-browser. The foundation for local ASR.
- **[whisper.cpp WASM live demo](https://ggml.ai/whisper.cpp/)** — try it to understand current quality and latency
- **[whisper.wasm TypeScript wrapper](https://github.com/timur00kh/whisper.wasm)** — TypeScript wrapper that brings Whisper to the browser. Cleaner integration than raw C++.
- **[Real-time Whisper streaming in WASM](https://ggml.ai/whisper.cpp/stream.wasm/)** — streaming transcription, not batch. Required for responsive voice UX.
- **[AssemblyAI: Offline speech recognition guide](https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js)** — practical implementation guide for browser + Node.js Whisper deployment.

---

---

## Customer Acquisition & Revenue

> **All outreach templates, pricing validation, waitlist mechanics, enterprise pre-sales, community seeding playbooks, and the validation checklist live in [CUSTOMER-ACQUISITION-PLAYBOOK.md](CUSTOMER-ACQUISITION-PLAYBOOK.md).**
