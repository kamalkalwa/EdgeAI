# Running a 3.8B model inside a Chrome extension

*Kamal Kalwa, September 2026. Notes from building [EdgeAI](https://github.com/kamalkalwa/EdgeAI), a Manifest V3 extension that runs Phi-3.5-mini, an embedding model, a reranker and speech recognition on the user's GPU.*

The reason to do this in an extension rather than a native app was that people already have Chrome, Chrome already has WebGPU, and an extension can see your tabs and bookmarks without asking for anything else. What I didn't appreciate in February was how much of the work would be arguing with Manifest V3 about where code is allowed to run.

## Three contexts, none of them right

MV3 gives you a service worker, a popup, and content scripts. The service worker is killed after about 30 seconds of inactivity and has no WebGPU. The popup is destroyed the moment it loses focus, which is a bad place to hold 2.3 GB of weights. Content scripts run inside someone else's page, under that page's rules.

The fourth option is the offscreen document (`chrome.offscreen.createDocument`). It's a hidden extension page with DOM APIs, IndexedDB, `getUserMedia` and WebGPU, and Chrome keeps it alive as long as you claim a reason for it. EdgeAI claims `AUDIO_PLAYBACK` and `USER_MEDIA`. Every model lives there. The service worker became a router: popup and content scripts send a message, the worker forwards it with `_target: 'offscreen'`, the offscreen document answers, tokens stream back as `CHAT_CHUNK` broadcasts carrying a request id so two chats don't interleave.

The worker still dies. A content script on every tab pings it every 25 seconds. I'm not proud of it. I also haven't found anyone doing long-running MV3 work who does anything else.

## The CSP

Extension pages get `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'`, and MV3 does not let you loosen it. transformers.js runs on ONNX Runtime Web, and ONNX Runtime's WebGPU backend bootstraps through a dynamic `import()` — of its `.mjs` glue from a CDN by default, of a `blob:` URL when you point it at local files. Blocked either way. The multi-threaded WASM path does the same thing to spin up its worker pool. Also blocked.

What works: copy the four ORT files (`ort-wasm-simd-threaded.{mjs,wasm}` and the `.jsep` pair) into `dist/ort/` at build time with a small Vite plugin, set `env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('ort/')`, set `proxy = false`, set `numThreads = 1`, and request `device: 'wasm'` for every transformers.js pipeline. So the embedding model, the reranker and Moonshine all run on one WASM thread. The LLM is the only thing on the GPU, via web-llm, which has its own runtime and never hit the problem.

It shows. bge-small on a single WASM thread is the bottleneck when you index a vault. I haven't measured it properly on anything but my own machine. There's a queue and a progress bar and it gets there.

## Code you didn't ship

This one I found today, six months after the last commit, while filling in the store listing. The form asks "are you using remote code?" and the draft said no. web-llm's prebuilt config points each model's compiled WebGPU library — a 5.5 MB `.wasm` — at `raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs`, and fetches it on first load. Weights are data. A compiled kernel library is code, and the Web Store's remote-code rule covers WebAssembly as well as JavaScript.

Bundling it isn't as simple as changing the URL. web-llm stores the library through the Cache API under its URL, and `Cache.put` rejects any request whose scheme isn't http or https — `chrome-extension://` included. So the fix leaves web-llm's URL alone and seeds the cache instead: at startup the offscreen document opens `caches.open('webllm/wasm')`, checks for a match on the URL web-llm is about to ask for, and if there's none, fetches the bundled file from the package and `put`s the bytes under the remote URL. web-llm gets a cache hit and never goes to GitHub. A script reads the URL prefix, model version and file names out of the installed web-llm at build time, so upgrading the package and forgetting to refetch fails the build instead of shipping a stale library.

## Things that only showed up after a restart

Orama keeps its BM25 index in memory. The first version persisted embeddings to IndexedDB and rebuilt Orama from nothing. Search worked until the extension restarted; after that the vector half still answered and the BM25 half was empty. Now the rows that went into Orama are persisted next to the embeddings and re-inserted on `init()`.

Another: a `LOAD_MODEL` message could arrive while the auto-init on page load was still running. Both callers saw `embeddingModel === null`, both started loading, and the global got assigned before `load()` finished, so `handleChat` would find a model object whose pipeline was still null. "Embedding model not loaded", with the model visibly loaded. The fix was boring — assign the global only after `load()` resolves, and keep one `_initPromise` that late callers join.

And one from today: `GPUAdapter.requestAdapterInfo()` was removed in Chrome 131; `adapter.info` replaced it. The hardware check called it inside a try/catch whose catch returned the fallback model. On any current Chrome the call throws and the machine gets Llama-3.2-1B, including the M-series Macs the Phi-3.5 path was written for. I noticed it reading the code, not from the UI.

## The Trust Panel logged everyone

The point of the extension is that you can check its claims. The Trust Panel has a network log built on `chrome.webRequest.onCompleted` with `<all_urls>`, and the "zero external requests" badge is computed from it. What I'd missed is that `onCompleted` reports every request from every tab. The log filled with whatever sites the user was reading, and the badge went yellow the moment they opened a news page. A privacy extension keeping a browsing history. The fix is one line — drop anything whose `initiator` isn't the extension's own origin — and it also made the permission justification true: the extension observes only its own requests.

## Voice

`MediaRecorder` hands you WebM/Opus chunks on a timeslice, and you can't decode a chunk on its own; the container header only exists in the first one. So the voice loop keeps every chunk, and every 250 ms concatenates the lot, decodes the whole thing to 16 kHz float samples, and runs Silero VAD over only the samples it hasn't seen yet. Transcription happens when VAD sees the silence that ends a segment, not every cycle. It's a lot of redundant decoding for a two-minute recording. It's fine for the ten-second questions people actually ask. An AudioWorklet would be the proper answer, and `worker-src 'self'` should allow one loaded from an extension URL. Haven't tried.

## What I'd change

Vector search is brute-force cosine over a `Map`. The landing page said HNSW for six months; it was never HNSW. Brute force is fine to maybe 50K chunks and the honest thing is to say so.

I'd like to know whether the worklet idea works.

## Postscript, September 18

The embeddings are on the GPU now, and the 21 MB JSEP file is gone. Both came from the same upgrade. transformers.js 4 (February) moved to ONNX Runtime 1.31, and 1.31's WebGPU build no longer needs the `blob:` detour: read the import code and the preload path is only taken when the runtime is multi-threaded *and* the files are cross-origin. Single-threaded, same-origin `wasmPaths` — the configuration I'd already been forced into for WASM — gets a plain `import()` of a `chrome-extension://` URL, which `'self'` allows. Its WebGPU build ships as the `asyncify` variant, one 25 MB file instead of the 11 + 21 I was copying before. The reranker and the VAD I left on WASM; int8 doesn't gain from the GPU and they'd fight the LLM for it.

Same upgrade, the model: Phi-3.5-mini became Phi-4-mini, which is the same family, a slightly smaller download, needs slightly less GPU memory, and is better. Qwen3.5-4B looked stronger on paper and I nearly shipped it, until I grepped web-llm for `enable_thinking` and got nothing. Its reasoning mode is a chat-template switch web-llm doesn't expose, and I wasn't going to debug `<think>` blocks in answers the week of a store submission.

September 20, one more, and it's the embarrassing kind. The voice loop had been running without its VAD for months. The fallback when the VAD isn't loaded is "treat every frame as speech and wait for the stop button", which from the outside looks like a working feature, just a slightly sluggish one. What gave it away was the resource log from the headless check: a failed request to `Xenova/silero-vad`, a repository that no longer exists. Its replacement under `onnx-community` ships the bare graph with no `config.json`, so the `audio-classification` pipeline can't wrap it; you load it as a raw model with an inline config and drive the graph yourself — 512-sample frames, a 16 kHz scalar, and the LSTM state tensor you hand back on every call. About twenty lines, plus one I'd not have guessed: pass a `progress_callback` and transformers.js HEADs every expected file first to size the bar, including the config that isn't there. Drop the callback for a 2 MB model and the network log shows exactly one request. Chromium can play a WAV file as the microphone (`--use-file-for-fake-audio-capture`, and on macOS the audio service sandbox has to be off or you get silence), so the check that caught it now also transcribes JFK and stops itself on the trailing quiet.

September 24, and this one takes back a section above. The initiator filter in "The Trust Panel logged everyone" did stop the log recording other tabs. It also left it with nothing to record, because Chrome doesn't deliver an extension's own requests to that extension's `webRequest` listeners. Everything the listener had ever seen was other tabs' traffic. After the filter the log could only be empty, and the zero-requests badge was green because nothing could turn it yellow. The one check I'd built so other people could verify EdgeAI never checked anything.

The log now comes from resource timing. Every EdgeAI page, and the service worker, runs a `PerformanceObserver` on `resource` entries with `buffered: true` and sends what it sees to the worker, which keeps the only copy. That catches plain `fetch`, the Cache API downloads web-llm uses for the weights, and requests that fail or get blocked, which show up with status 0. A unit test reads the source and fails if a page stops reporting or anything starts a worker, since a worker's requests land in a timeline no page can see. It's still the extension reporting on itself, so the privacy policy now walks through watching the same traffic in DevTools. One gap I know of: when Chrome gives up on a Cache API write partway through, there's no timing entry at all. I found that with 3.7 GB of free disk. The Phi-4 shards stopped a few megabytes in, the log showed nothing, and the popup told me to check my internet connection.

With `webRequest` gone, most of the permissions had no reason left. Host permissions for every site were also there so bookmark import could fetch each bookmarked page; it now imports titles and URLs, and asks for `bookmarks` the first time you use it. The content script on every tab is gone. Its keepalive ping was never needed — nothing slow runs in the worker, and when Chrome stops it the next message starts it again. Its other job, reading the page, is now `activeTab` plus `scripting.executeScript` at the moment you click, and nothing stays in the page afterwards. `web_accessible_resources` went too. It listed the extension's built files as loadable from `<all_urls>`, so any site could find out whether EdgeAI was installed by requesting one of them. The cost is the side panel: a click inside it doesn't count as invoking the extension, so it can only index a tab you opened EdgeAI on from the toolbar. Chrome also hides the URL of any tab you haven't been granted, your own extension's pages included, so telling someone they're trying to index EdgeAI's onboarding tab took `chrome.runtime.getContexts`.
