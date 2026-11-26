/**
 * Headless run configuration, presets, upgrade profile construction, and rule resolution.
 */
import { availableParallelism } from 'node:os';
import {
  BUILDING_SMITHY,
  CLASSES,
  CLASS_VANGUARD,
  CONTRACT_RECOVER_RELIC,
  RACE_HUMAN,
  UPGRADE_HARDY_RECRUITS,
  UPGRADE_REINFORCED_WAGON,
  UPGRADE_SECOND_BERTH,
  maxRank,
  UPGRADES,
} from '../../src/content';
import {
  canPurchase,
  checkProfile,
  checkRunConfig,
  chosenContracts,
  chosenInGroup,
  defaultRunChoices,
  milestoneRequirements,
  newProfile,
  owns,
  ownsStamps,
  partySize,
  purchase,
  rankOf,
  recruitParty,
  upgradeBonusModifiers,
  upgradePartyBundles,
  upgradeRunModifiers,
  tierGate,
  upgradeStartConfig,
  withOptIns,
} from '../../src/meta';
import type { OmenSelection } from '../../src/content';
import type { Profile } from '../../src/meta';
import { CONDITIONS, RULE_ACTIONS } from '../../src/sim';
import type { AdventurerConfig, Rule, RunConfig } from '../../src/sim';

/**
 * Party turns a run may take before it is stopped. A lone adventurer takes about 200–300 party
 * turns a floor, so a ten-floor dungeon fits with room to spare.
 */
export const DEFAULT_TURN_CAP = 6000;

/** The most worker threads `--jobs` accepts (`tools/parallel.ts`). */
export const MAX_JOBS = 64;

/** The default for `--jobs`: every core but one, so the machine stays usable. */
export function defaultJobs(): number {
  return Math.min(MAX_JOBS, Math.max(1, availableParallelism() - 1));
}

/** The most adventurers a party can have (CLAUDE.md §2). */
export const MAX_PARTY = 4;

const NAMES = ['Brannoc', 'Mira', 'Oren', 'Tamsin'] as const;

/** A party of `size` adventurers who all share one class and race (the Vanguard and Human unless given, ETH-160). */
export function headlessParty(size: number, classId: string = CLASS_VANGUARD.id, raceId: string = RACE_HUMAN.id): AdventurerConfig[] {
  return NAMES.slice(0, size).map((name) => ({ name, classId, raceId }));
}

/**
 * The party options for `size` adventurers: the Prepare screen's random recruits with `recruits`
 * (ETH-178), else one shared class and race (`headlessParty`). Shared by `--party-sweep` and a plain run.
 */
export function partyOptions(
  size: number,
  who: { classId?: string | null; raceId?: string | null; recruits?: boolean },
): Pick<HeadlessOptions, 'party' | 'recruits' | 'partySize'> {
  if (who.recruits === true) return { recruits: true, partySize: size };
  return { party: headlessParty(size, who.classId ?? undefined, who.raceId ?? undefined) };
}

export type HeadlessPreset = 'fresh' | 'progressed';

export const HEADLESS_PRESETS: readonly HeadlessPreset[] = ['fresh', 'progressed'];

/**
 * Valid progression path for `--preset progressed`: the second berth, the Smithy's Reinforced Wagon (party of three) and
 * Hardy Recruits (+3 max HP), verified through `purchase`. The wider berths moved to other buildings (ETH-132, ETH-159).
 */
export const PROGRESSED_UPGRADES: readonly string[] = [
  UPGRADE_SECOND_BERTH.id,
  UPGRADE_HARDY_RECRUITS.id,
  UPGRADE_REINFORCED_WAGON.id,
];

export type HeadlessRulesPreset = 'baseline' | 'cautious';

export const HEADLESS_RULES_PRESETS: readonly HeadlessRulesPreset[] = ['baseline', 'cautious'];

/**
 * Cautious behavior rules overlaid ahead of `BASELINE_RULES` (`--rules cautious`):
 * quaff healing potions earlier (<65% HP), drink fountains earlier (<75% HP), retreat out of the
 * dungeon when critically hurt with no healing potion (<15% HP), and wait at stairs up rather
 * than detouring when heading out or once contracts are complete.
 */
export const CAUTIOUS_RULES: readonly Rule[] = [
  { condition: { id: 'cond.wounded', params: { percent: 65 } }, action: { id: 'act.quaff_healing' }, enabled: true },
  { condition: { id: 'cond.stuck' }, action: { id: 'act.back_off' }, enabled: true },
  { condition: { id: 'cond.hurt_no_healing', params: { below: 15 } }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.heading_out' }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.heading_out' }, action: { id: 'act.gather', params: { dir: 'up' } }, enabled: true },
  { condition: { id: 'cond.contracts_complete' }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.hurt_no_healing', params: { below: 75 } }, action: { id: 'act.drink_fountain' }, enabled: true },
];

