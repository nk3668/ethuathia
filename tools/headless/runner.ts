/**
 * Headless seed runner: steps seeded runs through `SimSession` (or `createRun` + `step` with custom rules)
 * and records per-seed metrics into `SeedResult`.
 */
import { masteryShares } from '../../src/meta';
import {
  ACT_WAIT,
  CHRONICLE_TRACKER,
  createRun,
  DROP_TURNS,
  dungeonDepth,
  floorIdAt,
  runOver,
  runReport,
  SimSession,
  snapshot,
  stateHash,
  step,
} from '../../src/sim';
import type {
  Explored,
  RewardAmounts,
  Rule,
  RunConfig,
  RunOutcome,
  RunReport,
  SimEvent,
  Snapshot,
  ViewOptions,
} from '../../src/sim';
import { buildHeadlessConfig, DEFAULT_TURN_CAP, resolveHeadlessRules } from './config';
import type { HeadlessOptions } from './config';

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
  /** The mean level of the party's members where the run stopped (ETH-145): a fair size-to-size comparison. */
  meanLevel?: number;
  /** Contracts complete when the run stopped (ETH-024). Missing from reports before it. */
  contracts?: number;
  /** Times a party member put on a piece of gear (ETH-043). */
  equips?: number;
  /** Entries in the run chronicle where the run stopped (ETH-120). Missing from reports before it. */
  moments?: number;
  /** Class Mastery XP the run banked, summed over its classes (ETH-087). Only for runs that ended. */
  masteryXp?: number;
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

/** The mean of the members' levels, `1` for an empty party. */
function meanMemberLevel(levels: readonly number[]): number {
  return levels.length === 0 ? 1 : levels.reduce((a, b) => a + b, 0) / levels.length;
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
        const cause = e.killer?.def ?? slain.get(e.actor) ?? 'unknown';
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
    meanLevel: meanMemberLevel(Object.values(snap.domains.stats.members).map((m) => m.level.level)),
    contracts: snap.domains.quests.contracts.filter((c) => c.complete).length,
    equips,
    moments: chronicle.entries.length,
    turnedBack: turnedBack !== null,
    relicTaken,
    hash: runner.stateHash(),
    ...(end === null ? {} : { end: end.outcome, runTurns: end.turn }),
    atRisk: { ...snap.domains.run.atRisk },
    lost: { ...(runner.report()?.result.lost ?? {}) },
    ...masteryOf(runner.report()),
  };
}

/** The Mastery XP a finished run banks (ETH-087), for `SeedResult.masteryXp`. */
function masteryOf(report: RunReport | null): { masteryXp?: number } {
  return report === null ? {} : { masteryXp: masteryShares(report.result).reduce((n, c) => n + c.xp, 0) };
}

/** Runs `count` seeds in a row from `from`. */
export function runSeeds(from: number, count: number, options: HeadlessOptions = {}): SeedResult[] {
  return Array.from({ length: count }, (_, i) => runSeed(from + i, options));
}
