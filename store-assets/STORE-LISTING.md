# Chrome Web Store Listing — EdgeAI

## Extension Name
EdgeAI — Private AI Assistant

## Short Description (132 chars max)
Your AI. Your device. Your data. A fully private AI assistant that runs locally — no servers, no API keys, no data leaves your device.

## Detailed Description

EdgeAI is a fully local AI assistant that runs entirely in your browser. No API keys. No accounts. No data ever leaves your device.

Ask questions, search your personal knowledge base, import your notes — all powered by AI models running on your own hardware via WebGPU.

WHAT MAKES IT DIFFERENT:

- 100% Local: The AI model (Phi-3.5-mini, 3.8B parameters) runs on your device using WebGPU. Nothing is sent to any server. Ever.
- Personal Knowledge Base: Import your Obsidian vault, PDFs, Chrome bookmarks, or any web page. EdgeAI indexes everything locally and answers from YOUR context.
- Voice Input: Speak instead of type. Local speech recognition (Moonshine ASR) transcribes on-device. No audio leaves your browser.
- Voice Output: AI reads responses aloud using built-in text-to-speech. Zero external dependencies.
- Trust Panel: A live transparency dashboard showing every network request the extension makes. After the initial model download, the count is zero. Verify it yourself.
- Audit Log: Every query, every search, every document indexed — logged locally so you always know what your AI knows.
- Privacy Policy: No data collection. No telemetry. No analytics. No cookies. Open source.

HOW IT WORKS:

1. Install EdgeAI
2. The AI model downloads once (~2.3GB, cached locally)
3. Import your documents (Obsidian, PDF, bookmarks, or "Index this tab")
4. Ask anything — answers are grounded in YOUR personal context
5. Check the Trust Panel to verify: zero data sent anywhere

BUILT WITH:

- web-llm (WebGPU) for local LLM inference
- transformers.js for embeddings, reranking, and speech recognition
- Orama for hybrid BM25 + vector search
- IndexedDB for persistent local storage
- Fully open source

REQUIREMENTS:

- Chrome 116+ with WebGPU support
- ~4GB available memory for the AI model
- ~3GB disk space for model cache (first download only)
- Works best on Apple Silicon (M1/M2/M3) or dedicated GPU

PRIVACY:

EdgeAI makes exactly zero network requests after the initial model download. The Trust Panel proves this with a live network monitor. Your documents, conversations, and voice recordings never leave your device. Read the full privacy policy inside the extension.

## Category
Productivity

## Language
English

## Website
https://kamalkalwa.github.io/EdgeAI

## Privacy Practices (Chrome Web Store form)

### Single Purpose Description
EdgeAI is a private AI assistant that runs locally in the browser, providing chat, document search, and voice interaction without sending any data to external servers.

### Are you collecting or using data?
No, this extension does not collect or transmit user data to any server.

### Data Use Certifications
- I do not sell user data to third parties
- I do not use or transfer user data for purposes that are unrelated to the item's core functionality
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Permissions Justification

| Permission | Justification |
|---|---|
| storage / unlimitedStorage | Store AI model cache, indexed documents, embeddings, chat history, and user settings locally on the device |
| offscreen | Run AI model inference in a background document (required for WebGPU access, which is not available in service workers) |
| activeTab / scripting | Extract page content when the user explicitly clicks "Index this tab" to add the current page to their local knowledge base |
| bookmarks | Import bookmarks for local indexing when the user explicitly chooses to import bookmarks |
| host_permissions (all URLs) | Download AI model files from Hugging Face CDN on first use; extract content from any tab the user chooses to index |
| webRequest | Power the network activity monitor in the Trust Panel (read-only observation of the extension's own requests — no modification) |
| alarms / notifications | Support voice-initiated reminders set by the user |
| contextMenus | Add "Index with EdgeAI" to the right-click context menu |

## Screenshots Needed (1280x800)

1. Chat with RAG — show a question answered from personal documents with source attribution
2. Document import — Obsidian vault import with progress bar
3. Trust Panel — network monitor showing zero external requests + data inventory
4. Voice input — recording indicator active, transcript appearing
5. Onboarding — first-run wizard "Let's make this yours"

## Promotional Tile (440x280)

Dark background (#0f0f0f), EdgeAI logo, tagline: "Your AI. Your Device. Your Data."
Subtitle: "100% local. Zero data sent."
