import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { resolveModelLibs, OUT_DIR as MODEL_LIB_DIR, INDEX_FILE as MODEL_LIB_INDEX } from './scripts/model-libs.mjs';

function getGitCommit(): string {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(); }
  catch { return 'unknown'; }
}

/**
 * Copies ONNX Runtime's runtime files to dist/ort/ with their original names.
 *
 * ONNX Runtime dynamically imports its .mjs bootstrap module and fetches the
 * .wasm binary at runtime. In a Chrome extension, CSP blocks loading these from
 * CDN or blob: URLs. By copying them into the extension's own assets and setting
 * wasmPaths to chrome.runtime.getURL('ort/'), ONNX Runtime can load them as
 * same-origin extension resources.
 *
 * transformers.js 4 imports `onnxruntime-web/webgpu`, whose 1.31 build uses the
 * `asyncify` variant for every device (WebGPU and WASM alike). The build fails
 * if it is missing rather than shipping a package that cannot load a model.
 */
function copyOrtWasmFiles(): Plugin {
  return {
    name: 'copy-ort-wasm',
    writeBundle() {
      const ortDist = resolve(__dirname, 'node_modules/onnxruntime-web/dist');
      const outDir = resolve(__dirname, 'dist/ort');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      const files = [
        'ort-wasm-simd-threaded.asyncify.mjs',
        'ort-wasm-simd-threaded.asyncify.wasm',
      ];
      for (const file of files) {
        const src = resolve(ortDist, file);
        if (!existsSync(src)) {
          throw new Error(`ONNX Runtime file missing: ${src} — the installed onnxruntime-web no longer ships it; update copyOrtWasmFiles in vite.config.ts`);
        }
        copyFileSync(src, resolve(outDir, file));
      }
    },
  };
}

/**
 * Fails the build if the web-llm model libraries are not bundled.
 *
 * web-llm would otherwise fetch them from raw.githubusercontent.com at runtime,
 * which is remotely hosted code — not allowed in a Chrome Web Store extension.
 * `npm run fetch:model-libs` downloads them into public/mlc/ (Vite copies
 * public/ into dist/) and records their URLs + hashes in libs.json, which the
 * offscreen document uses to seed web-llm's cache.
 */
function verifyModelLibs(): Plugin {
  return {
    name: 'verify-model-libs',
    buildStart() {
      const hint = 'run `npm run fetch:model-libs` and rebuild';
      const indexPath = resolve(MODEL_LIB_DIR, MODEL_LIB_INDEX);
      if (!existsSync(indexPath)) throw new Error(`Bundled web-llm model libraries missing (${indexPath}) — ${hint}`);
      const index = JSON.parse(readFileSync(indexPath, 'utf-8')) as { libs: { url: string; file: string; sha256: string }[] };
      for (const lib of resolveModelLibs().libs) {
        const bundled = index.libs.find((l) => l.url === lib.url);
        const file = bundled ? resolve(MODEL_LIB_DIR, bundled.file) : null;
        if (!bundled || !file || !existsSync(file)) {
          throw new Error(`Bundled model library for ${lib.modelId} is missing or does not match the installed web-llm (${lib.url}) — ${hint}`);
        }
        const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
        if (sha256 !== bundled.sha256) {
          throw new Error(`${bundled.file} does not match the hash recorded in ${MODEL_LIB_INDEX} (corrupt or partial download) — ${hint}`);
        }
      }
    },
  };
}

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(getGitCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_VERSION__: JSON.stringify(manifest.version),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    crx({ manifest }),
    copyOrtWasmFiles(),
    verifyModelLibs(),
  ],
  build: {
    outDir: 'dist',
    sourcemap: !isProduction,
    minify: isProduction ? 'terser' : 'esbuild',
    terserOptions: isProduction ? {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    } : undefined,
    rollupOptions: {
      input: {
        // Additional HTML entry points beyond what manifest.json specifies
        popup: resolve(__dirname, 'src/popup/popup.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
        stealth: resolve(__dirname, 'src/stealth/stealth.html'),
        'mic-grant': resolve(__dirname, 'src/mic-grant/mic-grant.html'),
        privacy: resolve(__dirname, 'src/privacy/privacy.html'),
      },
      output: {
        // Keep chunks readable for debugging
        chunkFileNames: 'chunks/[name]-[hash].js',
        // Split large dependencies into separate chunks
        manualChunks: {
          'web-llm': ['@mlc-ai/web-llm'],
          'transformers': ['@huggingface/transformers'],
          'orama': ['@orama/orama'],
          'dexie': ['dexie'],
        },
      },
    },
  },
  // Required for SharedArrayBuffer (transformers.js multi-threading)
  // Note: extension pages have COOP/COEP by default via manifest CSP
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
