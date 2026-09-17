/**
 * Downloads the web-llm model libraries into public/mlc/ so the build can
 * bundle them, and writes libs.json (URL → file, sha256) for the offscreen
 * document and the build-time check. Re-run after upgrading @mlc-ai/web-llm.
 *
 *   npm run fetch:model-libs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveModelLibs, OUT_DIR, INDEX_FILE } from './model-libs.mjs';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const { webllmVersion, modelVersion, libs } = resolveModelLibs();
fs.mkdirSync(OUT_DIR, { recursive: true });

const indexPath = path.join(OUT_DIR, INDEX_FILE);
const previous = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')).libs ?? [] : [];

const out = [];
for (const lib of libs) {
  const dest = path.join(OUT_DIR, lib.file);
  const known = previous.find((p) => p.url === lib.url);
  let buf = null;
  if (known && fs.existsSync(dest)) {
    const onDisk = fs.readFileSync(dest);
    if (sha256(onDisk) === known.sha256) {
      buf = onDisk;
      console.log(`keep   ${lib.file} (${(buf.length / 1e6).toFixed(1)} MB, unchanged)`);
    }
  }
  if (!buf) {
    console.log(`fetch  ${lib.url}`);
    const res = await fetch(lib.url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${lib.url}`);
    buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    console.log(`wrote  ${dest} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
  out.push({ ...lib, bytes: buf.length, sha256: sha256(buf) });
}

fs.writeFileSync(indexPath, JSON.stringify({ webllmVersion, modelVersion, libs: out }, null, 2) + '\n');
console.log(`index  ${indexPath}`);
