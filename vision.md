# EdgeAI — Vision

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

Revenue:             Revenue:             Revenue:
Freemium +           Enterprise           Marketplace +
Pro license          licenses             API/Runtime fees

Months 0–8           Months 6–18          Months 14–30+
```

Each phase earns the right to the next. Phase 1 users become Phase 2 advocates ("I use this at home — we need it at work"). Phase 2 enterprises demand Phase 3 integrations.

---

## The Money Map

| Phase | Who Pays | What They Pay For | Model | Price |
|---|---|---|---|---|
| Phase 1 | Individuals | Bigger models, more storage, device sync | Freemium → Pro | $8–15/mo or $99/yr |
| Phase 2 | Companies | Enterprise deploy, compliance, team knowledge bases | Per-seat license | $15–30/seat/mo |
| Phase 3 | Developers | Runtime + context API access, marketplace listing | Rev share + API fees | 20–30% cut |

---

## Roadmap

### Phase 1: Prove It (Months 0–8) — Founder priority: get to 1,000 paying users

**Month 0–2: MVP**
- Chrome extension with local LLM via `web-llm`
- Simple chat interface in side panel
- Works offline after model download
- Zero accounts, zero servers, zero tracking

**Month 2–4: Make it personal**
- Local document indexing (drag & drop files)
- Opt-in page reading context ("index this tab")
- Conversation memory persisting locally
- This is where "sticky" begins

**Month 4–6: Find the wedge**
- Pick one use case that is 10x better local:
  - Developers: local codebase context
  - Writers: local drafts + style memory
  - Researchers: local paper/note indexing
  - Translators: offline, instant, private
- Go deep on that wedge based on early user signal

**Month 6–8: Monetize**
- Free tier: one small model, limited local storage
- Pro tier: multiple models, unlimited indexing, cloud escalation option
- Target: 1,000 paying users = validation

---

### Phase 2: Scale It (Months 6–18) — Manager priority: land enterprise

**The enterprise pitch:**
> "Your employees use AI daily. Today your company data flows to OpenAI, Google, Anthropic. You have zero control and zero visibility. EdgeAI runs entirely on the employee's device. No data ever leaves your network. Same AI productivity. Zero data risk. Compliance: automatic."

**Deliverables:**
- MDM / managed Chrome policy deployment
- Admin dashboard (usage analytics, no content visibility)
- SOC2 compliance (easy when nothing hits a server)
- Shared team knowledge bases (encrypted, local-first sync)
- Target: 3–5 enterprise pilots by month 12

**Objection handling:**
- *"Quality won't be as good"* → For 80% of daily queries it's identical. The other 20% uses opt-in cloud escalation through the enterprise's own approved API (Azure OpenAI, etc.).
- *"How do we know it's really local?"* → Open source the inference engine. Live demo in airplane mode.
- *"Pricing?"* → Per-seat annual. Cheaper than ChatGPT Enterprise. No usage-based billing — no server cost.

---

### Phase 3: Own the Ecosystem (Months 14–30) — CTO priority: build the platform

- Developer SDK: build apps on the local AI runtime with user context access (with permission)
- Plugin marketplace
- Example apps developers build:
  - Local AI email composer (knows your writing style)
  - Local AI code reviewer (knows your codebase)
  - Local AI meeting summarizer (no audio leaves device)
  - Local AI form filler (knows your info)
- Revenue: marketplace fees + runtime licensing

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

## Developer Execution Plan (Weeks 1–8)

**Week 1–2:** Proof of concept
- Chrome extension (Manifest V3) + `web-llm` + simple chat UI in side panel
- Verify: works offline after model cached
- Ship to 10 friends, collect feedback

**Week 3–4:** Personal context — the differentiator
- "Index this page" button: extract text, chunk, store embeddings in IndexedDB
- Queries search local vectors first, augment LLM prompt with relevant context
- Conversation history persists across sessions — this is where it stops feeling like a toy

**Week 5–6:** Polish for first users
- Progressive model download with progress bar
- Settings: model size choice, storage management, export/backup
- Chrome Web Store listing + landing page with the privacy pitch

**Week 7–8:** Learn and iterate
- What do users actually ask? Where does it fail? What do they index?
- Double down on whatever is working — find the wedge use case

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

# Strategic Analysis: Pain, Risk, and Path

---

## 1. Hair-on-Fire Problems (Ranked by Urgency)

These are problems people are actively suffering right now — not theoretical needs.

### #1 — Enterprise Data Leakage (THE one) 🔥🔥🔥

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

The trend is directional and accelerating. Text is becoming the secondary input. Voice is becoming the primary one. Minimum friction is the goal: tap once, speak, done.

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
- **ASR (speech → text):** `whisper.cpp` compiled to WASM — fully offline, no audio leaves the device
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

## The Platform Implication

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

## The Voice-First Wedge Use Cases (Ranked)

**#1 — Private voice note-taker and search**
"Note that..." and "What did I say about..." — zero friction capture and recall. No cloud, no subscription, no account. This is immediately useful for everyone and requires no complex reasoning from the model.

**#2 — Hands-free offline assistant**
For commuters, drivers, field workers. "Translate this sentence to Spanish." "What does EBITDA mean?" Simple queries that work perfectly at 3B parameters, work fully offline, and require zero typing.

**#3 — Meeting companion (local transcription)**
The opt-in recording and local transcription of calls and meetings. The model summarizes and indexes locally. This is a high-willingness-to-pay enterprise feature: "we want meeting intelligence but cannot send recordings to Otter or Fireflies."

**#4 — Voice-first personal knowledge base**
The long-term play: everything you say, read, and write, indexed privately. A year from now you ask "what was my thinking on the pricing model back in March?" and it answers from your own voice notes and documents.

---

## Revised North Star

The product vision evolves from:

> "A chat assistant that runs locally in your browser"

To:

> "A private ambient intelligence that learns from everything you say, read, and write — and is always one tap away, on any device, with no account, no server, and no one else listening."

The interface is not a chat box. It is a tap. The answer comes back in your ear or on the screen. The memory compounds silently. You stop thinking of it as a product you use and start thinking of it as a layer of your cognition.

That is the product that is impossible to leave.

---

## Technical Resources for Voice

- **[whisper.cpp (ggml-org)](https://github.com/ggml-org/whisper.cpp)** — C++ Whisper port with working WASM example. Runs fully offline in-browser. The foundation for local ASR.
- **[whisper.cpp WASM live demo](https://ggml.ai/whisper.cpp/)** — try it to understand current quality and latency
- **[whisper.wasm TypeScript wrapper](https://github.com/timur00kh/whisper.wasm)** — TypeScript wrapper that brings Whisper to the browser. Cleaner integration than raw C++.
- **[Real-time Whisper streaming in WASM](https://ggml.ai/whisper.cpp/stream.wasm/)** — streaming transcription, not batch. Required for responsive voice UX.
- **[AssemblyAI: Offline speech recognition guide](https://www.assemblyai.com/blog/offline-speech-recognition-whisper-browser-node-js)** — practical implementation guide for browser + Node.js Whisper deployment.

---

---

# Complete Picture: Blind Spots, Go-to-Market, Strategy, and Technical Depth

---

## What You Are Probably Not Thinking About

These are the things most founding teams miss until they hit them.

### 1. The Cold Start Problem — Day 1 Has No Value

The product is only powerful after the user has built up context. But on day 1, there are no indexed documents, no voice notes, no conversation history. The user opens it, asks a question, gets a generic answer a 3B model would give anyone. They close it and never return.

**This is the most common reason personal AI products fail to retain users.**

The fix is import-first onboarding. On first launch, before anything else:
- Connect Google Drive, Notion, Obsidian vault, or drop a folder
- Import Chrome bookmarks and reading history (opt-in)
- Import from common note-taking apps (Evernote, Bear, Apple Notes export)

The goal: make the product answer a question from the user's own data within the first 3 minutes. That is the moment of retention. Everything before that is a loading screen.

---

### 2. MCP — The Platform Play Nobody Is Talking About

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

### 3. The EU AI Act Is Your Regulatory Moat

[The EU AI Act is in full enforcement as of August 2026.](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai) Cloud AI providers now carry significant compliance burdens: data residency, audit trails, transparency obligations, GPAI model registration.

**On-device AI is architecturally compliant by default.** If no personal data leaves the device, the EU AI Act's most burdensome provisions do not apply in the same way — there is no data processing on servers to regulate, no cross-border transfer, no persistent storage on third-party infrastructure.

[Meta has already moved toward on-device AI for European users specifically to avoid cloud-based AI Act compliance risk.](https://peerobyte.com/blog/eu-cloud-ai-act-for-cloud-infrastructure-what-you-need-to-get-done-by-2025-2026-and-how-it-affects-architecture-and-logs/) This is not theoretical — it is happening now.

**Your enterprise pitch in Europe is not "we're private." It is "we make your AI Act compliance trivial."** That is a legal and procurement argument, not a product argument. Legal and compliance teams make procurement decisions.

---

### 4. The Multi-Device Problem Is Day 1, Not Phase 2

The "second brain" concept breaks completely if the brain only lives on one device. Users will immediately ask: "I indexed everything on my laptop. Now I'm on my phone. Where is my data?"

If you cannot answer that question, the product feels like a toy, not a second brain. Encrypted sync between a user's own devices is not a Phase 2 premium feature — it is a table-stakes requirement for the core promise to hold.

The right model: end-to-end encrypted sync derived from a user-held passphrase. You never see the data or the key, even in transit. Think Signal's encryption model applied to a personal knowledge graph. Use [CRDTs (Conflict-free Replicated Data Types)](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) to merge local stores across devices without conflicts or a central coordinator.

This is hard to build. Build it early. It is what separates a tool from a platform.

---

### 5. Context Contamination and Selective Forgetting

If you index everything, eventually the AI will surface something the user did not mean to expose — on a screen share, in a meeting, on a shared device. This is a trust-destroying event.

You need:
- **Selective indexing:** explicit user control over what is indexed and what is not. No surprise indexing of sensitive folders.
- **Selective forgetting:** the ability to delete any indexed item and have that deletion cascade through the vector store immediately
- **A "private mode":** temporarily suspend indexing and context retrieval without deleting anything
- **Audit log:** a locally stored, human-readable log of everything the model has accessed — so the user always knows what it knows

The product that gets this wrong will generate a "my AI revealed my salary to my colleague" story on Hacker News. Design for this before it ships.

---

### 6. The Ambient Listening Liability

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

### 7. Hardware Fragmentation Is Worse Than You Think

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

### 8. The Model Update Lifecycle

When Phi-4 ships, when Gemma 3B releases, when a better model becomes available — how does the user upgrade? The context vector store is model-agnostic (vectors are just numbers from your embedding model). But the LLM inference engine and its quantized model weights need to be replaced.

Design the update experience from day 1:
- Models are versioned assets, downloaded on demand
- User can choose to upgrade or stay on the current model
- Model update does not touch the context store
- Old model weights are deleted from disk after confirmation to free space

If you do not design this, you will have users running a stale model from 2025 in 2027 because they do not know how to update it.

---

## Go-to-Market: How to Get Your First 1,000 Users

This is not theoretical. These are the specific moves, in order.

### Week 1–2: Seed the Community Before You Launch

Before the product ships, write. Publish in:
- **Hacker News** — "Ask HN: How are you handling AI tool data privacy at work?" No product pitch. Gather signal and surface your thinking.
- **r/LocalLLaMA** — the largest community of people who already run local LLMs. They are pre-sold on the concept. They want a polished experience.
- **r/privacy** — explain the enterprise data leakage problem. Share the 77% statistic. Ask how people are solving it. Position yourself as someone thinking through the problem, not selling a solution yet.

The goal is to have 50 people asking "when can I try this?" before you launch.

---

### Week 3–4: Ship the MVP and Post on HN

Post "Show HN: [Product Name] — local AI with personal context, runs fully offline, no account needed."

The HN post succeeds if:
- You can demo it with a GIF showing: drag-and-drop a folder → ask a question → it answers from your docs, no network calls
- The GitHub repo is live, MIT licensed, with a clear README
- The Chrome Web Store listing is live with screenshots

First 100 users come from this post. They will file issues, suggest use cases, and tell you what the wedge actually is.

---

### Chrome Web Store SEO

Optimize for:
- "local AI assistant"
- "private AI chrome extension"
- "offline AI"
- "AI without API key"

These are the search terms people use when they are frustrated with cloud AI pricing or privacy concerns. The Web Store has 3.3 billion Chrome users as the top of funnel.

---

### The Enterprise Path: One Email, One Demo, One Pilot

The enterprise sales motion at this stage is:

1. **One email** — "77% of your employees are pasting company data into ChatGPT right now. Here is a study. We built the fix." Send to CISO, VP Engineering, or Head of IT at 50 target companies. No sales deck. Just the statistic and a Calendly link.

2. **One demo** — 20 minutes. Open a browser, open a network monitor, show zero outbound requests, ask a sensitive question, show the answer. Done. Let compliance teams verify it themselves.

3. **One pilot** — 10 developers, 3 months, free. Measure: daily active usage, queries per user, documents indexed. At the end of 3 months, convert to a per-seat license. Every enterprise pilot that converts becomes a case study.

**The Samsung story is your opener for every enterprise call.** Know it cold. Use it without attribution if needed — just "a major semiconductor company" until Samsung is comfortable being named.

---

### The Obsidian Playbook (Proven)

[Obsidian grew to $2M revenue with 18 people](https://getlatka.com/companies/obsidian.md) by following a specific model you should study and replicate:

- **Free for personal use, paid for sync and commercial use.** The core product is free. Revenue comes from features that require infrastructure ($8/mo for sync) and enterprise licenses.
- **No telemetry by default.** They do not track usage to define the roadmap. Community feedback and their own judgment drive decisions. This is a massive trust signal.
- **Plugin ecosystem.** A large library of community plugins lets users customize for any workflow. The plugin ecosystem means Obsidian does not have to build everything — and it creates lock-in because users' workflows depend on plugins only available for Obsidian.
- **Local-first as identity, not just feature.** Users do not say "I use a note-taking app that stores locally." They say "I use Obsidian." The local-first architecture became the brand.

Your equivalent:
- Free for personal use (local-only, no sync)
- Pro: $9/mo — encrypted cross-device sync, larger model support, cloud escalation credits
- Enterprise: per-seat license with compliance dashboard
- Plugin/MCP ecosystem: developers extend the context engine for their use case

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

## The Playbook Summary

```
NOW (Month 0–3)
├── Build the context engine first (indexing, chunking, retrieval)
├── Add the LLM UI on top of the context engine (not the reverse)
├── Import-first onboarding (solve the cold start problem)
├── Expose an MCP server from day 1
├── Open source the core engine (MIT)
└── Launch on HN, r/LocalLLaMA, Chrome Web Store

