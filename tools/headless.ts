/**
 * Headless runs (docs/ARCHITECTURE.md §10): runs seeded dungeons with no UI through `SimSession`,
 * the same loop the hosts use, and reports how each went: how deep the party got, the turns it
 * spent on each floor, and whether it settled at the bottom. The seed of the balance harness: in
 * M1 it grows death causes and currency per hour. `tools/sim.ts` is the command line for it
 * (`npm run sim -- --seeds N`); `test/tools/headless.test.ts` runs it in the test suite.
 */
import { parseArgs } from 'node:util';
import {
  CLASS_VANGUARD,
  CONTRACT_RECOVER_RELIC,
  RACE_HUMAN,
  UPGRADE_DRILL_YARD,
  UPGRADE_FOURTH_BERTH,
  UPGRADE_HARDY_RECRUITS,
  UPGRADE_ROSTER_LEDGER,
  UPGRADE_SECOND_BERTH,
  UPGRADE_THIRD_BERTH,
  UPGRADES,
} from '../src/content';
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
  partySize,
  purchase,
  upgradePartyBundles,
  upgradeRunModifiers,
} from '../src/meta';
import type { Profile } from '../src/meta';
import {
  ACT_WAIT,
  CHRONICLE_TRACKER,
  CONDITIONS,
  createRun,
  DROP_TURNS,
  dungeonDepth,
  floorIdAt,
  RULE_ACTIONS,
  RUN_OUTCOMES,
  runOver,
  runReport,
  SimSession,
  snapshot,
  stateHash,
  step,
  TURNS_PER_SECOND,
} from '../src/sim';
import type {
  AdventurerConfig,
  Explored,
  RewardAmounts,
  Rule,
  RunConfig,
  RunOutcome,
  RunReport,
  SimEvent,
  Snapshot,
  ViewOptions,
} from '../src/sim';

/**
 * Party turns a run may take before it is stopped. A lone adventurer takes about 200–300 party
 * turns a floor, so a ten-floor dungeon fits with room to spare.
 */
export const DEFAULT_TURN_CAP = 6000;

/** The most adventurers a party can have (CLAUDE.md §2). */
export const MAX_PARTY = 4;

const NAMES = ['Brannoc', 'Mira', 'Oren', 'Tamsin'] as const;

/** A party of `size` adventurers. M0 has one class and one race, so they all share them. */
export function headlessParty(size: number): AdventurerConfig[] {
  return NAMES.slice(0, size).map((name) => ({ name, classId: CLASS_VANGUARD.id, raceId: RACE_HUMAN.id }));
}

export type HeadlessPreset = 'fresh' | 'progressed';

export const HEADLESS_PRESETS: readonly HeadlessPreset[] = ['fresh', 'progressed'];

/**
 * Valid Guild Hall progression path for `--preset progressed`: unlocks all four berths and
 * picks Hardy Recruits (+2 max HP) and Drill Yard (+1 accuracy), verified through `purchase`.
 */
export const PROGRESSED_UPGRADES: readonly string[] = [
  UPGRADE_SECOND_BERTH.id,
  UPGRADE_ROSTER_LEDGER.id,
  UPGRADE_HARDY_RECRUITS.id,
  UPGRADE_THIRD_BERTH.id,
  UPGRADE_FOURTH_BERTH.id,
  UPGRADE_DRILL_YARD.id,
];

export type HeadlessRulesPreset = 'baseline' | 'cautious';

export const HEADLESS_RULES_PRESETS: readonly HeadlessRulesPreset[] = ['baseline', 'cautious'];

/**
 * Cautious behavior rules overlaid ahead of `BASELINE_RULES` (`--rules cautious`):
 * quaff healing potions earlier (<60% HP), flee earlier (<50% HP), retreat out of the dungeon
 * when critically hurt with no healing potion (<35% HP), drink fountains earlier (<65% HP), and
 * wait at stairs up rather than detouring when heading out or once contracts are complete.
 */
export const CAUTIOUS_RULES: readonly Rule[] = [
  { condition: { id: 'cond.wounded', params: { percent: 60 } }, action: { id: 'act.quaff_healing' }, enabled: true },
  { condition: { id: 'cond.stuck' }, action: { id: 'act.back_off' }, enabled: true },
  { condition: { id: 'cond.hp_below', params: { percent: 50 } }, action: { id: 'act.flee' }, enabled: true },
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.attack_adjacent' }, enabled: true },
  { condition: { id: 'cond.hurt_no_healing', params: { below: 35 } }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.heading_out' }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.heading_out' }, action: { id: 'act.gather', params: { dir: 'up' } }, enabled: true },
  { condition: { id: 'cond.contracts_complete' }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.hurt_no_healing', params: { below: 65 } }, action: { id: 'act.drink_fountain' }, enabled: true },
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
  /** Meta-progression preset (`fresh` or `progressed`). Default `'fresh'`. */
  preset?: HeadlessPreset;
  /** Explicit upgrade node ids to apply via `meta` helpers. */
  upgrades?: readonly string[];
  /** Behavior rule preset (`baseline` or `cautious`) or explicit rules ahead of `BASELINE_RULES`. */
  rules?: HeadlessRulesPreset | readonly Rule[];
}

