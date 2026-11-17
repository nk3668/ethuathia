/**
 * `profileStore` (docs/ARCHITECTURE.md §8): the player's `Profile` (meta, §6.1), everything that
 * persists between runs. Actions call the pure meta functions, then mark the profile changed so
 * the next autosave writes it.
 *
 * `bindSaveStore(store)` loads the save, starts autosave and returns an unbind. While the save is
 * loading, or if it failed to load, nothing is written, so a save the game can't read is never
 * overwritten; importing a save or a hard reset recovers from a failed load.
 */
import { create } from 'zustand';
import { applyRunResult, decodeSave, encodeSave, newProfile } from '../../meta';
import type { Profile } from '../../meta';
import { startAutosave } from '../../platform';
import type { AutosaveOptions, SaveStore } from '../../platform';
import type { RunResult } from '../../sim';

export { totalFavor } from '../../meta';

export type SaveStatus = 'detached' | 'loading' | 'ready' | 'failed';

export interface ProfileStoreState {
  profile: Profile;
  /** `detached` until a save store is bound; `failed` if the save couldn't be read. */
  status: SaveStatus;
  /** Why the last load, save or import failed, in words for the player. */
  error: string | null;
  /** Notes from the last load or import (e.g. a part of the save that started fresh). */
  notes: readonly string[];
  /** When the profile was last written (ms since the epoch), or null. */
  lastSavedAt: number | null;
  /** The profile changed since it was last written. */
  dirty: boolean;
  /** Where saves go, for the Options screen. */
  storeLabel: string | null;

  /** Banks a finished run's rewards (meta `applyRunResult`). */
  applyRunResult(result: RunResult): void;
  /** Writes the profile now if it changed (or always, with `force`). */
  save(force?: boolean): Promise<void>;
  /** The save string, for export. */
  exportSave(): string;
  /** Replaces the profile with an imported save string after validating it. */
  importSave(text: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Erases all progress: a new profile, written at once. */
  hardReset(): Promise<void>;
}

/** The bound backend. Module state, like `simStore`'s host binding. */
let saveStore: SaveStore | null = null;
/** Bumped on every bind, so a load that finishes after an unbind is ignored. */
let binding = 0;

const INITIAL: Pick<ProfileStoreState, 'profile' | 'status' | 'error' | 'notes' | 'lastSavedAt' | 'dirty' | 'storeLabel'> = {
  profile: newProfile(),
  status: 'detached',
  error: null,
  notes: [],
  lastSavedAt: null,
  dirty: false,
  storeLabel: null,
};

export const useProfileStore = create<ProfileStoreState>()((set, get) => ({
  ...INITIAL,

  applyRunResult: (result) => {
    set((s) => ({ profile: applyRunResult(s.profile, result), dirty: true }));
  },

  save: async (force = false) => {
    const { status, dirty, profile } = get();
    const store = saveStore;
    if (!store || status !== 'ready' || (!dirty && !force)) return;
    const now = Date.now();
    try {
      await store.save(encodeSave(profile, now));
      // Only clear `dirty` if nothing changed while the write was in flight.
      set((s) => ({ lastSavedAt: now, error: null, dirty: s.profile === profile ? false : s.dirty }));
    } catch (error) {
      set({ error: `Saving failed: ${describe(error)}` });
    }
  },

  exportSave: () => encodeSave(get().profile, Date.now()),

  importSave: async (text) => {
    const decoded = decodeSave(text);
    if (!decoded.ok) return { ok: false, error: decoded.error };
    set({ profile: decoded.profile, status: 'ready', error: null, notes: decoded.notes, dirty: true });
    await get().save();
    return { ok: true };
  },

  hardReset: async () => {
    set({ profile: newProfile(), status: 'ready', error: null, notes: [], dirty: true });
    await get().save(true);
  },
}));

/** The store's starting state, for tests. */
export function resetProfileStore(): void {
  saveStore = null;
  binding++;
  useProfileStore.setState({ ...INITIAL, profile: newProfile() });
}

/**
 * Loads the profile from `store`, then autosaves to it (on an interval and when the window
 * closes). Returns a function that stops autosaving and unbinds; it writes pending changes first.
 * Resolves `loaded` when the load has finished either way.
 */
export function bindSaveStore(store: SaveStore, autosave: AutosaveOptions = {}): { unbind(): void; loaded: Promise<void> } {
  const token = ++binding;
  saveStore = store;
  useProfileStore.setState({ status: 'loading', error: null, notes: [], storeLabel: store.label });

  const loaded = store.load().then(
    (text) => {
      if (token !== binding) return;
      if (text === null) {
        useProfileStore.setState({ profile: newProfile(), status: 'ready', dirty: false });
        return;
      }
      const decoded = decodeSave(text);
      if (decoded.ok) {
        useProfileStore.setState({ profile: decoded.profile, status: 'ready', notes: decoded.notes, lastSavedAt: decoded.savedAt, dirty: false });
      } else {
        useProfileStore.setState({ status: 'failed', error: `The save could not be loaded: ${decoded.error}` });
      }
    },
    (error: unknown) => {
      if (token !== binding) return;
      useProfileStore.setState({ status: 'failed', error: `The save could not be read: ${describe(error)}` });
    },
  );

  const stopAutosave = startAutosave(() => void useProfileStore.getState().save(), autosave);
  return {
    loaded,
    unbind: () => {
      stopAutosave();
      if (token !== binding) return;
      void useProfileStore.getState().save();
      saveStore = null;
      binding++;
      useProfileStore.setState({ status: 'detached', storeLabel: null });
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
