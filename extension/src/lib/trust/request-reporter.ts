/**
 * Reports the network requests of the page (or worker) it runs in to the
 * Trust Panel's log.
 *
 * Every EdgeAI page that runs code calls this once, before anything else, and
 * so does the service worker; __tests__/reporter-coverage.test.ts fails if a
 * page entry point stops doing so. Resource timing covers fetch(), XHR, Cache
 * API downloads (web-llm's path), script and module loads, and requests that
 * fail or are blocked (status 0). A request cancelled partway can leave no
 * entry at all: Chrome records none for a Cache API download it gives up on,
 * as it does when the disk is nearly full. An entry is reported when its
 * request finishes, so a download in progress appears once it completes.
 */

import { toNetworkEntry, type NetworkEntry } from './network-monitor';

export function reportNetworkRequests(
  context: string,
  deliver: (entries: NetworkEntry[]) => void = sendToServiceWorker,
): void {
  if (typeof PerformanceObserver === 'undefined') return;
  const { timeOrigin } = performance;
  const observer = new PerformanceObserver((list) => {
    const entries = list.getEntries()
      .map((e) => toNetworkEntry(e as PerformanceResourceTiming, context, timeOrigin))
      .filter((e): e is NetworkEntry => e !== null);
    if (entries.length > 0) deliver(entries);
  });
  // buffered: also report whatever the page fetched before this line ran.
  observer.observe({ type: 'resource', buffered: true });
}

function sendToServiceWorker(entries: NetworkEntry[]): void {
  chrome.runtime.sendMessage({ type: 'NETWORK_ENTRIES', payload: entries }).catch(() => {
    // Only fails while the extension is being reloaded or updated.
  });
}