SOON (Month 3–9)
├── Add voice input (whisper.cpp WASM)
├── Add encrypted sync (the "Obsidian Sync" moment)
├── First enterprise pilot (free, 3 months, 10 devs)
├── Pro tier ($9/mo) — sync + larger models + cloud escalation
└── Trust Panel (the demo that closes enterprise)

NEXT (Month 9–18)
├── Safari extension (iOS / macOS Safari users)
├── PWA for mobile (voice-first interface)
├── Enterprise admin dashboard
├── Plugin marketplace (MCP ecosystem)
└── 3 enterprise reference customers → case studies → sales flywheel

LATER (Month 18–30)
├── Native mobile app (background transcription, mic access, widgets)
├── Regulatory positioning in EU, healthcare, finance, legal
├── Runtime licensing to enterprises building internal AI tools
└── The personal context standard — every AI client queries your engine
```

---

---

# Architecture Decision Record (ADR)

Every technical decision that matters, evaluated and decided. This is the build specification.

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
  ├── transformers.js (WebGPU)  ← embeddings, Whisper, re-ranker
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
| ASR (voice → text) | **transformers.js** | whisper-tiny.en | ~40MB | Sub-realtime on desktop WebGPU. Works on iOS Safari via WebGPU (no SharedArrayBuffer needed). |
| Re-ranking | **transformers.js** | ms-marco-MiniLM-L-6-v2 int8 | ~22MB | 200–500ms for 10 candidates. Pre-exported ONNX at huggingface.co/Xenova. |
| CPU fallback (weak hardware) | **wllama** | Llama-3.2-1B-q4 GGUF | ~0.7GB | Pure WASM, no WebGPU required. 8–15 tok/s — slow but functional. |
| Vision / screenshots (Phase 2) | **transformers.js** | moondream2 or Phi-3-vision | ~2.5GB | Enables image/screenshot Q&A locally. |

**Rejected:** llama.cpp WASM directly — requires COOP/COEP headers for multi-threading, complex setup, no GPU. wllama is the cleaner WASM path but only as fallback.

**Model weights storage:** Cache API (not IndexedDB) — faster for large binary files, survives service worker restarts. web-llm uses Cache API natively. Initial download: 2–4GB, 5–15 minutes on average broadband. Subsequent loads: 3–8 seconds.

**Critical constraint on iOS Safari:** No SharedArrayBuffer (removed in Safari 15.2, never restored). Multi-threaded WASM is impossible on iOS. Use transformers.js + WebGPU only on iOS. whisper-tiny.en runs at ~1–2x realtime on A15+ via WebGPU. No wllama fallback on iOS — offer cloud escalation instead.

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

**Vector dimensions:** Use 384-dim embeddings (bge-small-en-v1.5) not 1536-dim. Storage: 100K chunks × 384 × 4 bytes = ~150MB. This fits comfortably in IndexedDB.

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

**Priority order (by impact × ease):**

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

**Decision: transformers.js Whisper + Web Speech Synthesis API + Silero VAD**

```
Microphone (getUserMedia)
    │
    ▼