/** The contracts a headless run takes on by default (ETH-024): Recover the relic, the Prepare default. */
export const HEADLESS_CONTRACTS: readonly string[] = [CONTRACT_RECOVER_RELIC.id];

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
    for (const id of PROGRESSED_UPGRADES) profile = purchase(profile, id);
  }

  for (const rawId of upgrades) {
    const id = rawId.trim();
    if (id === '') throw new Error('Upgrade id must not be empty');
    if (!UPGRADES.has(id)) {
      const available = UPGRADES.all().map((u) => u.id).join(', ');
      throw new Error(`Unknown upgrade "${id}". Available upgrades: ${available}`);
    }
    if (owns(profile, id)) continue;
    const node = UPGRADES.get(id);
    if (node.exclusiveGroup !== undefined) {
      const conflict = chosenInGroup(profile, node.exclusiveGroup);
      if (conflict !== undefined && conflict.id !== id) {
        throw new Error(`Upgrade "${id}" conflicts with "${conflict.id}" in exclusive group "${node.exclusiveGroup}"`);
      }
    }
    const check = canPurchase(profile, id);
    if (check.ok) {
      profile = purchase(profile, id);
    } else if (check.status === 'locked' && (check.missing?.length ?? 0) > 0) {
      profile = { ...profile, upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, id] } };
    } else {
      throw new Error(`Cannot apply upgrade "${id}": ${check.reason}`);
    }
  }

  const finalProfile: Profile = { ...profile, currencies: base.currencies };
  const problems = checkProfile(finalProfile);
  if (problems.length > 0) throw new RangeError(`Invalid headless profile: ${problems.join('; ')}`);
  return finalProfile;
}

/**
 * Resolves `HeadlessOptions` into a checked `RunConfig` using real `meta` helpers
 * (`partySize`, `upgradePartyBundles`, `upgradeRunModifiers`, `chosenContracts`, `checkRunConfig`).
 * Keeps the default (`fresh`, no upgrades) byte-identical to `{ party, contracts, depth? }`.
 */
