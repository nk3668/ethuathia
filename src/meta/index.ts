/**
 * meta: profile, town, rewards, saves and time-away progress.
 * May import: core, content, sim. See docs/ARCHITECTURE.md §1 and §6.
 */
export {
  addCurrencies,
  CURRENCY_IDS,
  CURRENCY_INFO,
  emptyCurrencies,
  goldConversionText,
  itemSaleText,
  subtractCurrencies,
  TROPHIES_KILLS_TEXT,
  TROPHIES_OMEN_TEXT,
  TROPHIES_SPENT_TEXT,
  trophiesAbout,
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
export { bankedFromRunResult, checkRunResult, currenciesFromRewards } from './runResult';
export { decodeSave, decodeSaveWith, encodeSave, MAX_SAVE_LENGTH, SAVE_FORMAT, SAVE_VERSION } from './save';
export type { DecodeResult, StoredSlice } from './save';
export { defineSlice } from './slice';
export type { ProfileBefore, ProfileSlice, SliceMigration, SliceState } from './slice';
export { discoveriesSchema, mergeMonsterKills, monsterKillsSchema } from './slices/codex';
export type { Codex, MonsterKills } from './slices/codex';
export { HISTORY_LIMIT, recordMoments, RUN_RECORD_MOMENTS, runRecord } from './slices/history';
export type { History, RunRecord, RunRecordContract, RunRecordGold, RunRecordItems, RunRecordMember, RunRecordSalvage } from './slices/history';
export {
  activeRecords,
  addTrait,
  adventurerId,
  ADVENTURER_ID_PATTERN,
  fallenRecords,
  newRecord,
  recordOf,
  retiredRecords,
  ROSTER_SIZE,
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
export {
  availableClasses,
  availableDungeons,
  availableRaces,
  isAvailable,
  isTeaser,
  lockedByUpgrade,
  masteryClasses,
  teaserClasses,
  teaserRaces,
} from './prepare/available';
export { BASE_PARTY_SIZE, MAX_PARTY_SIZE, ownsStamps, partySize, RANDOM_PICK, recruitName, TEASER_CHANCE } from './prepare/party';
export type { PartyChoice, RecruitPick } from './prepare/party';
export { chosenDungeon } from './prepare/dungeon';
export type { DungeonChoice } from './prepare/dungeon';
export { availableContracts, BASE_CONTRACT_SLOTS, chosenContracts, contractSlots, lockedBuildingQuests } from './prepare/contracts';
export { buildingQuestRefusal, questNeedText, questOffer, upgradeShare } from './prepare/buildingQuests';
export type { QuestOffer, UpgradeShare } from './prepare/buildingQuests';
export type { ContractsChoice } from './prepare/contracts';
export { enabledOptIns, optInNodes, withOptIns } from './prepare/optIns';
export type { OptInsChoice } from './prepare/optIns';
export { upgradeStartConfig } from './prepare/startPerks';
export { buildRunConfig, checkRunConfig, PREPARE_STREAM, recruitParty, startRun, upgradeBonusModifiers, upgradePartyBundles, upgradeRunModifiers } from './prepare/build';
export {
  canAfford,
  canPurchase,
  capacity,
  chosenInGroup,
  closedGates,
  describeGate,
  formatCurrencies,
  gateGoal,
  isUnlocked,
  nextRankCost,
  nodeCost,
  nodeStatus,
  ownedNodes,
  owns,
  profileGrants,
  purchase,
  rankCost,
  rankOf,
  revealText,
  shortfall,
  tierGate,
} from './upgrades';
export type { ActiveGrant, ClosedGate, NodeStatus, PurchaseCheck } from './upgrades';
export { describeGrant } from './grantText';
export {
  FOUNDATIONS_RESPEC_FEE_RATE,
  respec,
  respecBlock,
  respecFee,
  respecPlan,
  resetPlan,
  resetTree,
  RUN_ACTIVE_REASON,
  treeKind,
} from './respec';
export type { RespecOptions, RespecPlan, ResetPlan } from './respec';