Silero VAD (ONNX, ~1MB)          ← detect speech, skip silence
    │ speech detected
    ▼
whisper-tiny.en (ONNX + WebGPU)  ← ~0.3-0.5x realtime on desktop
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

**Silero VAD** (https://github.com/snakers4/silero-vad) — ONNX model, ~1MB, ~1ms inference. Detects voice activity before sending audio to Whisper. Prevents transcribing silence and reduces Whisper calls by 60–80%.

**iOS Safari constraints:** No SharedArrayBuffer → multi-threaded WASM unavailable → whisper-tiny ONNX + WebGPU only. Latency: ~1–2x realtime on A15+. Acceptable for voice notes. Not acceptable for real-time meeting transcription on iOS.

**Voice note intent detection:** A simple rule-based classifier before calling the LLM: if transcript starts with "note that", "remember", "add note" → store directly without LLM call. This makes voice notes instant (~0ms) even if the LLM is not loaded.

---

## ADR-010: Full Stack Reference

```
LAYER                   TECHNOLOGY              SIZE        NOTE
─────────────────────────────────────────────────────────────────────
Generative LLM          web-llm (WebGPU)        ~2.3GB      Cache API
Embeddings              transformers.js ONNX    ~33MB       bge-small-en-v1.5
ASR                     transformers.js ONNX    ~40MB       whisper-tiny.en
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

---

---

# Sell Before Create: The Zero-Cost Validation Playbook

Ship nothing. Charge something. Learn everything.

---

## The Sequence

```
Week 1   Seed communities (no product, just the problem)
Week 2   Launch landing page + waitlist
Week 3   First enterprise cold outreach (5 companies)
Week 4   "Show HN" post or equivalent
Week 5+  Concierge MVP for first 10 users
Month 2  Pricing survey to waitlist
Month 3  First paying customer (before any code)
```

---

## 1. The Landing Page (Before Anything Else)

**Tool:** Carrd ($19/year) for speed, or Framer (free tier) for design quality. For developers: a GitHub repository with a well-designed README is also a landing page.

**The page has one job:** Capture an email address. Everything else is secondary.

**Copy structure for each segment:**

**Consumer / Developer version:**
```
Headline:   "AI that works offline. Knows your docs. Tells no one."
Subhead:    "A personal AI assistant that runs entirely on your device.
             Index your notes, code, and files. Ask anything.
             Zero API keys. Zero subscriptions. Zero data sent anywhere."
CTA:        [Join the waitlist →]
Trust:      "We'll never send your data anywhere. Because we can't —
             it never leaves your machine."
```

**Enterprise version (separate page or toggle):**
```
Headline:   "Your employees are pasting company secrets into ChatGPT.
             Here's the fix."
Subhead:    "77% of employees share sensitive data with AI tools
             on personal, unmanaged accounts. [LayerX 2025]
             [Product] runs entirely on the employee's device.
             Nothing ever hits a server. Zero compliance risk."
CTA:        [Request a pilot →]
Social proof: Samsung case study. The 77% statistic. A network monitor screenshot.
```

**Conversion elements that work for privacy products:**
- A screen recording (not a polished demo) of a network monitor showing zero outbound requests while using the product
- The specific number: "0 bytes sent to any server"
- Open source badge: "Core engine is open source — verify it yourself [GitHub →]"
- No tracking pixel on the page itself (practice what you preach — use privacy-respecting analytics like Plausible or Fathom, or none at all)

**Metrics that matter:**
- >20% email capture rate from landing page visitors = strong signal
- >5% "Request a pilot" for enterprise = strong signal
- <5% overall conversion = the headline or offer needs work

---

## 2. Community Seeding (Before the Landing Page Exists)

Do this the week before you launch the landing page. The goal is to have 50 people asking "where do I sign up?" before you post the link.

### Hacker News — "Ask HN" format

Post this before you have a product. No product mention.

```
Title: "Ask HN: How is your company handling AI tools and sensitive data?"

Body:
We've been looking at how enterprises are dealing with the
ChatGPT/Copilot data leak problem. A recent study found 77% of
employees paste sensitive company data into AI tools from personal
accounts. Samsung banned all GenAI after engineers submitted
semiconductor source code to ChatGPT.

Curious: what policies or tools have you seen actually work?
Are people banning AI entirely (which seems to fail),
or finding technical solutions?
```

This post generates discussion AND surfaces your potential customer. Reply to every comment. Do NOT mention you're building something yet. Learn.

Two weeks later, post "Show HN:" with the working MVP.

### r/LocalLLaMA

The audience here already runs local LLMs. They are pre-sold on the concept. They want quality of life improvements, not education.

Post format that works:
```
Title: "I built a Chrome extension that runs Phi-3 locally
        with personal document RAG — here's what I learned about
        making it actually fast"

Body: Technical post about the architecture decisions.
      web-llm vs transformers.js comparison.
      How you handled MV3 offscreen document limitations.
      Performance numbers.
      "Here's the prototype if anyone wants to test it: [link]"
```

This gets upvoted by technical users because it's genuinely useful. The link is your waitlist or GitHub.

### r/privacy

Problem-first post, no product mention at first:
```
Title: "77% of employees paste company secrets into ChatGPT daily
        — what does a fix actually look like?"

Body: Share the LayerX data. Samsung story.
      "I've been thinking about this problem.
       The only real solution is AI that runs on-device so there's
       nothing to leak. Has anyone built or used something like this?"
```

Reply to responses. Gauge interest. Drop the waitlist link in a follow-up comment, not the post.

### Twitter/X — thread format

```
Thread hook: "77% of your employees are pasting company secrets
              into ChatGPT right now.
              Not maliciously. They just want to do their job faster.
              Here's the real problem — and what I think the fix looks like.
              🧵"

Tweet 2: Samsung story
Tweet 3: The 82% personal accounts stat (invisible to IT)
Tweet 4: "Banning AI doesn't work — they use their phone"
Tweet 5: "The only real fix: AI that runs on their device.
          Nothing to leak if nothing goes to a server."
Tweet 6: "I'm building this. If this resonates, join the waitlist: [link]"
```

Tag @localllm, @privacyguides, relevant security researchers.

---

## 3. Enterprise Pre-Sales: One Email, One Call, One Letter

### Finding Contacts

**LinkedIn Sales Navigator (free trial):** Search "CISO" or "VP Engineering" + company size 100–2000 employees + industry (tech, finance, healthcare, legal). Export 50 names.

**Hunter.io (free tier):** Find email format for a target company. Verify emails before sending.

**Twitter/X:** Follow CISOs who tweet about AI risk. Many are vocal. Direct engagement on their existing threads > cold email.

### Cold Email Template

```
Subject: Your engineers are pasting code into ChatGPT right now

Hi [Name],

Quick data point: 77% of enterprise employees share company data
with AI tools from personal accounts. 82% of those are completely
invisible to IT. [LayerX 2025 report]

Samsung banned all GenAI tools after engineers submitted semiconductor
source code to ChatGPT. The problem isn't intent — it's that
ChatGPT is just there and banning it doesn't work.

I'm building an AI assistant that runs entirely on the employee's
device. Nothing ever hits a server — architecturally guaranteed,
not policy-enforced. I can demonstrate it with a live network monitor.

Looking for 3 companies to pilot this for free for 90 days.
10 developers, zero cost, your feedback shapes the product.

20 minutes to show you? [Calendly link]

[Name]
```

**Send to:** CISO > VP Engineering > Head of IT Security. In that order.

**Volume:** Send to 50 companies. Expect 3–5 replies. 2–3 calls. 1 pilot agreement. This is a good outcome.

### Design Partner Agreement (1 page)

```
DESIGN PARTNER AGREEMENT

[Company] agrees to:
- Deploy [Product] to 5–10 employees for 90 days
- Provide weekly feedback via 30-minute calls or written summary
- Introduce us to 2 other potential customers if the pilot is successful

[Your company] agrees to:
- Provide the product at no cost for the pilot period
- Give [Company] a 50% perpetual discount on any future paid plan
- Treat [Company]'s feedback as confidential
- Not use [Company]'s name publicly without written permission

This is not a binding commercial agreement.
It is a mutual commitment to explore a working relationship.

Signed: _________________ Date: _________
```

**3 signed design partner agreements from companies with >50 employees = validated enterprise demand.**

---

## 4. Pricing Validation (Before Writing Code)

**Van Westendorp Price Sensitivity Meter — free via Tally.so:**

Add this to your waitlist thank-you page or send to your first 50 subscribers:

```
Four questions:
1. "At what monthly price would [Product] be so expensive
    you wouldn't consider it?" → TOO EXPENSIVE

2. "At what price would it start to seem expensive, but you'd
    still consider it?" → EXPENSIVE BUT ACCEPTABLE

3. "At what price would it be good value?" → ACCEPTABLE

4. "At what price would it be so cheap you'd question its quality?"
    → TOO CHEAP

[Slider or number input for each]
```

Plot the four curves. The intersection of "too expensive" and "too cheap" gives you the acceptable price range. The intersection of "expensive but acceptable" and "acceptable" gives you the optimal price point.

**For this product:** Expected outcome based on comparable tools (Obsidian Sync = $8/mo, 1Password = $3/mo, setapp = $10/mo) is an acceptable range of $7–14/month with an optimal price around $9–11/month.

**Dummy checkout validation:**

On the landing page, add a "Start Pro Free Trial" button that leads to a checkout-looking page:
```
"Pro Plan — $9/month after 14-day free trial
 ✓ Encrypted sync across all devices
 ✓ Larger models (7B parameter)
 ✓ Cloud escalation credits

 [Enter email to start trial →]
```

When they submit: "You're on the waitlist! We'll notify you when Pro launches."

Count how many people reach this page and submit their email. This measures intent to pay. A >30% form completion rate on this page = strong signal.

---

## 5. Waitlist Mechanics

**Tool:** Tally.so (free, privacy-respecting, no tracking) or a simple Airtable form. Not Mailchimp — too corporate for this audience.

**Referral loop:** Add a post-signup page:
```
"You're #[N] on the list.

 Move up the list by sharing with people who care about privacy:

 [Share link] → Each person who joins via your link
                 moves you up 10 spots.

 At position #1–100 you get: free Pro for 1 year."
```

Viral Loops ($49/mo) or Waitlist.gg (free) handle the referral mechanics. Alternatively, build it in 30 minutes with Tally + Airtable + a simple position calculation.

**Milestone emails (send these to keep the list warm):**
- Day 1: "You're on the list. Here's what we're building and why."
- Week 2: "Here's the problem we keep hearing from enterprise teams..."
- Week 4: "Early technical preview — here's how we're solving the offline inference problem."
- Week 6: "We have 500 people on the list. Here's our roadmap."
- Month 2: "Pricing survey — 2 minutes, helps us build the right product."

**Signal thresholds:**
- 500 consumer waitlist signups = build the MVP
- 5 enterprise design partner conversations = build enterprise features
- 50 people who complete the dummy checkout = launch the Pro tier

---

## 6. The Concierge MVP (Validate the Experience, Not the Technology)

The goal: deliver the product experience manually to 10 users before writing any code. Understand what they actually need, not what you assumed.

**What this looks like for a local AI assistant:**

Recruit 5 developers and 5 enterprise users. For each:
1. Set up Ollama locally on their machine (30-minute call). Install a RAG model (LlamaIndex + Phi-3).
2. Help them index their most important documents manually.
3. Do a 1-hour "interview session" where they ask questions and you watch what they reach for.
4. Ask: "What would have to be true for you to use this every day?" and "What broke your trust in that session?"

**What you learn:**
- What data sources they actually want indexed (often surprising)
- Where the quality bar needs to be for their specific queries
- What the first 10 minutes of setup needs to look like
- What would make them pay vs. churn

**10 concierge users = enough to know what to build first.** You are not building for 10 people. You are learning from 10 people so you build for 10,000.

---

## 7. Chrome Web Store Early Listing

**Yes, you can list before the product is fully built.**

Minimum requirements for a Chrome Web Store listing:
- `manifest.json` (MV3, minimal)
- One icon: 128×128px PNG
- A popup HTML file (can just be a landing page with an email signup)
- A description (can describe the planned product)
- Screenshots (can be mockups)
- Privacy policy (required — can be a simple one-pager)
- $5 one-time developer registration fee

**Strategy for pre-launch:**
Publish a "beta" version of the extension that does one thing: shows your product description, a GIF demo (mockup), and an email signup form. Users who find it via Chrome Web Store search are pre-qualified — they are actively looking for exactly your product.

**Optimize your listing for these search terms:**
- "local AI assistant" (high intent)
- "private AI" (growing search volume)
- "offline AI" (underserved)
- "AI without ChatGPT" (frustration search)
- "AI no API key" (developer intent)

**Expected organic discovery:** AI assistant extensions in the Chrome Web Store get 10–50 installs/day from organic search once listed, growing as the store index catches up (2–4 weeks after publish). At launch, having even 100 installs from the "beta" listing creates social proof for the real launch post.

---

## 8. Companies That Sold Before They Built (Reference Cases)

**Superhuman (email client):** Built a $30/month email product with a 6-month waitlist. Manual onboarding call for every new user. Rejected users who didn't fit the ICP. Generated exclusivity and word-of-mouth before the product was polished. Reached $30M ARR.

**Linear (project management):** Built a waitlist with a beautiful landing page and a detailed changelog before most features existed. Developers shared the landing page because the design and copywriting were so good they aspired to use it. 10K waitlist before launch.

**Loom (async video):** Validated with a "coming soon" page and reached out personally to every early signup. The first 100 users got personal attention. Those users became advocates and wrote the first reviews.

**Raycast (developer tools):** Personal outreach to 100 developers. Manual onboarding. Built every early feature based on direct feedback from those 100. Now millions of users.

**Common pattern:** Personal outreach + manual onboarding + direct feedback loop. Not ads, not viral loops, not Product Hunt launches (those come after). The first 100 users are a research project, not a growth metric.

---

## The Validation Checklist (Before Writing Any Code)

```
□ Landing page live (Carrd/Framer) with email capture
□ 1 "Ask HN" or community post published (no product mention)
□ 50 waitlist signups from organic interest
□ 5 enterprise cold emails sent to CISO/VP Eng targets
□ 1 enterprise design partner conversation completed
□ Pricing survey sent to first 50 signups
□ 10 concierge users identified and interviewed
□ Chrome Web Store beta listing published
□ 1 technical blog post or thread published
□ Dummy checkout conversion rate measured

SIGNAL TO START BUILDING:
□ 200+ waitlist signups
□ 1 signed design partner agreement
□ Pricing survey shows $8-12/month acceptable range
□ 3+ concierge users say "I'd use this every day if..."
   and their answer is achievable with the current architecture
```
