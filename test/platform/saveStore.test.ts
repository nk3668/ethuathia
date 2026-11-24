import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSaveStore,
  IndexedDbSaveStore,
  isTauriRuntime,
  MemorySaveStore,
  startAutosave,
  subscribeTauriClose,
  TauriSaveStore,
} from '../../src/platform';
import type { AutosaveTarget, TauriCloseEvent, TauriCloseWindow, TauriInvoker } from '../../src/platform';

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

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  function fakeInvoker() {
    let saved: string | null = null;
    const calls: { command: string; args?: Record<string, unknown> }[] = [];
    const invoke: TauriInvoker = async <T = unknown>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      switch (command) {
        case 'load_save':
          return saved as T;
        case 'write_save':
          saved = String(args?.data ?? '');
          return undefined as T;
        case 'clear_save':
          saved = null;
          return undefined as T;
        default:
          throw new Error(`Unexpected command: ${command}`);
      }
    };
    return { invoke, calls };
  }

  it('returns null when no save exists, round-trips save/load, and clears', async () => {
    const { invoke, calls } = fakeInvoker();
    const store = new TauriSaveStore(invoke);
    expect(store.label).toBe('app data folder');

    expect(await store.load()).toBeNull();
    await store.save('{"version":1}');
    expect(await store.load()).toBe('{"version":1}');
    await store.clear();
    expect(await store.load()).toBeNull();

    expect(calls).toEqual([
      { command: 'load_save', args: undefined },
      { command: 'write_save', args: { data: '{"version":1}' } },
      { command: 'load_save', args: undefined },
      { command: 'clear_save', args: undefined },
      { command: 'load_save', args: undefined },
    ]);
  });

  it('forwards backend errors from load, save and clear', async () => {
    const failing: TauriInvoker = () => Promise.reject(new Error('disk full'));
    const store = new TauriSaveStore(failing);
    await expect(store.load()).rejects.toThrow('disk full');
    await expect(store.save('payload')).rejects.toThrow('disk full');
    await expect(store.clear()).rejects.toThrow('disk full');
  });
});

describe('createSaveStore', () => {
  it('picks TauriSaveStore in Tauri, IndexedDbSaveStore in a browser, and MemorySaveStore otherwise', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('indexedDB', undefined);
    expect(isTauriRuntime()).toBe(false);
    expect(createSaveStore()).toBeInstanceOf(MemorySaveStore);

    vi.stubGlobal('indexedDB', fakeIndexedDb().factory);
    expect(createSaveStore()).toBeInstanceOf(IndexedDbSaveStore);

    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(isTauriRuntime()).toBe(true);
    expect(createSaveStore()).toBeInstanceOf(TauriSaveStore);
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

  it('awaits async save on close-requested hook and unsubscribes when stopped', async () => {
    const win = fakeWindow();
    let resolveSave!: () => void;
    const saveDone = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    const save = vi.fn(() => saveDone);
    const unlisten = vi.fn();
    const hook: { fn: (() => void | Promise<void>) | null } = { fn: null };

    const stop = startAutosave(save, {
      target: win.target,
      onCloseRequested: (cb) => {
        hook.fn = cb;
        return Promise.resolve(unlisten);
      },
    });
    await Promise.resolve();

    expect(hook.fn).not.toBeNull();
    let finished = false;
    const pending = Promise.resolve(hook.fn?.()).then(() => {
      finished = true;
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);

    resolveSave();
    await pending;
    expect(finished).toBe(true);

    stop();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes once an async close subscription resolves after stop()', async () => {
    const win = fakeWindow();
    const unlisten = vi.fn();
    let resolveSubscribe!: (fn: () => void) => void;

    const stop = startAutosave(vi.fn(), {
      target: win.target,
      onCloseRequested: () =>
        new Promise<() => void>((resolve) => {
          resolveSubscribe = resolve;
        }),
    });

    stop();
    expect(unlisten).not.toHaveBeenCalled();

    resolveSubscribe(unlisten);
    await Promise.resolve();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeTauriClose', () => {
  function fakeCloseWindow() {
    const destroyed = vi.fn(() => Promise.resolve());
    const unlisten = vi.fn();
    let handler: ((event: TauriCloseEvent) => void | Promise<void>) | undefined;
    const win: TauriCloseWindow = {
      onCloseRequested: (fn) => {
        handler = fn;
        return Promise.resolve(unlisten);
      },
      destroy: destroyed,
    };
    return {
      win,
      destroyed,
      unlisten,
      fire: (event: TauriCloseEvent) => {
        if (!handler) throw new Error('close handler not registered');
        return handler(event);
      },
    };
  }

  it('prevents default immediately, awaits onClose once despite re-entry, and destroys window in finally', async () => {
    const fake = fakeCloseWindow();

    let releaseSave!: () => void;
    const onClose = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );

    const stop = await subscribeTauriClose(onClose, fake.win);
    const event1 = { preventDefault: vi.fn() };
    const event2 = { preventDefault: vi.fn() };

    const first = fake.fire(event1);
    const second = fake.fire(event2);
    expect(event1.preventDefault).toHaveBeenCalledTimes(1);
    expect(event2.preventDefault).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fake.destroyed).not.toHaveBeenCalled();

    releaseSave();
    await first;
    await second;
    expect(fake.destroyed).toHaveBeenCalledTimes(1);

    stop();
    expect(fake.unlisten).toHaveBeenCalledTimes(1);
  });

  it('still destroys the window if onClose rejects', async () => {
    const fake = fakeCloseWindow();

    await subscribeTauriClose(() => Promise.reject(new Error('write error')), fake.win);
    await expect(fake.fire({ preventDefault: vi.fn() })).rejects.toThrow('write error');
    expect(fake.destroyed).toHaveBeenCalledTimes(1);
  });
});
