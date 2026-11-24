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
export {
  isMilestoneOpen,
  latestUnlocks,
  lockingMilestone,
  milestoneProgress,
  milestoneRequirements,
  milestoneTargets,
  unlockMilestones,
  unlockOf,
} from './milestones';
export type { MilestoneTarget } from './milestones';
export type { Milestones, MilestoneUnlock } from './slices/milestones';
export { checkRunResult, currenciesFromRewards } from './runResult';
export { decodeSave, decodeSaveWith, encodeSave, MAX_SAVE_LENGTH, SAVE_FORMAT, SAVE_VERSION } from './save';
export type { DecodeResult, StoredSlice } from './save';
export { defineSlice } from './slice';
export type { ProfileBefore, ProfileSlice, SliceMigration, SliceState } from './slice';
export { discoveriesSchema, mergeMonsterKills, monsterKillsSchema } from './slices/codex';
export type { Codex, MonsterKills } from './slices/codex';
export { HISTORY_LIMIT, recordMoments, RUN_RECORD_MOMENTS, runRecord } from './slices/history';
export type { History, RunRecord, RunRecordContract, RunRecordMember } from './slices/history';
export {
  activeRecords,
  addTrait,
  adventurerId,
  ADVENTURER_ID_PATTERN,
  fallenRecords,
  newRecord,
  recordOf,
  retiredRecords,
  setStatus,
} from './adventurers';
export type { NewRecordInit } from './adventurers';
export { FALLEN_RECORD_CAP } from './slices/adventurers';
export {
  classMastery,
  MASTERY_BONUS_PER_DEPTH,
  MASTERY_BONUS_PER_OBJECTIVE,
  MASTERY_COMPANION_SHARE,
  MASTERY_CURVE,
  MASTERY_SHARES,
  masteryGain,
  masteryGainBanked,
  masteryLevel,
  masteryOf,
  masteryPoints,
  masteryProgress,
  masteryShares,
  masteryStepCost,
  masteryXpForLevel,
} from './mastery';
export type { ClassMasteryGain, MasteryBonus, MasteryMemberGain, MasteryProgress, MasteryShare, MasteryView } from './mastery';
export type { ClassMastery, Mastery } from './slices/mastery';
export type {
  AdventurerDeath,
  AdventurerHistory,
  AdventurerId,
  AdventurerKiller,
  AdventurerOrigin,
  AdventurerRecord,
  AdventurerStatus,
  Adventurers,
} from './slices/adventurers';
export type { Upgrades } from './slices/upgrades';
export type { Settings } from './slices/settings';
export type { Prepare } from './slices/prepare';
export { completeRunChoices, defaultRunChoices, RUN_CHOICES } from './prepare';
export type { RunChoiceKey, RunChoices } from './prepare';
export { defineRunChoice } from './prepare/choice';
export type { BuildCtx, ChoiceOf, RunChoiceSection } from './prepare/choice';
export { availableClasses, availableDungeons, availableRaces, isAvailable, lockedByUpgrade } from './prepare/available';
export { BASE_PARTY_SIZE, MAX_PARTY_SIZE, partySize, RANDOM_PICK, recruitName } from './prepare/party';
export type { PartyChoice, RecruitPick } from './prepare/party';
export { chosenDungeon } from './prepare/dungeon';
export type { DungeonChoice } from './prepare/dungeon';
export { availableContracts, BASE_CONTRACT_SLOTS, chosenContracts, contractSlots } from './prepare/contracts';
export type { ContractsChoice } from './prepare/contracts';
export { buildRunConfig, checkRunConfig, PREPARE_STREAM, startRun, upgradePartyBundles, upgradeRunModifiers } from './prepare/build';
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
  FOUNDATIONS_RESPEC_FEE_RATE,
  respec,
  respecFee,
  respecBlock,
  respecPlan,
  resetPlan,
  resetTree,
  RUN_ACTIVE_REASON,
  treeKind,
  shortfall,
} from './upgrades';
export type { ActiveGrant, NodeStatus, PurchaseCheck, RespecOptions, RespecPlan, ResetPlan } from './upgrades';
