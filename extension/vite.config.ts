import { defineConfig, type Plugin } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

/**
 * Copies ONNX Runtime WASM files to dist/ort/ with their original names.
 *
 * ONNX Runtime dynamically imports its .mjs bootstrap module and fetches the
 * .wasm binary at runtime. In a Chrome extension, CSP blocks loading these from
 * CDN or blob: URLs. By copying them into the extension's own assets and setting
 * wasmPaths to chrome.runtime.getURL('ort/'), ONNX Runtime can load them as
 * same-origin extension resources.
 */
function copyOrtWasmFiles(): Plugin {
  return {
    name: 'copy-ort-wasm',
    writeBundle() {
      const ortDist = resolve(__dirname, 'node_modules/onnxruntime-web/dist');
      const outDir = resolve(__dirname, 'dist/ort');
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

      const files = [
        'ort-wasm-simd-threaded.mjs',
        'ort-wasm-simd-threaded.wasm',
        'ort-wasm-simd-threaded.jsep.mjs',
        'ort-wasm-simd-threaded.jsep.wasm',
      ];
      for (const file of files) {
        const src = resolve(ortDist, file);
        if (existsSync(src)) {
          copyFileSync(src, resolve(outDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    crx({ manifest }),
    copyOrtWasmFiles(),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        // Additional HTML entry points beyond what manifest.json specifies
        popup: resolve(__dirname, 'src/popup/popup.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
        stealth: resolve(__dirname, 'src/stealth/stealth.html'),
        'mic-grant': resolve(__dirname, 'src/mic-grant/mic-grant.html'),
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
