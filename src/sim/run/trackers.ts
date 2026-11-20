/**
 * Run trackers (docs/ARCHITECTURE.md, Contracts, "Rewards"): the framework that runs every
 * domain's `RunTracker` over the event stream, and the run domain's own base trackers.
 *
 * How it works, end to end:
 *
 * 1. `createRun` starts every tracker at `init()`, in `state.domains.run.trackers[id]`.
 * 2. At the end of each step, `reduceTrackers` folds that step's events (in order) into each
 *    tracker's state, then gives each tracker with an `afterStep` the run (ETH-121), then
 *    recomputes `state.domains.run.rewards.atRisk` as the sum of every
 *    tracker's `rewards(state)`. Nothing else writes `atRisk`.
 * 3. At run end, `trackerExtras` gives each tracker's `extras(state)` (default: its state) for
 *    `RunResult.extras[id]`.
 */
import { deathPredicate } from '../combat/death';
import type { Killer } from '../combat/death';
import type { RunTracker } from '../domain';
import type { SimEvent } from '../events';
import { TRACKER_LIST } from '../registries';
import type { EntityId, RunState } from '../state';
import { applyRewardMultiplier, rewardMultiplier } from '../stats/runModifiers';
import { RENOWN, TROPHIES } from './result';
import type { RewardAmounts } from './result';

// ---------------------------------------------------------------------------------------------
// Tunable reward constants (provisional; check changes with `npm run sim`)

/** Base Renown coefficient for each floor reached below the first (`RENOWN_PER_FLOOR × floor^RENOWN_DEPTH_EXPONENT`). */
export const RENOWN_PER_FLOOR = 10;

/** Depth scaling exponent for per-floor Renown (ETH-085). */
export const RENOWN_DEPTH_EXPONENT = 1.3;

/** Game turns survived per point of Renown. */
export const TURNS_PER_RENOWN = 50;

/** Trophies per kill, times the monster's difficulty (at least 1). Used once kills exist (ETH-060). */
export const TROPHIES_PER_DIFFICULTY = 1;

/** Per-floor depth Renown entry, for the run summary breakdown (ETH-085). */
export interface FloorRenown {
  readonly depth: number;
  readonly renown: number;
}

/**
 * Renown earned for reaching floor `depth`: `0` on floor 1, and
 * `Math.round(RENOWN_PER_FLOOR × depth^RENOWN_DEPTH_EXPONENT)` for each floor below the first.
 */
export function renownForFloor(depth: number): number {
  if (depth <= 1) return 0;
  return Math.round(RENOWN_PER_FLOOR * depth ** RENOWN_DEPTH_EXPONENT);
}

/** Per-floor Renown for each floor reached below the first (`2..deepest`), empty when `deepest <= 1`. */
export function renownByFloor(deepest: number): FloorRenown[] {
  const out: FloorRenown[] = [];
  for (let d = 2; d <= deepest; d++) out.push({ depth: d, renown: renownForFloor(d) });
  return out;
}

/** Total depth Renown for reaching `deepest`: the sum of `renownForFloor(d)` for floors `2..deepest`. */
export function depthRenown(deepest: number): number {
  let total = 0;
  for (let d = 2; d <= deepest; d++) total += renownForFloor(d);
  return total;
}

/** Renown earned for surviving `turns` game turns: 1 per `TURNS_PER_RENOWN`. */
export function turnsRenown(turns: number): number {
  return Math.floor(Math.max(0, turns) / TURNS_PER_RENOWN);
}

// ---------------------------------------------------------------------------------------------
// The framework

/** Every registered tracker's starting state, keyed by tracker id. */
export function initTrackers(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tracker of TRACKER_LIST) out[tracker.id] = tracker.init();
  return out;
}

/**
 * Folds `events` into every tracker's state, in tracker order and then event order, and
 * recomputes the at-risk rewards. Called by `step` once per step with that step's events.
 */
export function reduceTrackers(state: RunState, events: readonly SimEvent[]): void {
  const slice = state.domains.run;
  for (const tracker of TRACKER_LIST) {
    let s = Object.hasOwn(slice.trackers, tracker.id) ? slice.trackers[tracker.id] : tracker.init();
    for (const event of events) s = tracker.reduce(s, event);
    slice.trackers[tracker.id] = s;
  }
  // After every tracker has the events, so one watching the run sees this step whole (ETH-121).
  for (const tracker of TRACKER_LIST) {
    if (tracker.afterStep !== undefined) slice.trackers[tracker.id] = tracker.afterStep(slice.trackers[tracker.id], state);
  }
  slice.rewards.atRisk = trackerRewards(state);
}

/**
 * The sum of every tracker's `rewards` for its current state, times the reward multiplier
 * (`rewardMultiplier`, ETH-115: 1 + the run modifiers' bonuses, rounded down per currency).
 * Amounts of 0 are left out.
 */
export function trackerRewards(state: RunState): RewardAmounts {
  const states = state.domains.run.trackers;
  return sumTrackerRewards((tracker) => (Object.hasOwn(states, tracker.id) ? states[tracker.id] : undefined), rewardMultiplier(state));
}

