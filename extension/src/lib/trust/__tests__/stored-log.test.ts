import { describe, it, expect, vi, afterEach } from 'vitest';
import { StoredLog } from '../stored-log';

interface Item { id: string }
const item = (id: string): Item => ({ id });
const ids = (items: Item[]) => items.map((i) => i.id);

/** chrome.storage.local over a plain object; `get` can be held until `release()`. */
function fakeStorage(initial: Record<string, unknown> = {}, { hold = false } = {}) {
  const data: Record<string, unknown> = structuredClone(initial);
  let release = () => {};
  const loaded = hold ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve();
  const local = {
    get: vi.fn(async (key: string) => { await loaded; return { [key]: structuredClone(data[key]) }; }),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(data, structuredClone(items)); }),
  };
  vi.stubGlobal('chrome', { storage: { local } });
  return { data, local, release };
}

const sanitize = (stored: unknown) => (Array.isArray(stored) ? (stored as Item[]) : []);

function newLog(max = 10) {
  const onPersisted = vi.fn();
  const log = new StoredLog<Item>({ key: 'log', max, sanitize, onPersisted });
  return { log, onPersisted };
}

describe('StoredLog', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts from what storage holds, and keeps what was recorded while it loaded', async () => {
    const storage = fakeStorage({ log: [item('stored')] }, { hold: true });
    const { log } = newLog();
    log.record([item('early')]);
    storage.release();
    expect(ids(await log.read())).toEqual(['stored', 'early']);
  });

  it('checks what storage holds', async () => {
    fakeStorage({ log: 'not a list' });
    const { log } = newLog();
    expect(await log.read()).toEqual([]);
  });

  it('ignores entries it already holds (a report can arrive twice)', async () => {
    fakeStorage();
    const { log } = newLog();
    log.record([item('a'), item('b')]);
    log.record([item('b'), item('c'), item('c')]);
    expect(ids(await log.read())).toEqual(['a', 'b', 'c']);
  });

  it('keeps the newest entries up to its cap', async () => {
    fakeStorage({ log: [item('0'), item('1')] });
    const { log } = newLog(3);
    for (let i = 2; i < 6; i++) log.record([item(String(i))]);
    expect(ids(await log.read())).toEqual(['3', '4', '5']);
  });

  it('writes a burst once, then says so', async () => {
    vi.useFakeTimers();
    const storage = fakeStorage();
    const { log, onPersisted } = newLog();
    log.record([item('a')]);
    log.record([item('b')]);
    await vi.advanceTimersByTimeAsync(400);
    log.record([item('c')]);
    await vi.advanceTimersByTimeAsync(500);
    expect(storage.local.set).toHaveBeenCalledTimes(1);
    expect(ids(storage.data['log'] as Item[])).toEqual(['a', 'b', 'c']);
    expect(onPersisted).toHaveBeenCalledTimes(1);
  });

  it('clears memory and storage, and drops the write it had pending', async () => {
    vi.useFakeTimers();
    const storage = fakeStorage({ log: [item('old')] });
    const { log } = newLog();
    log.record([item('new')]);
    await log.clear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await log.read()).toEqual([]);
    expect(storage.data['log']).toEqual([]);
    expect(storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('hands out a copy, not the log itself', async () => {
    fakeStorage();
    const { log } = newLog();
    log.record([item('a')]);
    (await log.read()).push(item('b'));
    expect(ids(await log.read())).toEqual(['a']);
  });
});
