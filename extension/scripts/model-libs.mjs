/**
 * Resolves which web-llm model libraries this build must bundle.
 *
 * web-llm ships a prebuilt config whose `model_lib` entries point at
 * raw.githubusercontent.com. The Chrome Web Store forbids executing code the
 * package did not ship, so we bundle those .wasm files (see
 * fetch-model-libs.mjs) and the offscreen document seeds web-llm's cache from
 * them. The URL, version and file names are read from the installed web-llm
 * so an upgrade cannot silently leave stale libraries in the package.
 *
 * Regexing the bundle is admittedly brittle. web-llm cannot be imported in
 * Node (its bundle calls require() from ESM), so there is no cleaner source;
 * the failure mode is a loud build error, not a wrong file.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODEL_IDS = ['Phi-4-mini-instruct-q4f16_1-MLC', 'Llama-3.2-1B-Instruct-q4f16_1-MLC'];
export const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/mlc');
export const INDEX_FILE = 'libs.json';

export function resolveModelLibs() {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('@mlc-ai/web-llm/package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const src = fs.readFileSync(path.join(path.dirname(pkgPath), pkg.module || pkg.main), 'utf8');

  const prefix = src.match(/https:\/\/raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/main\/web-llm-models\//)?.[0];
  const modelVersion = src.match(/modelVersion\s*=\s*["']([^"']+)["']/)?.[1];
  if (!prefix || !modelVersion) {
    throw new Error('Could not find the model library URL prefix / version in @mlc-ai/web-llm; its config layout changed — update scripts/model-libs.mjs');
  }

  const libs = MODEL_IDS.map((modelId) => {
    const at = src.indexOf(`"${modelId}"`);
    if (at < 0) throw new Error(`${modelId} is not in web-llm's prebuilt config`);
    // In each record `model_lib` follows `model_id`: model_lib: prefix + version + "/<file>.wasm"
    const file = src.slice(at, at + 600).match(/"\/([A-Za-z0-9._-]+-webgpu\.wasm)"/)?.[1];
    if (!file || !file.startsWith(modelId.replace(/-MLC$/, ''))) {
      throw new Error(`model_lib for ${modelId} not found next to its record (got ${file ?? 'nothing'})`);
    }
    return { modelId, file, url: `${prefix}${modelVersion}/${file}` };
  });

  return { webllmVersion: pkg.version, modelVersion, libs };
}
