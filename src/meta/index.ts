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
export { isMilestoneOpen, latestUnlocks, lockingMilestone, milestoneProgress, milestoneTargets, unlockMilestones, unlockOf } from './milestones';
export type { MilestoneTarget } from './milestones';
export type { Milestones, MilestoneUnlock } from './slices/milestones';
export { checkRunResult, currenciesFromRewards } from './runResult';
export { decodeSave, decodeSaveWith, encodeSave, MAX_SAVE_LENGTH, SAVE_FORMAT, SAVE_VERSION } from './save';
export type { DecodeResult, StoredSlice } from './save';
export { defineSlice } from './slice';
export type { ProfileSlice, SliceMigration, SliceState } from './slice';
export { discoveriesSchema } from './slices/codex';
export type { Codex } from './slices/codex';
export { HISTORY_LIMIT, runRecord } from './slices/history';
export type { History, RunRecord, RunRecordMember } from './slices/history';
export type { Upgrades } from './slices/upgrades';
export type { Settings } from './slices/settings';
export {
  canAfford,
  canPurchase,
  capacity,
  chosenInGroup,
  describeGrant,
  formatCurrencies,
  isUnlocked,
  nodeCost,
  nodeStatus,
  ownedNodes,
  owns,
  profileGrants,
  purchase,
  RESPEC_FEE_RATE,
  respec,
  respecFee,
  respecPlan,
  shortfall,
} from './upgrades';
export type { ActiveGrant, NodeStatus, PurchaseCheck, RespecPlan } from './upgrades';
