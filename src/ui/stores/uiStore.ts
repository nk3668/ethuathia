/**
 * `uiStore` (docs/ARCHITECTURE.md §8): state that belongs to the screen rather than the run or the
 * profile: which adventurer is selected, which side tab is open, whether the side drawer is open,
 * the log's height and its filter, the map's camera mode and focus, and which highlight kinds
 * auto-pause the run. The log height, open tab, camera mode and auto-pause choices are remembered
 * between sessions in `localStorage`; they are per-machine conveniences, not part of the save.
 * (The auto-pause choices move to a profile settings slice once there is one.)
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type { Pos } from '../../core';
import type { EntityId, FloorId } from '../../sim';
import { isCameraMode } from '../map/camera';
import type { CameraMode } from '../map/camera';

/** The side panel's tabs, in order. */
export const SIDE_TABS = ['rules', 'town', 'codex', 'graveyard', 'stats', 'options'] as const;
export type SideTab = (typeof SIDE_TABS)[number];

export function isSideTab(value: unknown): value is SideTab {
  return (SIDE_TABS as readonly unknown[]).includes(value);
}

/** Log filters: everything, or only highlights. M1 adds the categories (combat, loot, discovery, AI). */
export const LOG_FILTERS = ['all', 'highlights'] as const;
export type LogFilter = (typeof LOG_FILTERS)[number];

/** A tile the map centers on and marks, e.g. where a clicked highlight happened. */
export interface MapFocus {
  floor: FloorId;
  pos: Pos;
}

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
  /** Whether the wide two-pane Codex modal (ETH-092) is open. */
  codexOpen: boolean;
  logHeight: number;
  logFilter: LogFilter;
  /** Whether the map follows the selected adventurer or fits the whole floor. */
  mapCamera: CameraMode;
  /**
   * A tile the map centers on (in follow mode) and marks, instead of following an adventurer.
   * Selecting an adventurer or changing the camera mode clears it.
   */
  mapFocus: MapFocus | null;
  /** The ids of the highlight kinds that pause the run when they happen. All off by default. */
  autoPause: readonly string[];
  /** The label of the highlight kind that auto-paused the run, until it is resumed. */
  autoPaused: string | null;
  select(id: EntityId | null): void;
  openTab(tab: SideTab): void;
  setDrawerOpen(open: boolean): void;
  setCodexOpen(open: boolean): void;
  setLogHeight(height: number): void;
  setMapCamera(mode: CameraMode): void;
  setLogFilter(filter: LogFilter): void;
  focusMap(focus: MapFocus | null): void;
  /** Turns auto-pause on or off for one highlight kind. */
  setAutoPause(kind: string, on: boolean): void;
  noteAutoPause(label: string | null): void;
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
type Remembered = Pick<UiStoreState, 'logHeight' | 'tab' | 'mapCamera' | 'autoPause'>;

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
  const { logHeight, tab, mapCamera, autoPause } = saved as Record<string, unknown>;
  const out: Partial<Remembered> = {};
  if (typeof logHeight === 'number') out.logHeight = clampLogHeight(logHeight);
  if (isSideTab(tab)) out.tab = tab;
  if (isCameraMode(mapCamera)) out.mapCamera = mapCamera;
  // Unknown kind ids are kept: they may belong to a kind a later version adds back.
  if (Array.isArray(autoPause)) out.autoPause = [...new Set(autoPause.filter((k) => typeof k === 'string'))];
  return out;
}

export const useUiStore = create<UiStoreState>()(
  persist(
    (set) => ({
      selected: null,
      tab: 'rules',
      drawerOpen: false,
      codexOpen: false,
      logHeight: LOG_HEIGHT.default,
      logFilter: 'all',
      mapCamera: 'follow',
      mapFocus: null,
      autoPause: [],
      autoPaused: null,
      select: (selected) => set({ selected, mapFocus: null }),
      openTab: (tab) => set({ tab }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      setCodexOpen: (codexOpen) => set({ codexOpen }),
      setLogHeight: (height) => set({ logHeight: clampLogHeight(height) }),
      setMapCamera: (mapCamera) => set({ mapCamera, mapFocus: null }),
      setLogFilter: (logFilter) => set({ logFilter }),
      focusMap: (mapFocus) => set({ mapFocus }),
      noteAutoPause: (autoPaused) => set({ autoPaused }),
      setAutoPause: (kind, on) =>
        set((state) => {
          const has = state.autoPause.includes(kind);
          if (has === on) return state;
          return { autoPause: on ? [...state.autoPause, kind] : state.autoPause.filter((k) => k !== kind) };
        }),
    }),
    {
      name: UI_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state): Remembered => ({
        logHeight: state.logHeight,
        tab: state.tab,
        mapCamera: state.mapCamera,
        autoPause: state.autoPause,
      }),
      merge: (saved, current) => ({ ...current, ...readRemembered(saved) }),
    },
  ),
);