export interface HeadlessOptions {
  /** Party turns before giving up on the run. Default `DEFAULT_TURN_CAP`. */
  cap?: number;
  /** Default: `headlessParty(partySize(profile))` (one adventurer when `fresh` with no upgrades). */
  party?: AdventurerConfig[];
  /** Floors in the dungeon. Default: the run config's default (`DEFAULT_DEPTH`). */
  depth?: number;
  /** The contracts the run takes on. Default `HEADLESS_CONTRACTS` (or profile's `chosenContracts` when upgraded). */
  contracts?: string[];
  /** The party stance every adventurer starts with (`--stance`, ETH-071). Default Steady. */
  stance?: string;
  /** Meta-progression preset (`fresh` or `progressed`). Default `'fresh'`. */
  preset?: HeadlessPreset;
  /** Explicit upgrade node ids to apply via `meta` helpers. */
  upgrades?: readonly string[];
  /** Omens switched on, each at a rank (ETH-185). Default none. They need not be unlocked by the preset. */
  omens?: OmenSelection[];
  /** Count owned opt-in nodes (ETH-187) as switched on. Default true. */
  optIns?: boolean;
  /** Behavior rule preset (`baseline` or `cautious`) or explicit rules ahead of `BASELINE_RULES`. */
  rules?: HeadlessRulesPreset | readonly Rule[];
  /**
   * Field the party the Prepare screen's random fill gives the seed (`--recruits`, ETH-178):
   * random classes and races from the profile's available ones, from the seed. Needs the seed
   * (`buildHeadlessConfig(options, seed)`) and excludes `party`.
   */
  recruits?: boolean;
  /** The party size for `recruits`. Default: the profile's party size. */
  partySize?: number;
}

/** The contracts a headless run takes on by default (ETH-024): Recover the relic, the Prepare default. */
export const HEADLESS_CONTRACTS: readonly string[] = [CONTRACT_RECOVER_RELIC.id];

/**
 * One `--upgrades` entry (ETH-187): a node id, optionally `id*N` for rank N of a ranked node and a
 * trailing `!` to attach a node whose building tier is still closed (`upgrade.waymark_lanterns!`).
 * Plain ids stay rank 1 and respect closed tiers, as before.
 */
export function parseUpgradeEntry(raw: string): { id: string; rank: number; force: boolean } {
  const trimmed = raw.trim();
  const force = trimmed.endsWith('!');
  const [idPart = '', rankPart, ...extra] = (force ? trimmed.slice(0, -1) : trimmed).split('*');
  const id = idPart.trim();
  if (id === '') throw new Error('Upgrade id must not be empty');
  if (extra.length > 0) throw new Error(`Upgrade entry "${raw}" must be an id, id*rank or id*rank!`);
  if (rankPart === undefined) return { id, rank: 1, force };
  const rank = Number(rankPart);
  if (!Number.isSafeInteger(rank) || rank < 1) throw new Error(`Upgrade "${id}": rank must be a whole number from 1, got "${rankPart}"`);
  return { id, rank, force };
}

/**
 * Builds a checked `Profile` for a headless sweep from `preset` and `upgrades`.
 * Preset nodes are purchased through `purchase()` so tree prerequisites hold; explicit
 * `--upgrades` nodes use `purchase()` when unlocked or attach directly (after checking existence
 * and `exclusiveGroup` conflicts) so isolated upgrade sweeps like `--upgrades upgrade.hardy_recruits`
 * work without forcing extra berth prerequisites.
 */
export function buildHeadlessProfile(preset: HeadlessPreset = 'fresh', upgrades: readonly string[] = []): Profile {
  const base = newProfile();
  let profile: Profile = { ...base, currencies: { renown: 1_000_000, trophies: 1_000_000, favor: {} } };

  if (preset === 'progressed') {
    // The Smithy's Reinforced Wagon (the third berth) needs the Smithy open, which its quest does in a real game.
    profile = { ...profile, milestones: { unlocked: [...profile.milestones.unlocked, { id: BUILDING_SMITHY.id, run: 1 }] } };
    for (const id of PROGRESSED_UPGRADES) profile = purchase(profile, id);
  }

  for (const rawEntry of upgrades) {
    const { id, rank: wantRank, force } = parseUpgradeEntry(rawEntry);
    if (!UPGRADES.has(id)) {
      const available = UPGRADES.all().map((u) => u.id).join(', ');
      throw new Error(`Unknown upgrade "${id}". Available upgrades: ${available}`);
    }
    const node = UPGRADES.get(id);
    if (wantRank > maxRank(node)) throw new Error(`Upgrade "${id}" has at most ${maxRank(node)} ranks, got ${wantRank}`);
    if (owns(profile, id)) {
      if (wantRank > rankOf(profile, id)) {
        profile = { ...profile, upgrades: { ...profile.upgrades, ranks: { ...profile.upgrades.ranks, [id]: wantRank } } };
      }
      continue;
    }
    if (node.exclusiveGroup !== undefined) {
      const conflict = chosenInGroup(profile, node.exclusiveGroup);
      if (conflict !== undefined && conflict.id !== id) {
        throw new Error(`Upgrade "${id}" conflicts with "${conflict.id}" in exclusive group "${node.exclusiveGroup}"`);
      }
    }
    const check = canPurchase(profile, id);
    if (check.ok) {
      profile = purchase(profile, id);
    } else if (
      check.status === 'locked' &&
      ((check.missing?.length ?? 0) > 0 || node.reveal !== undefined || (force && tierGate(profile, node.building, node.tier) !== null))
    ) {
      // Missing prerequisites, a node a run must reveal first (ETH-036), or (with a trailing !) a closed building tier: a sweep attaches it directly.
      profile = { ...profile, upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, id] } };
    } else {
      throw new Error(`Cannot apply upgrade "${id}": ${check.reason}`);
    }
    if (wantRank > rankOf(profile, id)) {
      profile = { ...profile, upgrades: { ...profile.upgrades, ranks: { ...profile.upgrades.ranks, [id]: wantRank } } };
    }
  }

  const finalProfile: Profile = { ...profile, currencies: base.currencies };
  const problems = checkProfile(finalProfile);
  if (problems.length > 0) throw new RangeError(`Invalid headless profile: ${problems.join('; ')}`);
  return finalProfile;
}

