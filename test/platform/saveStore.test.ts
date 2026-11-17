import { describe, expect, it, vi } from 'vitest';
import { IndexedDbSaveStore, MemorySaveStore, startAutosave, TauriSaveStore } from '../../src/platform';
import type { AutosaveTarget } from '../../src/platform';

/**
 * Just enough of IndexedDB for `IndexedDbSaveStore`: databases of key-value object stores, with
 * request and transaction callbacks fired asynchronously as the real thing does.
 */
function fakeIndexedDb(): { factory: IDBFactory; opens: () => number } {
  const databases = new Map<string, Map<string, Map<unknown, unknown>>>();
  let opens = 0;
  const later = (fn: () => void) => setTimeout(fn, 0);

  const factory = {
    open(name: string) {
      opens++;
      const req: Record<string, unknown> = { error: null };
      later(() => {
        const isNew = !databases.has(name);
        const stores = databases.get(name) ?? new Map<string, Map<unknown, unknown>>();
        databases.set(name, stores);
        req.result = {
          objectStoreNames: { contains: (s: string) => stores.has(s) },
          createObjectStore: (s: string) => stores.set(s, new Map()),
          transaction: (s: string) => {
            const tx: Record<string, unknown> = { error: null };
            const data = stores.get(s);
            if (!data) throw new Error(`no store ${s}`);
            const request = (result: unknown) => {
              later(() => (tx.oncomplete as () => void)());
              return { result };
            };
            tx.objectStore = () => ({
              get: (key: unknown) => request(data.get(key)),
              put: (value: unknown, key: unknown) => request(data.set(key, value) && key),
              delete: (key: unknown) => request(data.delete(key) && undefined),
            });
            return tx;
          },
        };
        if (isNew) (req.onupgradeneeded as (() => void) | undefined)?.();
        (req.onsuccess as () => void)();
      });
      return req;
    },
  };
  return { factory: factory as unknown as IDBFactory, opens: () => opens };
}

describe('MemorySaveStore', () => {
  it('saves, loads and clears', async () => {
    const store = new MemorySaveStore();
    expect(await store.load()).toBeNull();
    await store.save('abc');
    expect(await store.load()).toBe('abc');
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});

describe('IndexedDbSaveStore', () => {
  it('saves, loads and clears through IndexedDB, opening the database once', async () => {
    const { factory, opens } = fakeIndexedDb();
    const store = new IndexedDbSaveStore(factory);
    expect(await store.load()).toBeNull();
    await store.save('{"a":1}');
    expect(await store.load()).toBe('{"a":1}');
    // A second store on the same database sees the save.
    expect(await new IndexedDbSaveStore(factory).load()).toBe('{"a":1}');
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(opens()).toBe(2);
  });
});

describe('TauriSaveStore', () => {
  it('is a stub that refuses every call', async () => {
    const store = new TauriSaveStore();
    await expect(store.load()).rejects.toThrow(/not available yet/);
    await expect(store.save('x')).rejects.toThrow(/not available yet/);
    await expect(store.clear()).rejects.toThrow(/not available yet/);
  });
});

describe('startAutosave', () => {
  function fakeWindow() {
    const listeners = new Map<string, Set<() => void>>();
    let timer: (() => void) | null = null;
    const target: AutosaveTarget & { document: { visibilityState: string } } = {
      document: { visibilityState: 'visible' },
      addEventListener: (type, fn) => listeners.set(type, (listeners.get(type) ?? new Set()).add(fn)),
      removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
      setInterval: (fn) => {
        timer = fn;
        return 1;
      },
      clearInterval: () => {
        timer = null;
      },
    };
    const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());
    return { target, fire, tick: () => timer?.() };
  }

  it('saves on the interval, on close and when the page is hidden, until stopped', () => {
    const save = vi.fn();
    const win = fakeWindow();
    const stop = startAutosave(save, { target: win.target, intervalMs: 1000 });
    win.tick();
    win.fire('beforeunload');
    win.fire('pagehide');
    win.fire('visibilitychange'); // still visible: no save
    win.target.document.visibilityState = 'hidden';
    win.fire('visibilitychange');
    expect(save).toHaveBeenCalledTimes(4);
    stop();
    win.tick();
    win.fire('beforeunload');
    expect(save).toHaveBeenCalledTimes(4);
  });
});