export function buildHeadlessConfig(options: HeadlessOptions = {}): RunConfig {
  const preset = options.preset ?? 'fresh';
  const upgrades = options.upgrades ?? [];
  const profile = buildHeadlessProfile(preset, upgrades);
  const hasUpgrades = profile.upgrades.owned.length > 0;
  const partyBundles = upgradePartyBundles(profile);
  const runModifiers = upgradeRunModifiers(profile);
  const watchRequirements = milestoneRequirements(profile);
  const contracts =
    options.contracts ??
    (hasUpgrades ? chosenContracts(profile, defaultRunChoices().contracts).map((d) => d.id) : HEADLESS_CONTRACTS);

  const config: RunConfig = {
    party: options.party ?? headlessParty(partySize(profile)),
    contracts: [...contracts],
    ...(options.depth === undefined ? {} : { depth: options.depth }),
    ...(partyBundles.length === 0 ? {} : { partyBundles }),
    ...(runModifiers.length === 0 ? {} : { runModifiers }),
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

/**
 * How one seed's run went.
 * - `done`: the party reached the bottom floor and the run ended (since ETH-062, by walking back
 *   out; before it, by settling on the bottom floor). `end` says how.
 * - `early`: the run ended without reaching the bottom (a wipe, or a retreat on the way down).
 * - `idle`: the party settled above the bottom floor, with nowhere left to go.
 * - `cap`: still going after `cap` party turns.
 * - `stalled`: a step got nowhere because nobody could act.
 */
export type Outcome = 'done' | 'early' | 'idle' | 'cap' | 'stalled';

/** One floor the party reached. */
export interface FloorResult {
  depth: number;
  /**
   * Game turns from the party's first arrival until the first member arrived on the next floor,
   * or until the run settled or stopped on the last floor reached.
   */
  turns: number;
  /** How much of it the party saw, from 0 to 1. */
  explored: number;
}

export interface SeedResult {
  seed: number;
  outcome: Outcome;
  /**
   * Game turns (`RunState.turn`) taken to get as deep as the party went: up to the turn it turned
   * back for the surface (or settled, before ETH-062), else up to where the run stopped. The
   * return trip is in `runTurns`.
   */
  turns: number;
  /** How the run ended (ETH-062), if it did. */
  end?: RunOutcome;
  /** Game turns until the run ended, return trip included. Only for runs that ended. */
  runTurns?: number;
  /** Whether the party ever turned back for the surface (`turnedBack` event). */
  turnedBack?: boolean;
  /** Whether the party ever picked up a contract item (`contractCompleted` event). */
  relicTaken?: boolean;
  /** The run's at-risk currency when it stopped (currency id → amount). */
  atRisk?: RewardAmounts;
  /** What a wipe took from `atRisk` (ETH-023); empty otherwise. Missing from reports before ETH-023. */
  lost?: RewardAmounts;
  /** Party turns (steps) run, including the ones spent confirming the party had settled. */
  steps: number;
  /** How much of the last floor reached the party saw. */
  explored: Explored;
  /** The deepest floor reached. Missing from reports made before ETH-058 (one floor). */
  depth?: number;
  /** How many floors the dungeon has. */
  bottom?: number;
  /** Each floor reached, from the first. */
  floors?: FloorResult[];
  /** Items (stacks) the party picked up, gold piles not counted. Missing from reports before ETH-061. */
  items?: number;
  /** Gold in the party's purse at the end. Missing from reports before ETH-061. */
  gold?: number;
  /** How many times stuck detection dropped a goal, and the turn it first did. */
  stuck: { count: number; firstTurn: number | null };
  /** Monsters killed. Missing from reports made before ETH-060. */
  kills?: number;
  /** Party members who died. Missing from reports made before ETH-060. */
  deaths?: number;
  /** What killed them: the killer's def (`other` for a status or anything else) → deaths. */
  deathCauses?: Record<string, number>;
  /** Draughts drunk from fountains (ETH-072). */
  drinks?: number;
  /** Failed Flee checks: a party member held back by an adjacent enemy (ETH-081). */
  fleeFails?: number;
  /** Turns of harmful statuses the party shrugged off with status resistance (ETH-081). */
  resisted?: number;
  /** The party's highest level where the run stopped (ETH-034). Missing from older reports. */
  level?: number;
  /** Contracts complete when the run stopped (ETH-024). Missing from reports before it. */
  contracts?: number;
  /** Times a party member put on a piece of gear (ETH-043). */
  equips?: number;
  /** Entries in the run chronicle where the run stopped (ETH-120). Missing from reports before it. */
  moments?: number;
  /** `stateHash` of where the run stopped, to tell whether a change altered behavior. */
  hash: string;
}

/**
 * Whether every living party member is on the baseline's `act.wait`, which it falls to when
 * there is nothing left to explore and no way further down. It also waits while stuck detection
 * has dropped its goal, so `runSeed` only counts the party as settled once it has waited longer
 * than a drop lasts.
 */
function idle(snap: Snapshot): boolean {
  const living = snap.party.filter((m) => m.alive);
  return living.length > 0 && living.every((m) => m.intent?.action === ACT_WAIT.id);
}

interface HeadlessRunner {
  step(): { events: SimEvent[]; progressed: boolean; ended: RunReport | null };
  snapshot(view?: ViewOptions): Snapshot;
  depth(): number;
  report(): RunReport | null;
  stateHash(): string;
}

/**
 * Runs via `SimSession` for default baseline rules, or via `createRun` + `step` when own
 * behavior rules are overlaid on the party (since `SimSession` keeps `RunState` private).
 */
function createRunner(config: RunConfig, seed: number, ownRules: readonly Rule[]): HeadlessRunner {
  if (ownRules.length === 0) {
    const session = new SimSession(config, seed);
    return {
      step: () => session.step(),
      snapshot: (view) => session.snapshot(view),
      depth: () => session.debugDungeonDepth(),
      report: () => session.report(),
      stateHash: () => session.stateHash(),
    };
  }
  const state = createRun(config, seed);
  for (const id of state.party) {
    const entity = state.entities[id];
    if (entity?.ai !== undefined) entity.ai.rules = ownRules.map((r) => structuredClone(r));
  }
  return {
    step: () => {
      const turn = state.turn;
      const wasOver = runOver(state);
      const events = step(state, []);
      const ended = !wasOver && runOver(state) ? runReport(state) : null;
      return { events, progressed: events.length > 0 || state.turn !== turn, ended };
    },
    snapshot: (view) => snapshot(state, view),
    depth: () => dungeonDepth(state),
    report: () => (runOver(state) ? runReport(state) : null),
    stateHash: () => stateHash(state),
  };
}

/** Runs one seed until the party settles, the cap is hit or the run stalls. */
export function runSeed(seed: number, options: HeadlessOptions = {}): SeedResult {
  const cap = options.cap ?? DEFAULT_TURN_CAP;
  const config = buildHeadlessConfig(options);
  const ownRules = resolveHeadlessRules(options.rules);
  const runner = createRunner(config, seed, ownRules);
  const stuck: SeedResult['stuck'] = { count: 0, firstTurn: null };
  /** The game turn each depth was first reached on. */
  const reached = new Map<number, number>([[1, 0]]);
  let outcome: Outcome = 'cap';
  let idleSince: number | null = null;
  let turnedBack: number | null = null;
  let relicTaken = false;
  let end: { outcome: RunOutcome; turn: number } | null = null;
  let steps = 0;
  let items = 0;
  let snap = runner.snapshot();

  let kills = 0;
  let deaths = 0;
  let drinks = 0;
  let fleeFails = 0;
  let resisted = 0;
  let equips = 0;
  let chronicle = CHRONICLE_TRACKER.init();
  const party = new Set(snap.party.map((m) => m.id));
  const deathCauses: Record<string, number> = {};
  /** Who killed each party member struck down, until their `fell` event. */
  const slain = new Map<number, string>();

  while (steps < cap) {
    const { events, progressed } = runner.step();
    for (const e of events) {
      if (e.type === 'floorEntered' && !reached.has(e.depth)) reached.set(e.depth, e.turn);
      if (e.type === 'turnedBack') turnedBack ??= e.turn;
      if (e.type === 'contractCompleted') relicTaken = true;
      if (e.type === 'runEnded') end = { outcome: e.outcome, turn: e.turn };
      if (e.type === 'pickedUp') items++;
      if (e.type === 'killed') {
        if (e.byParty) kills++;
        else slain.set(e.victim, e.killerDef);
      }
      if (e.type === 'drankFountain') drinks++;
      if (e.type === 'fleeFailed' && party.has(e.actor)) fleeFails++;
      if (e.type === 'statusApplied' && party.has(e.actor)) resisted += e.resisted ?? 0;
      if (e.type === 'equipped') equips++;
      chronicle = CHRONICLE_TRACKER.reduce(chronicle, e);
      if (e.type === 'fell') {
        deaths++;
        const cause = slain.get(e.actor) ?? 'other';
        deathCauses[cause] = (deathCauses[cause] ?? 0) + 1;
      }
      if (e.type !== 'stuck') continue;
      stuck.count++;
      stuck.firstTurn ??= e.turn;
    }
    if (!progressed) {
      outcome = 'stalled';
      break;
    }
    steps++;
    snap = runner.snapshot();
    const bottom = runner.depth();
    if (end !== null) {
      outcome = snap.domains.floors.deepest === bottom ? 'done' : 'early';
      break;
    }
    if (!idle(snap)) {
      idleSince = null;
      continue;
    }
    idleSince ??= snap.turn;
    // A dropped goal comes back after DROP_TURNS, so waiting longer than that means it is over.
    if (snap.turn - idleSince > DROP_TURNS) {
      outcome = snap.domains.floors.deepest === bottom ? 'done' : 'idle';
      break;
    }
  }

  const settled = end === null && (outcome === 'done' || outcome === 'idle');
  const turns = end !== null ? (turnedBack ?? end.turn) : settled && idleSince !== null ? idleSince : (turnedBack ?? snap.turn);
  const depths = [...reached.keys()].sort((a, b) => a - b);
  const floors = depths.map((depth, i): FloorResult => {
    const next = reached.get(depths[i + 1] ?? -1);
    const start = reached.get(depth) ?? 0;
    return {
      depth,
      turns: (next ?? turns) - start,
      explored: runner.snapshot({ floor: floorIdAt(depth) }).floor.explored.fraction,
    };
  });
  return {
    seed,
    outcome,
    turns,
    steps,
    explored: snap.floor.explored,
    depth: snap.domains.floors.deepest,
    bottom: runner.depth(),
    floors,
    items,
    gold: snap.domains.items.gold,
    stuck,
    kills,
    deaths,
    deathCauses,
    drinks,
    fleeFails,
    resisted,
    level: Math.max(1, ...Object.values(snap.domains.stats.members).map((m) => m.level.level)),
    contracts: snap.domains.quests.contracts.filter((c) => c.complete).length,
    equips,
    moments: chronicle.entries.length,
    turnedBack: turnedBack !== null,
    relicTaken,
    hash: runner.stateHash(),
    ...(end === null ? {} : { end: end.outcome, runTurns: end.turn }),
    atRisk: { ...snap.domains.run.atRisk },
    lost: { ...(runner.report()?.result.lost ?? {}) },
  };
}

/** Runs `count` seeds in a row from `from`. */
export function runSeeds(from: number, count: number, options: HeadlessOptions = {}): SeedResult[] {
  return Array.from({ length: count }, (_, i) => runSeed(from + i, options));
}

/** Why a seed needs a look, or `null` if it went fine. */
export function flagReason(result: SeedResult, cap = DEFAULT_TURN_CAP): string | null {
  const reasons: string[] = [];
  const where = `floor ${result.depth ?? 1} of ${result.bottom ?? 1}`;
  if (result.outcome === 'cap') reasons.push(`hit the turn cap (${cap} party turns) on ${where} at ${percent(result.explored)} explored`);
  if (result.outcome === 'idle') reasons.push(`settled on ${where} with no way further down`);
  if (result.outcome === 'early') reasons.push(`ended (${result.end ?? '?'}) on turn ${result.runTurns ?? result.turns} without reaching the bottom (${where})`);
  if (result.outcome === 'stalled') reasons.push(`stalled on turn ${result.turns}: nobody could act`);
  const { count, firstTurn } = result.stuck;
  if (count > 0) reasons.push(`stuck detection fired ${count} time${count === 1 ? '' : 's'} (first on turn ${firstTurn})`);
  return reasons.length === 0 ? null : reasons.join('; ');
}

function percent(e: Explored): string {
  return `${(e.fraction * 100).toFixed(1)}%`;
}

/** Game turns per floor over every floor of every result (one floor per result for old reports). */
export function floorTurns(results: readonly SeedResult[]): number[] {
  return results.flatMap((r) => r.floors?.map((f) => f.turns) ?? [r.turns]);
}

/** Party turns (steps) per hour of real time at 1× speed (`TURNS_PER_SECOND` steps/s). */
export const STEPS_PER_HOUR_AT_1X = TURNS_PER_SECOND * 3600;

/** Banked Renown of one run (`atRisk - lost`), or `null` for reports made before ETH-023. */
export function bankedRenown(r: SeedResult): number | null {
  if (r.lost === undefined) return null;
  return (r.atRisk?.renown ?? 0) - (r.lost.renown ?? 0);
}

/**
 * Banked Renown per hour at 1× speed (`TURNS_PER_SECOND` steps/s), computed over all runs that
 * report banked Renown and took at least one step: total banked Renown divided by total hours.
 * Returns `null` when no runs have both banked Renown and elapsed steps.
 */
export function renownPerHour(results: readonly SeedResult[]): number | null {
  let totalRenown = 0;
  let totalSteps = 0;
  let count = 0;
  for (const r of results) {
    const banked = bankedRenown(r);
    if (banked === null || r.steps <= 0) continue;
    totalRenown += banked;
    totalSteps += r.steps;
    count++;
  }
  if (count === 0 || totalSteps === 0) return null;
  return (totalRenown / totalSteps) * STEPS_PER_HOUR_AT_1X;
}

/** Median of `values`, or `null` when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Aggregate difficulty and economy summary over a sweep of `SeedResult`s (`DIFFICULTY_PHILOSOPHY.md` §2 & §9). */
export interface ReportSummary {
  runs: number;
  reachedBottom: number;
  endedAbove: number;
  settledAbove: number;
  hitCap: number;
  stalled: number;
  stuckRuns: number;
  outcomes: Record<RunOutcome, number>;
  winRatePct: number;
  retreatRatePct: number;
  wipeRatePct: number;
  floor3PlusCount: number;
  floor3PlusRatePct: number;
  relicRuns: number;
  relicReturnTripWipes: number;
  returnTripLethalityPct: number | null;
  turnsDoneMean: number | null;
  turnsDoneMedian: number | null;
  turnsDoneMin: number | null;
  turnsDoneMax: number | null;
  turnsAllMean: number | null;
  turnsAllMedian: number | null;
  turnsAllMin: number | null;
  turnsAllMax: number | null;
  turnsPerFloorMean: number | null;
  turnsPerFloorMax: number | null;
  depthMean: number | null;
  depthMedian: number | null;
  depthMin: number | null;
  depthMax: number | null;
  levelMean: number | null;
  levelMedian: number | null;
  levelMin: number | null;
  levelMax: number | null;
  killsMean: number | null;
  deathsTotal: number;
  deathsPerRun: number | null;
  deathCauses: Record<string, number>;
  itemsMean: number | null;
  itemsMax: number | null;
  goldMean: number | null;
  goldMax: number | null;
  renownBankedMean: number | null;
  renownPerHour1x: number | null;
}

const avg = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Computes `ReportSummary` over `results`, leaving missing fields as `null`. */
export function summarizeReport(results: readonly SeedResult[]): ReportSummary {
  const runs = results.length;
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const endCount = (o: RunOutcome) => results.filter((r) => r.end === o).length;
  const outcomes: Record<RunOutcome, number> = {
    victory: endCount('victory'),
    retreat: endCount('retreat'),
    wipe: endCount('wipe'),
  };
  const pct = (n: number) => (runs === 0 ? 0 : (n / runs) * 100);
  const floor3PlusCount = results.filter((r) => (r.depth ?? 1) >= 3).length;

  const tracksRelic = results.some((r) => r.relicTaken !== undefined);
  const relicRuns = tracksRelic ? results.filter((r) => r.relicTaken === true).length : 0;
  const relicReturnTripWipes = tracksRelic
    ? results.filter((r) => r.relicTaken === true && r.turnedBack === true && r.end === 'wipe').length
    : 0;
  const returnTripLethalityPct = relicRuns === 0 ? null : (relicReturnTripWipes / relicRuns) * 100;

  const doneTurns = results.filter((r) => r.outcome === 'done').map((r) => r.turns);
  const allTurns = results.map((r) => r.runTurns ?? r.turns);
  const perFloor = floorTurns(results);
  const depths = results.map((r) => r.depth ?? 1);
  const levels = results.flatMap((r) => (r.level === undefined ? [] : [r.level]));
  const picked = results.map((r) => r.items ?? 0);
  const gold = results.map((r) => r.gold ?? 0);
  const kills = results.map((r) => r.kills ?? 0);
  const deathsTotal = results.reduce((n, r) => n + (r.deaths ?? 0), 0);
  const deathCauses: Record<string, number> = {};
  for (const r of results) {
    for (const [cause, n] of Object.entries(r.deathCauses ?? {})) {
      deathCauses[cause] = (deathCauses[cause] ?? 0) + n;
    }
  }
  const banked = results.map(bankedRenown).filter((n): n is number => n !== null);

  return {
    runs,
    reachedBottom: count('done'),
    endedAbove: count('early'),
    settledAbove: count('idle'),
    hitCap: count('cap'),
    stalled: count('stalled'),
    stuckRuns: results.filter((r) => r.stuck.count > 0).length,
    outcomes,
    winRatePct: pct(outcomes.victory),
    retreatRatePct: pct(outcomes.retreat),
    wipeRatePct: pct(outcomes.wipe),
    floor3PlusCount,
    floor3PlusRatePct: pct(floor3PlusCount),
    relicRuns,
    relicReturnTripWipes,
    returnTripLethalityPct,
    turnsDoneMean: avg(doneTurns),
    turnsDoneMedian: median(doneTurns),
    turnsDoneMin: doneTurns.length === 0 ? null : Math.min(...doneTurns),
    turnsDoneMax: doneTurns.length === 0 ? null : Math.max(...doneTurns),
    turnsAllMean: avg(allTurns),
    turnsAllMedian: median(allTurns),
    turnsAllMin: allTurns.length === 0 ? null : Math.min(...allTurns),
    turnsAllMax: allTurns.length === 0 ? null : Math.max(...allTurns),
    turnsPerFloorMean: avg(perFloor),
    turnsPerFloorMax: perFloor.length === 0 ? null : Math.max(...perFloor),
    depthMean: avg(depths),
    depthMedian: median(depths),
    depthMin: depths.length === 0 ? null : Math.min(...depths),
    depthMax: depths.length === 0 ? null : Math.max(...depths),
    levelMean: avg(levels),
    levelMedian: median(levels),
    levelMin: levels.length === 0 ? null : Math.min(...levels),
    levelMax: levels.length === 0 ? null : Math.max(...levels),
    killsMean: avg(kills),
    deathsTotal,
    deathsPerRun: runs === 0 ? null : deathsTotal / runs,
    deathCauses,
    itemsMean: avg(picked),
    itemsMax: picked.length === 0 ? null : Math.max(0, ...picked),
    goldMean: avg(gold),
    goldMax: gold.length === 0 ? null : Math.max(0, ...gold),
    renownBankedMean: avg(banked),
    renownPerHour1x: renownPerHour(results),
  };
}

function fmtWholeOrOne(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** The report as text, for the console: one row per seed, a summary, then the flagged seeds. */
export function formatReport(results: readonly SeedResult[], cap = DEFAULT_TURN_CAP): string {
  const header = ['seed', 'turns', 'depth', 'explored', 'stuck', 'result', 'state hash'];
  const rows = results.map((r) => [
    String(r.seed),
    String(r.turns),
    `${r.depth ?? 1}/${r.bottom ?? 1}`,
    percent(r.explored),
    r.stuck.count === 0 ? '-' : String(r.stuck.count),
    r.end === undefined ? r.outcome : `${r.outcome} (${r.end})`,
    r.hash,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] as string).length)));
  // Numbers line up on the right, words on the left.
  const line = (cells: string[]) =>
    cells.map((c, i) => (i < 5 ? c.padStart(widths[i] as number) : c.padEnd(widths[i] as number))).join('  ').trimEnd();

  const s = summarizeReport(results);
  const summary = [
    `${s.runs} run${s.runs === 1 ? '' : 's'}: ${s.reachedBottom} reached the bottom`,
    ...(s.endedAbove > 0 ? [`${s.endedAbove} ended above it`] : []),
    ...(s.settledAbove > 0 ? [`${s.settledAbove} settled above it`] : []),
    `${s.hitCap} hit the turn cap`,
    ...(s.stalled > 0 ? [`${s.stalled} stalled`] : []),
    `${s.stuckRuns} triggered stuck detection`,
  ].join(', ');

  const ends = RUN_OUTCOMES.map((o) => [o, s.outcomes[o]] as const).filter(([, n]) => n > 0);
  const endLine = ends.length === 0 ? '' : `Run outcomes: ${ends.map(([o, n]) => `${n} ${o}`).join(', ')}.`;
  const returnTripPart =
    s.returnTripLethalityPct === null
      ? ''
      : ` Return-trip lethality (relic runs): ${s.returnTripLethalityPct.toFixed(1)}% (${s.relicReturnTripWipes}/${s.relicRuns}).`;
  const rateLine =
    s.runs === 0
      ? ''
      : `Outcome rates: win ${s.winRatePct.toFixed(1)}%, retreat ${s.retreatRatePct.toFixed(1)}%, wipe ${s.wipeRatePct.toFixed(1)}%.${returnTripPart}`;

  const turnLine =
    s.turnsDoneMean === null || s.turnsDoneMedian === null
      ? ''
      : `Turns to the bottom (done runs): mean ${Math.round(s.turnsDoneMean)}, min ${s.turnsDoneMin}, max ${s.turnsDoneMax}. Median: ${fmtWholeOrOne(s.turnsDoneMedian)}.`;
  const allTurnLine =
    s.turnsAllMean === null || s.turnsAllMedian === null
      ? ''
      : `Turns (all runs): mean ${Math.round(s.turnsAllMean)}, median ${fmtWholeOrOne(s.turnsAllMedian)}, min ${s.turnsAllMin}, max ${s.turnsAllMax}.`;

  const depthLine =
    s.depthMean === null || s.depthMedian === null || s.turnsPerFloorMean === null
      ? ''
      : `Depth reached: mean ${s.depthMean.toFixed(1)}, min ${s.depthMin}, max ${s.depthMax}. ` +
        `Turns per floor: mean ${Math.round(s.turnsPerFloorMean)}, max ${s.turnsPerFloorMax}. ` +
        `Median depth: ${s.depthMedian.toFixed(1)}, floor 3+: ${s.floor3PlusRatePct.toFixed(1)}% (${s.floor3PlusCount}/${s.runs}).`;

  const levelLine =
    s.levelMean === null || s.levelMedian === null
      ? ''
      : `Party level: mean ${s.levelMean.toFixed(2)}, median ${fmtWholeOrOne(s.levelMedian)} (min ${s.levelMin}, max ${s.levelMax}).`;

  const lootLine =
    s.itemsMean === null || s.goldMean === null
      ? ''
      : `Items picked up per run: mean ${s.itemsMean.toFixed(1)}, max ${s.itemsMax}. ` +
        `Gold per run: mean ${s.goldMean.toFixed(1)}, max ${s.goldMax}.`;

  const causeText = Object.entries(s.deathCauses)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cause, n]) => `${cause} ${n}`)
    .join(', ');
  const combatLine =
    s.killsMean === null || s.deathsPerRun === null
      ? ''
      : `Kills per run: mean ${s.killsMean.toFixed(1)}. ` +
        `Deaths: ${s.deathsTotal}${s.deathsTotal === 0 ? '' : ` (${causeText})`}. Deaths per run: ${s.deathsPerRun.toFixed(2)}.`;

  const renownLine =
    s.renownBankedMean === null || s.renownPerHour1x === null
      ? ''
      : `Renown banked per run: mean ${s.renownBankedMean.toFixed(1)}, ${s.renownPerHour1x.toFixed(1)}/hr at 1x (${TURNS_PER_SECOND} steps/s).`;

  const flagged = results.flatMap((r) => {
    const reason = flagReason(r, cap);
    return reason === null ? [] : [`  seed ${r.seed}: ${reason}`];
  });

  return [
    line(header),
    ...rows.map(line),
    '',
    `${summary}.`,
    ...(endLine === '' ? [] : [endLine]),
    ...(rateLine === '' ? [] : [rateLine]),
    ...(turnLine === '' ? [] : [turnLine]),
    ...(allTurnLine === '' ? [] : [allTurnLine]),
    ...(depthLine === '' ? [] : [depthLine]),
    ...(levelLine === '' ? [] : [levelLine]),
    ...(lootLine === '' ? [] : [lootLine]),
    ...(combatLine === '' ? [] : [combatLine]),
    ...(renownLine === '' ? [] : [renownLine]),
    flagged.length === 0 ? 'Flagged seeds: none.' : `Flagged seeds:\n${flagged.join('\n')}`,
  ].join('\n');
}