/**
 * Resolves `HeadlessOptions` into a checked `RunConfig` using real `meta` helpers
 * (`partySize`, `upgradePartyBundles`, `upgradeRunModifiers`, `chosenContracts`, `milestoneRequirements`,
 * `checkRunConfig`), matching `buildRunConfig` for the profile's watched `metInRun` reveals.
 */
export function buildHeadlessConfig(options: HeadlessOptions = {}, seed = 0): RunConfig {
  if (options.recruits === true && options.party !== undefined) {
    throw new Error('recruits fields a random party, so it can not be combined with an explicit party (--class, --race)');
  }
  const preset = options.preset ?? 'fresh';
  const upgrades = options.upgrades ?? [];
  const profile = buildHeadlessProfile(preset, upgrades);
  const hasUpgrades = profile.upgrades.owned.length > 0;
  // Owned opt-in nodes count as switched on unless `optIns` is false (ETH-187).
  const active = options.optIns === false ? withOptIns(profile, { enabled: [] }) : profile;
  const partyBundles = upgradePartyBundles(active);
  const runModifiers = [...upgradeRunModifiers(active), ...upgradeBonusModifiers(active)];
  const watchRequirements = milestoneRequirements(profile);
  const contracts =
    options.contracts ??
    (hasUpgrades ? chosenContracts(profile, defaultRunChoices().contracts).map((d) => d.id) : HEADLESS_CONTRACTS);

  const baseParty =
    options.party ??
    (options.recruits === true ? recruitParty(active, seed, options.partySize) : headlessParty(partySize(profile)));
  const useStamps = ownsStamps(active);
  const party = useStamps
    ? baseParty.map((m) => (m.stamp !== undefined || !CLASSES.has(m.classId) ? m : { ...m, stamp: CLASSES.get(m.classId).stamp }))
    : baseParty;

  const config: RunConfig = {
    party,
    contracts: [...contracts],
    ...(options.stance === undefined ? {} : { tactics: { stance: options.stance } }),
    ...(options.depth === undefined ? {} : { depth: options.depth }),
    ...(options.omens === undefined || options.omens.length === 0 ? {} : { omens: options.omens.map((o) => ({ ...o })) }),
    ...(partyBundles.length === 0 ? {} : { partyBundles }),
    ...(runModifiers.length === 0 ? {} : { runModifiers }),
    ...upgradeStartConfig(active),
    ...(watchRequirements.length === 0 ? {} : { watchRequirements }),
  };
  const problems = checkRunConfig(config);
  if (problems.length > 0) throw new RangeError(`Invalid run config: ${problems.join('; ')}`);
  return config;
}

/** Validates and resolves a rule preset or custom rule list against the sim's registered conditions and actions. */
export function resolveHeadlessRules(rules: HeadlessRulesPreset | readonly Rule[] = 'baseline'): Rule[] {
  if (rules === 'baseline') return [];
  const list = rules === 'cautious' ? CAUTIOUS_RULES : rules;
  return list.map((rule, i) => {
    if (!CONDITIONS.has(rule.condition.id)) {
      throw new Error(`Rule #${i + 1}: unknown condition "${rule.condition.id}"`);
    }
    const condProblem = CONDITIONS.get(rule.condition.id).check(rule.condition.params);
    if (condProblem !== null) {
      throw new Error(`Rule #${i + 1} (${rule.condition.id}): ${condProblem}`);
    }
    if (!RULE_ACTIONS.has(rule.action.id)) {
      throw new Error(`Rule #${i + 1}: unknown rule action "${rule.action.id}"`);
    }
    const actionProblem = RULE_ACTIONS.get(rule.action.id).check(rule.action.params);
    if (actionProblem !== null) {
      throw new Error(`Rule #${i + 1} (${rule.action.id}): ${actionProblem}`);
    }
    return structuredClone(rule);
  });
}
