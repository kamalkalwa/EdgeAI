/**
 * A Trust Panel log that the service worker keeps, in memory and in
 * chrome.storage.local under one key. The worker is the only writer. Other
 * contexts report entries to it by message: an offscreen document has no
 * chrome.storage at all, and with a single writer no two contexts can read the
 * list, add to it and write it back over each other.
 */
export class StoredLog<T extends { id: string }> {
  private entries: T[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  /** Settles once the stored entries are in memory. */
  private readonly loaded: Promise<void>;
  private readonly key: string;
  private readonly max: number;
  private readonly onPersisted: () => void;

  /**
   * `sanitize` checks what storage holds, entry by entry. `onPersisted` runs
   * after each write, so an open Trust Panel can refresh.
   */
  constructor(options: {
    key: string;
    max: number;
    sanitize: (stored: unknown) => T[];
    onPersisted: () => void;
  }) {
    this.key = options.key;
    this.max = options.max;
    this.onPersisted = options.onPersisted;
    // Entries can arrive while the stored log is still loading; keep both.
    this.loaded = chrome.storage.local.get(this.key)
      .then((result) => {
        const recordedMeanwhile = this.entries;
        this.entries = this.append(options.sanitize(result[this.key]), recordedMeanwhile);
      })
      .catch(console.error);
  }

  record(entries: T[]): void {
    if (entries.length === 0) return;
    this.append(this.entries, entries);
    clearTimeout(this.persistTimer);
    // Short debounce: a model download reports dozens of files in bursts. The
    // worker stays up for 30 s after the message that scheduled this.
    this.persistTimer = setTimeout(async () => {
      await this.loaded;
      await chrome.storage.local.set({ [this.key]: this.entries }).catch(console.error);
      this.onPersisted();
    }, 500);
  }

  async read(): Promise<T[]> {
    await this.loaded;
    return [...this.entries];
  }

  async clear(): Promise<void> {
    // After the load, or the stored entries would come back.
    await this.loaded;
    this.entries = [];
    clearTimeout(this.persistTimer);
    await chrome.storage.local.set({ [this.key]: [] }).catch(console.error);
  }

  /**
   * Adds the entries `log` doesn't already hold (a report can arrive twice),
   * then drops the oldest beyond `max`.
   */
  private append(log: T[], entries: T[]): T[] {
    const seen = new Set(log.map((e) => e.id));
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      log.push(entry);
    }
    if (log.length > this.max) log.splice(0, log.length - this.max);
    return log;
  }
}