export interface SimArgs {
  /** The first seed. */
  from: number;
  /** How many seeds (one run each) to run. */
  seeds: number;
  cap: number;
  party: number;
  preset: HeadlessPreset;
  upgrades: string[];
  rules: HeadlessRulesPreset;
  /** Write the report as JSON to this file (`--json`). */
  json: string | null;
  /** Compare with the report in this file (`--baseline`). */
  baseline: string | null;
  /** Compare with the same run on this git ref (`--compare`). */
  compare: string | null;
  help: boolean;
}

export const USAGE = `Usage: npm run sim -- [--seeds N] [--from S] [--cap T] [--party P]
                      [--preset fresh|progressed] [--upgrades id1,id2,...] [--rules baseline|cautious]
                      [--json FILE] [--compare REF | --baseline FILE]

Runs N seeded runs headlessly, each until the party settles on the bottom floor or the cap is
hit, and reports per seed the turns taken, the depth reached, how much of the last floor was
explored and the final state hash, then the turns per floor. Seeds that hit the turn cap, settle
above the bottom or trigger stuck detection are listed at the end.

  --seeds N               how many seeds to run (default 10)
  --from S                the first seed (default 1)
  --cap T                 party turns allowed per run (default ${DEFAULT_TURN_CAP})
  --party P               adventurers in the party, 1 to ${MAX_PARTY} (default from preset/upgrades, 1 when fresh)
  --preset NAME           profile preset: fresh (default) or progressed
  --upgrades ID1,ID2,...  comma-separated upgrade node ids to apply (e.g. upgrade.hardy_recruits,upgrade.drill_yard)
  --rules NAME            behavior rule preset: baseline (default) or cautious
  --json FILE             also write the report as JSON, to keep as a baseline
  --compare REF           run the same seeds on git ref REF (e.g. origin/main, or merge-base for the
                          merge base with origin/main) and print a before/after table of the report
                          metrics
  --baseline FILE         print the before/after table against a report saved with --json
  --help                  show this text`;

