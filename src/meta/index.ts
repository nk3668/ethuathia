/**
 * meta: profile, town, rewards, saves and time-away progress.
 * May import: core, content, sim. See docs/ARCHITECTURE.md §1 and §6.
 */
export {
  addCurrencies,
  CURRENCY_IDS,
  CURRENCY_INFO,
  emptyCurrencies,
  subtractCurrencies,
  totalFavor,
} from './currencies';
export type { Currencies, CurrencyId } from './currencies';
export { applyRunResult, checkProfile, newProfile } from './profile';
export type { Profile, ProfileSliceKey } from './profile';
export { checkRunResult, currenciesFromRewards } from './runResult';
export { decodeSave, decodeSaveWith, encodeSave, MAX_SAVE_LENGTH, SAVE_FORMAT, SAVE_VERSION } from './save';
export type { DecodeResult, StoredSlice } from './save';
export { defineSlice } from './slice';
export type { ProfileSlice, SliceMigration, SliceState } from './slice';
export { HISTORY_LIMIT } from './slices/history';
export type { History, RunRecord } from './slices/history';
