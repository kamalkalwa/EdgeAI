import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    crx({ manifest }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        // Additional HTML entry points beyond what manifest.json specifies
        popup: resolve(__dirname, 'src/popup/popup.html'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
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
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
