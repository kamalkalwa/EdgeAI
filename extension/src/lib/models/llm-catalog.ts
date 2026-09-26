/**
 * The two LLMs EdgeAI can load. llm-models.json is the one list shared by the
 * offscreen document (which model to load), the popup (its name and download
 * size) and the build (scripts/model-libs.mjs bundles each one's WebGPU
 * library). Download sizes are the weight shards listed in each model's
 * tensor-cache.json on Hugging Face (2.158 GB and 0.695 GB) plus tokenizer,
 * rounded.
 */

import models from './llm-models.json';

export interface LlmModel {
  id: string;
  label: string;
  download: string;
}

export const DEFAULT_LLM: LlmModel = models.default;
export const FALLBACK_LLM: LlmModel = models.fallback;

export function findLlm(id: string): LlmModel | undefined {
  return [DEFAULT_LLM, FALLBACK_LLM].find((m) => m.id === id);
}