/**
 * What `rewards.atRisk` will be once `events` (the step so far) are folded in, without changing
 * any tracker's state. The run end uses it to work out a wipe's loss before the step's
 * `reduceTrackers` runs (`end.ts`).
 */
export function projectedRewards(state: RunState, events: readonly SimEvent[]): RewardAmounts {
  const states = state.domains.run.trackers;
  return sumTrackerRewards((tracker) => {
    let s = Object.hasOwn(states, tracker.id) ? states[tracker.id] : tracker.init();
    for (const event of events) s = tracker.reduce(s, event);
    return s;
  }, rewardMultiplier(state));
}

/**
 * Every tracker's `rewards` for the state `stateOf` gives it (skipped when `undefined`), summed,
 * then each currency times `multiplier` (base → ×multiplier; the wipe loss comes after, from
 * this); zeros left out.
 */
function sumTrackerRewards(stateOf: (tracker: RunTracker<unknown>) => unknown, multiplier: number): RewardAmounts {
  const total: RewardAmounts = {};
  for (const tracker of TRACKER_LIST) {
    if (tracker.rewards === undefined) continue;
    const s = stateOf(tracker);
    if (s === undefined) continue;
    for (const [currency, amount] of Object.entries(tracker.rewards(s))) {
      if (amount !== 0) total[currency] = (total[currency] ?? 0) + amount;
    }
  }
  if (multiplier === 1) return total;
  const out: RewardAmounts = {};
  for (const [currency, amount] of Object.entries(total)) {
    const scaled = applyRewardMultiplier(amount, multiplier);
    if (scaled !== 0) out[currency] = scaled;
  }
  return out;
}

/** Each tracker's `extras` (default: its state), keyed by tracker id, for `RunResult.extras`. */
export function trackerExtras(state: RunState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tracker of TRACKER_LIST) {
    const s = state.domains.run.trackers[tracker.id];
    out[tracker.id] = tracker.extras === undefined ? s : tracker.extras(s);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The base trackers

/** `track.depth`: the deepest floor reached, worth `depthRenown(deepest)` Renown (ETH-085). */
export const DEPTH_TRACKER: RunTracker<{ deepest: number }> = {
  id: 'track.depth',
  init: () => ({ deepest: 1 }),
  reduce: (s, e) => (e.type === 'floorEntered' && e.depth > s.deepest ? { deepest: e.depth } : s),
  rewards: (s) => ({ [RENOWN]: depthRenown(s.deepest) }),
};

/** `track.turns`: game turns survived (the last event's turn), one Renown per `TURNS_PER_RENOWN`. */
export const TURNS_TRACKER: RunTracker<{ turns: number }> = {
  id: 'track.turns',
  init: () => ({ turns: 0 }),
  reduce: (s, e) => (e.turn > s.turns ? { turns: e.turn } : s),
  rewards: (s) => ({ [RENOWN]: turnsRenown(s.turns) }),
};

/** Trophies for one kill of a monster of `difficulty`. */
export function trophiesForKill(difficulty: number): number {
  return TROPHIES_PER_DIFFICULTY * Math.max(1, difficulty);
}

/**
 * `track.kills`: monsters the party killed and the Trophies they are worth, from the combat
 * domain's `killed` events: `trophiesForKill(threat)` per kill by a party member.
 */
export const KILLS_TRACKER: RunTracker<{ kills: number; trophies: number }> = {
  id: 'track.kills',
  init: () => ({ kills: 0, trophies: 0 }),
  reduce: (s, e) =>
    e.type === 'killed' && e.byParty && e.threat > 0 ? { kills: s.kills + 1, trophies: s.trophies + trophiesForKill(e.threat) } : s,
  rewards: (s) => ({ [TROPHIES]: s.trophies }),
};

/** One party member who fell, for the run summary and the graveyard (M5). */
export interface FallenRecord {
  actor: EntityId;
  name: string;
  depth: number;
  turn: number;
  /** What struck them down (ETH-075), or `null` when nothing is known. */
  killer: Killer | null;
  /** How they died, as the run summary words it: "was slain by a slate hound" (`deathPredicate`). */
  how: string;
}

/** `track.deaths`: who fell, where, when and to what, from the run domain's `fell` events. */
export const DEATHS_TRACKER: RunTracker<{ fallen: FallenRecord[] }> = {
  id: 'track.deaths',
  init: () => ({ fallen: [] }),
  reduce: (s, e) =>
    e.type === 'fell'
      ? {
          fallen: [
            ...s.fallen,
            { actor: e.actor, name: e.name, depth: e.depth, turn: e.turn, killer: e.killer, how: deathPredicate(e.killer) },
          ],
        }
      : s,
};

/** The run domain's trackers, in the order they run. */
export const RUN_DOMAIN_TRACKERS = [DEPTH_TRACKER, TURNS_TRACKER, KILLS_TRACKER, DEATHS_TRACKER] as readonly RunTracker<unknown>[];
