/**
 * `profileStore` (docs/ARCHITECTURE.md §8): the player's profile, everything that persists between
 * runs. For now it holds only the currencies the top bar shows, all zero. M2 replaces the state
 * with meta's `Profile` (§6.1) and adds actions that call the pure meta functions and then save.
 */
import { create } from 'zustand';

export interface Currencies {
  renown: number;
  trophies: number;
  /** Favor is kept per deity, keyed by deity content id. */
  favor: Readonly<Record<string, number>>;
}

export interface ProfileStoreState {
  currencies: Currencies;
}

export const INITIAL_PROFILE: ProfileStoreState = {
  currencies: { renown: 0, trophies: 0, favor: {} },
};

export const useProfileStore = create<ProfileStoreState>()(() => INITIAL_PROFILE);

/** Favor across every deity, as the top bar shows it. */
export function totalFavor(favor: Currencies['favor']): number {
  return Object.values(favor).reduce((sum, n) => sum + n, 0);
}
