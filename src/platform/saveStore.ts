/**
 * Where the save string lives (docs/ARCHITECTURE.md §6.5). Every backend is local: the game is
 * offline only, so nothing here may reach the network.
 *
 * - `MemorySaveStore`: in memory, for tests and as a fallback when no storage is available.
 * - `IndexedDbSaveStore`: the browser's IndexedDB, for the dev tab (and the webview).
 * - `TauriSaveStore`: a file in the app data folder. A stub until desktop packaging lands.
 */

export interface SaveStore {
  /** A short name for the Options screen, e.g. "browser storage". */
  readonly label: string;
  /** The saved string, or `null` if nothing has been saved yet. */
  load(): Promise<string | null>;
  save(data: string): Promise<void>;
  /** Deletes the save. */
  clear(): Promise<void>;
}

export class MemorySaveStore implements SaveStore {
  readonly label = 'memory (not kept after closing)';
  data: string | null;

  constructor(initial: string | null = null) {
    this.data = initial;
  }

  load(): Promise<string | null> {
    return Promise.resolve(this.data);
  }

  save(data: string): Promise<void> {
    this.data = data;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.data = null;
    return Promise.resolve();
  }
}

const DB_VERSION = 1;
const OBJECT_STORE = 'saves';

/** One save string under a fixed key in an IndexedDB object store. */
export class IndexedDbSaveStore implements SaveStore {
  readonly label = 'browser storage';
  private db: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory = indexedDB,
    private readonly dbName = 'ethuathia',
    private readonly key = 'profile',
  ) {}

  async load(): Promise<string | null> {
    const value = await this.request('readonly', (store) => store.get(this.key));
    return typeof value === 'string' ? value : null;
  }

  async save(data: string): Promise<void> {
    await this.request('readwrite', (store) => store.put(data, this.key));
  }

  async clear(): Promise<void> {
    await this.request('readwrite', (store) => store.delete(this.key));
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.factory.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(OBJECT_STORE)) req.result.createObjectStore(OBJECT_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open the save database.'));
      req.onblocked = () => reject(new Error('The save database is blocked by another open copy of the game.'));
    }).catch((error: unknown) => {
      this.db = null;
      throw error;
    });
    return this.db;
  }

  /** Runs one request in its own transaction and resolves when the transaction commits. */
  private async request(mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OBJECT_STORE, mode);
      const req = make(tx.objectStore(OBJECT_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? req.error ?? new Error('The save database failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('The save was cancelled.'));
    });
  }
}

/**
 * Saves to a file in the app data folder through Tauri. A stub: Tauri isn't set up yet, so
 * every call fails. Replace the bodies when packaging lands (docs/ARCHITECTURE.md §8.4).
 */
export class TauriSaveStore implements SaveStore {
  readonly label = 'app data folder';

  load(): Promise<string | null> {
    return Promise.reject(notYet());
  }

  save(_data: string): Promise<void> {
    return Promise.reject(notYet());
  }

  clear(): Promise<void> {
    return Promise.reject(notYet());
  }
}

function notYet(): Error {
  return new Error('Saving to the app data folder is not available yet: desktop packaging is not set up.');
}

/**
 * The backend for this environment: IndexedDB when the browser has it, otherwise memory.
 * Under Tauri this will pick `TauriSaveStore` once it is implemented; until then the webview's
 * IndexedDB is used there too.
 */
export function createSaveStore(): SaveStore {
  if (typeof indexedDB !== 'undefined') return new IndexedDbSaveStore(indexedDB);
  return new MemorySaveStore();
}
