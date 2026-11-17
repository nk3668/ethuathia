/**
 * `uiStore` (docs/ARCHITECTURE.md §8): state that belongs to the screen rather than the run or the
 * profile: which adventurer is selected, which side tab is open, whether the side drawer is open,
 * the log's height and its filter, and the map's camera mode. The log height, open tab and camera
 * mode are remembered between sessions in `localStorage`; they are per-machine conveniences, not
 * part of the save.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type { EntityId } from '../../sim';
import { isCameraMode } from '../map/camera';
import type { CameraMode } from '../map/camera';

/** The side panel's tabs, in order. */
export const SIDE_TABS = ['rules', 'town', 'codex', 'graveyard', 'stats', 'options'] as const;
export type SideTab = (typeof SIDE_TABS)[number];

export function isSideTab(value: unknown): value is SideTab {
  return (SIDE_TABS as readonly unknown[]).includes(value);
}

/** Log filters. M1 adds the categories (combat, loot, discovery, AI). */
export type LogFilter = 'all';

/** The log strip's height in CSS pixels: its default and the range dragging allows. */
export const LOG_HEIGHT = { default: 160, min: 80, max: 600 } as const;

export function clampLogHeight(height: number): number {
  if (!Number.isFinite(height)) return LOG_HEIGHT.default;
  return Math.round(Math.min(Math.max(height, LOG_HEIGHT.min), LOG_HEIGHT.max));
}

export interface UiStoreState {
  /** The selected adventurer, or `null`. */
  selected: EntityId | null;
  tab: SideTab;
  /** At narrow widths the side panel is a drawer; this says whether it is open. */
  drawerOpen: boolean;
  logHeight: number;
  logFilter: LogFilter;
  /** Whether the map follows the selected adventurer or fits the whole floor. */
  mapCamera: CameraMode;
  select(id: EntityId | null): void;
  openTab(tab: SideTab): void;
  setDrawerOpen(open: boolean): void;
  setLogHeight(height: number): void;
  setMapCamera(mode: CameraMode): void;
}

/**
 * The adventurer to select when cycling by `step` (1 next, -1 previous) through `party`, in party
 * order: the nearest living member after (or before) `selected`, wrapping around and skipping the
 * dead. With nothing selected, or a selection no longer in the party, next picks the first living
 * member and previous the last. With nobody alive the selection is left as it is.
 */
export function cycleSelection(
  party: readonly { id: EntityId; alive: boolean }[],
  selected: EntityId | null,
  step: 1 | -1,
): EntityId | null {
  const n = party.length;
  const at = party.findIndex((m) => m.id === selected);
  // Without a selection, start just outside the list so the first step lands on an end.
  const from = at === -1 ? (step === 1 ? -1 : n) : at;
  for (let k = 1; k <= n; k++) {
    const member = party[(((from + k * step) % n) + n) % n];
    if (member?.alive) return member.id;
  }
  return selected;
}

/** The fields saved to `localStorage`. */
type Remembered = Pick<UiStoreState, 'logHeight' | 'tab' | 'mapCamera'>;

export const UI_STORAGE_KEY = 'ethuathia.ui';

/**
 * `localStorage` that never throws. It can be missing (tests, private windows) or refuse writes
 * (quota, blocked site data); the UI then simply forgets between sessions.
 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage.setItem(name, value);
    } catch {
      // Not remembered this time.
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};

/** Takes only valid remembered values, so a hand-edited or old entry can't break the screen. */
function readRemembered(saved: unknown): Partial<Remembered> {
  if (typeof saved !== 'object' || saved === null) return {};
  const { logHeight, tab, mapCamera } = saved as Record<string, unknown>;
  const out: Partial<Remembered> = {};
  if (typeof logHeight === 'number') out.logHeight = clampLogHeight(logHeight);
  if (isSideTab(tab)) out.tab = tab;
  if (isCameraMode(mapCamera)) out.mapCamera = mapCamera;
  return out;
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      selected: null,
      tab: 'rules',
      drawerOpen: false,
      logHeight: LOG_HEIGHT.default,
      logFilter: 'all',
      mapCamera: 'follow',
      select: (selected) => set({ selected }),
      openTab: (tab) => set({ tab }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      setLogHeight: (height) => set({ logHeight: clampLogHeight(height) }),
      setMapCamera: (mapCamera) => set({ mapCamera }),
    }),
    {
      name: UI_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state): Remembered => ({ logHeight: state.logHeight, tab: state.tab, mapCamera: state.mapCamera }),
      merge: (saved, current) => ({ ...current, ...readRemembered(saved) }),
    },
  ),
);