function parsePreset(raw: string | undefined): HeadlessPreset {
  if (raw === undefined) return 'fresh';
  if ((HEADLESS_PRESETS as readonly string[]).includes(raw)) return raw as HeadlessPreset;
  throw new Error(`--preset must be one of ${HEADLESS_PRESETS.join(', ')}, got "${raw}"`);
}

function parseRulesPreset(raw: string | undefined): HeadlessRulesPreset {
  if (raw === undefined) return 'baseline';
  if ((HEADLESS_RULES_PRESETS as readonly string[]).includes(raw)) return raw as HeadlessRulesPreset;
  throw new Error(`--rules must be one of ${HEADLESS_RULES_PRESETS.join(', ')}, got "${raw}"`);
}

function parseUpgradeList(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  if (raw.trim() === '') throw new Error('--upgrades must be a comma-separated list of upgrade ids');
  const ids = raw.split(',').map((part) => part.trim());
  if (ids.some((id) => id === '')) throw new Error('--upgrades must not contain empty upgrade ids');
  return ids;
}

/** Reads the command line. Throws an `Error` with a readable message on a bad argument. */
export function parseSimArgs(argv: readonly string[]): SimArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      seeds: { type: 'string', short: 'n' },
      from: { type: 'string' },
      cap: { type: 'string' },
      party: { type: 'string' },
      preset: { type: 'string' },
      upgrades: { type: 'string' },
      rules: { type: 'string' },
      json: { type: 'string' },
      compare: { type: 'string' },
      baseline: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.compare !== undefined && values.baseline !== undefined) {
    throw new Error('Use --compare or --baseline, not both');
  }
  const preset = parsePreset(values.preset);
  const upgrades = parseUpgradeList(values.upgrades);
  const rules = parseRulesPreset(values.rules);
  const profile = buildHeadlessProfile(preset, upgrades);
  return {
    seeds: int('--seeds', values.seeds, 10, 1),
    from: int('--from', values.from, 1, 0),
    cap: int('--cap', values.cap, DEFAULT_TURN_CAP, 1),
    party: int('--party', values.party, partySize(profile), 1, MAX_PARTY),
    preset,
    upgrades,
    rules,
    json: values.json ?? null,
    compare: values.compare ?? null,
    baseline: values.baseline ?? null,
    help: values.help ?? false,
  };
}

/** Reads a whole-number option, or `fallback` when absent. Throws a readable `Error` when out of range. */
export function int(name: string, raw: string | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be a whole number from ${min}${max === Number.MAX_SAFE_INTEGER ? ' up' : ` to ${max}`}, got "${raw}"`);
  }
  return n;
}
