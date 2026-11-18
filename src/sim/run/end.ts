/**
 * How a run ends (CLAUDE.md §2, "Ending a run"): the party walks out of the dungeon (a victory if
 * the victory checks pass, else a retreat), or nobody in the party is left alive (a wipe).
 *
 * `step` calls `settleRun` after the commands and after every action. It notices party members
 * who have fallen (`fell`), the party turning back (`turnedBack`), the party leaving
 * (`leftDungeon`, from the floors domain's stairs action) and a wipe, and ends the run with
 * `runEnded`. Once `state.domains.run.end` is set, `step` does nothing.
 */
import { clonePlain } from '../../core';
import type { Emit, SimEvent } from '../events';
import { dungeonDepth, floorNode } from '../floors/dungeon';
import { VICTORY_CHECKS } from '../registries';
import type { EntityId, RunState } from '../state';
import type { RunOutcome, RunResult } from './result';
import { ACT_RETREAT_RUN } from './rules';
import { trackerExtras } from './trackers';

/** How and when the run ended: `state.domains.run.end`. */
export interface RunEnd {
  outcome: RunOutcome;
  /** The game turn it ended on. */
  turn: number;
  /** One or two sentences for the run summary: why it ended. */
  cause: string;
  /** The deepest floor the party reached. */
  depth: number;
}

/** Why the party turned back for the surface: a `retreat` command, or an `act.retreat_run` firing. */
export type LeavingReason = 'ordered' | 'rule';

/** The party heading out: `state.domains.run.leaving`. */
export interface Leaving {
  /** The game turn it turned back. */
  turn: number;
  reason: LeavingReason;
  /** The adventurer whose rule turned the party back, or `null` for an order. */
  by: EntityId | null;
  /** Whether `turnedBack` has been emitted for it yet (a command can't emit, so `settleRun` does). */
  announced: boolean;
}

/** What the host hands the UI when a run ends: the result to bank and how it ended. */
export interface RunReport {
  result: RunResult;
  end: RunEnd;
}

/**
 * Emits `runStarted` once, at the start of the run's first step (`createRun` can't emit): who
 * set out, with their class and race, for the log and the Codex.
 */
export function announceStart(state: RunState, emit: Emit): void {
  const slice = state.domains.run;
  if (slice.started) return;
  slice.started = true;
  const party = state.party.flatMap((id) => {
    const a = state.entities[id]?.adventurer;
    return a === undefined ? [] : [{ actor: id, name: a.name, classId: a.classId, raceId: a.raceId }];
  });
  emit({ type: 'runStarted', party, depth: dungeonDepth(state) });
}

/** True once the run has ended. */
export function runOver(state: RunState): boolean {
  return state.domains.run.end !== null;
}

/** The living party members' ids, in party order. */
export function livingParty(state: RunState): EntityId[] {
  return state.party.filter((id) => {
    const actor = state.entities[id]?.actor;
    return actor !== undefined && actor.hp > 0;
  });
}

/**
 * Looks at what happened since `events[from]` and ends the run if it is over. Returns true if the
 * run has ended. Emits `turnedBack`, `fell` and `runEnded` as it finds them.
 */
export function settleRun(state: RunState, events: readonly SimEvent[], from: number, emit: Emit): boolean {
  const slice = state.domains.run;
  if (slice.end !== null) return true;

  let left: Extract<SimEvent, { type: 'leftDungeon' }> | null = null;
  for (let i = from; i < events.length; i++) {
    const e = events[i] as SimEvent;
    if (e.type === 'ruleFired' && e.action === ACT_RETREAT_RUN.id && slice.leaving === null) {
      slice.leaving = { turn: state.turn, reason: 'rule', by: e.actor, announced: false };
    } else if (e.type === 'leftDungeon') {
      left = e;
    }
  }
  const leaving = slice.leaving;
  if (leaving !== null && !leaving.announced) {
    leaving.announced = true;
    emit({ type: 'turnedBack', actor: leaving.by, reason: leaving.reason });
  }

  for (const id of state.party) {
    const entity = state.entities[id];
    if (entity?.actor === undefined || entity.actor.hp > 0 || slice.fallen.includes(id)) continue;
    slice.fallen.push(id);
    const depth = floorNode(state, entity.floor).depth;
    emit({ type: 'fell', actor: id, name: entity.adventurer?.name ?? `#${id}`, floor: entity.floor, pos: { x: entity.pos.x, y: entity.pos.y }, depth });
  }

  if (left !== null) {
    const victory = victoryDetail(state);
    end(state, emit, victory.won ? 'victory' : 'retreat', leftCause(state, victory.detail, victory.won));
    return true;
  }
  if (livingParty(state).length === 0) {
    end(state, emit, 'wipe', wipeCause(state));
    return true;
  }
  return false;
}

/** Whether walking out now wins the run: at least one victory check applies and all that apply are met. */
export function victoryDetail(state: RunState): { won: boolean; detail: string } {
  const results = VICTORY_CHECKS.map((c) => c.check(state)).filter((r) => r.applies);
  const won = results.length > 0 && results.every((r) => r.met);
  return { won, detail: results.map((r) => r.detail).join(' ') };
}

function end(state: RunState, emit: Emit, outcome: RunOutcome, cause: string): void {
  const depth = state.domains.floors.deepest;
  state.domains.run.end = { outcome, turn: state.turn, cause, depth };
  emit({ type: 'runEnded', outcome, cause, depth });
}

function leftCause(state: RunState, checks: string, won: boolean): string {
  const deepest = state.domains.floors.deepest;
  const bottom = dungeonDepth(state);
  const reached = deepest === bottom ? `reached the bottom of the dungeon (floor ${bottom})` : `reached floor ${deepest} of ${bottom}`;
  const leaving = state.domains.run.leaving;
  const why =
    leaving === null
      ? `The party ${reached} and walked out of the dungeon.`
      : leaving.reason === 'ordered'
        ? `The party ${reached}, was ordered to retreat and walked out of the dungeon.`
        : `The party ${reached}, turned back and walked out of the dungeon.`;
  if (checks === '') return why;
  return won ? `${checks} ${why}` : `${why} Not everything was done: ${checks}`;
}

function wipeCause(state: RunState): string {
  const fallen = state.domains.run.fallen;
  const lastId = fallen.at(-1);
  const last = lastId === undefined ? undefined : state.entities[lastId];
  if (last === undefined) return 'Nobody in the party is left standing.';
  const name = last.adventurer?.name ?? `#${last.id}`;
  const depth = floorNode(state, last.floor).depth;
  return fallen.length === 1 ? `${name} fell on floor ${depth}.` : `${name} fell on floor ${depth}, the last of the party standing.`;
}

/**
 * The finished run's `RunResult`, for meta's `applyRunResult`: the at-risk totals, the turns,
 * the deepest floor and every tracker's extras (plus `extras['run.end']`, the `RunEnd`). `lost`
 * stays empty until the wipe penalty (ETH-023). Throws if the run hasn't ended.
 */
export function runResult(state: RunState): RunResult {
  const runEnd = state.domains.run.end;
  if (runEnd === null) throw new Error('The run has not ended');
  return clonePlain({
    outcome: runEnd.outcome,
    atRisk: state.domains.run.rewards.atRisk,
    lost: {},
    turns: state.turn,
    deepestDepth: state.domains.floors.deepest,
    extras: { ...trackerExtras(state), 'run.end': runEnd },
  });
}

/** The finished run's report for the UI. Throws if the run hasn't ended. */
export function runReport(state: RunState): RunReport {
  const result = runResult(state);
  return { result, end: result.extras['run.end'] as RunEnd };
}
