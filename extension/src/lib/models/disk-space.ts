/**
 * Chrome stops saving a download to its cache when the disk is nearly full,
 * with no error that says so: web-llm reports a failed fetch, and EdgeAI told
 * the user to check their internet connection. On a 460 GB Mac, Phi-4
 * (2.2 GB) stopped downloading a few megabytes in with 3.7 GB free and
 * downloaded with 4.9 GB free. Chromium tries to keep 2 GB of a disk free
 * (storage/browser/quota/quota_settings.cc: "should remain available", the
 * lesser of 2 GB and 10% of the disk). So a download needs its own size plus
 * HEADROOM_BYTES.
 *
 * Inside EdgeAI, which has unlimitedStorage, navigator.storage.estimate()'s
 * quota minus usage is the disk's free space (measured equal to df's).
 */
export const HEADROOM_BYTES = 2.5e9;

/**
 * What to tell the user when `freeBytes` isn't enough to download
 * `bytesToDownload` more of a model; null when it is.
 */
export function notEnoughSpace(freeBytes: number, bytesToDownload: number): string | null {
  if (bytesToDownload <= 0) return null;
  const needed = bytesToDownload + HEADROOM_BYTES;
  if (freeBytes >= needed) return null;
  // Rounded apart, so the two numbers never read the same.
  const free = Math.floor(Math.max(0, freeBytes) / 1e8) / 10;
  const need = Math.ceil(needed / 1e8) / 10;
  return `Not enough disk space to download the AI model: it needs about ${need.toFixed(1)} GB free, and this computer has ${free.toFixed(1)} GB. Free up some space, then click Retry.`;
}
