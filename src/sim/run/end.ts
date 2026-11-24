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
import { deathPredicate, killerOf } from '../combat/death';
import type { Killer } from '../combat/death';
import type { Emit, SimEvent } from '../events';
import { depthRevealed, dungeonDepth, floorNode, floorTypeOf } from '../floors/dungeon';
import { VICTORY_CHECKS } from '../registries';
import type { EntityId, RunState } from '../state';
import type { RunOutcome, RunResult } from './result';
import { ACT_RETREAT_RUN } from './rules';
import { projectedRewards, trackerExtras } from './trackers';
import { WIPE_LOSS_SHARE, wipeLoss } from './wipeLoss';

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

/** One party member as the run ended, in `RunResult.extras['run.party']` (ETH-048). */
export interface PartyMemberRecord {
  actor: EntityId;
  name: string;
  classId: string;
  raceId: string;
  /** The adventurer's profile record id (ETH-119), when they have one. */
  recordId?: string;
  /**
   * A temporary companion (ETH-089): they count for 50% of their XP toward their class's Mastery,
   * outside the diminishing-share order (ETH-087). Nothing sets it yet.
   */
  companion?: true;
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
  emit({
    type: 'runStarted',
    party: partyRecords(state),
    depth: depthRevealed(state) ? dungeonDepth(state) : null,
    floorType: floorTypeOf(state, state.dungeon.entry),
  });
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

  // Who fell in this stretch of events (the wipe's cause names the last one's killer).
  let lastKiller: Killer | null = null;
  for (const id of state.party) {
    const entity = state.entities[id];
    if (entity?.actor === undefined || entity.actor.hp > 0 || slice.fallen.includes(id)) continue;
    slice.fallen.push(id);
    const depth = floorNode(state, entity.floor).depth;
    lastKiller = killerOf(state, entity, events, from);
    emit({
      type: 'fell',
      actor: id,
      name: entity.adventurer?.name ?? `#${id}`,
      floor: entity.floor,
      pos: { x: entity.pos.x, y: entity.pos.y },
      depth,
      killer: lastKiller,
    });
  }

  if (left !== null) {
    const victory = victoryDetail(state);
    end(state, events, emit, victory.won ? 'victory' : 'retreat', leftCause(state, victory.detail, victory.won));
    return true;
  }
  if (livingParty(state).length === 0) {
    end(state, events, emit, 'wipe', wipeCause(state, lastKiller));
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

/**
 * Ends the run. `stepEvents` is every event of this step so far (`step`'s own array). On a wipe it
 * first emits `earningsLost` with what the wipe takes: the step's trackers haven't run yet, so
 * the at-risk totals are projected over the step's events and the `runEnded` to come, which is
 * what `reduceTrackers` will make of them and what `runResult` then reads.
 */
function end(state: RunState, stepEvents: readonly SimEvent[], emit: Emit, outcome: RunOutcome, cause: string): void {
  const depth = state.domains.floors.deepest;
  state.domains.run.end = { outcome, turn: state.turn, cause, depth };
  const ended = { type: 'runEnded', outcome, cause, depth } as const;
  if (outcome === 'wipe') {
    const atRisk = projectedRewards(state, [...stepEvents, { ...ended, turn: state.turn }]);
    const lost = wipeLoss(atRisk, outcome);
    if (Object.keys(lost).length > 0) emit({ type: 'earningsLost', lost, atRisk, share: WIPE_LOSS_SHARE, depth });
  }
  emit(ended);
}

function leftCause(state: RunState, checks: string, won: boolean): string {
  const deepest = state.domains.floors.deepest;
  const bottom = dungeonDepth(state);
  const revealed = depthRevealed(state);
  const reached =
    deepest === bottom
      ? `reached the bottom of the dungeon (floor ${bottom})`
      : revealed
        ? `reached floor ${deepest} of ${bottom}`
        : `reached floor ${deepest}`;
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

/** The wipe's cause: the last to fall, what killed them (ETH-075) and where. */
function wipeCause(state: RunState, killer: Killer | null): string {
  const fallen = state.domains.run.fallen;
  const lastId = fallen.at(-1);
  const last = lastId === undefined ? undefined : state.entities[lastId];
  if (last === undefined) return 'Nobody in the party is left standing.';
  const line = deathLine(last.adventurer?.name ?? `#${last.id}`, killer, floorNode(state, last.floor).depth);
  return fallen.length === 1 ? `${line}.` : `${line}, the last of the party standing.`;
}

/** "Mira was slain by a slate hound on floor 4": a death as a clause, without the full stop (ETH-075). */
export function deathLine(name: string, killer: Killer | null, depth: number, tense: 'past' | 'present' = 'past'): string {
  return `${name} ${deathPredicate(killer, tense)} on floor ${depth}`;
}

/**
 * The finished run's `RunResult`, for meta's `applyRunResult`: the at-risk totals, the turns,
 * the deepest floor and every tracker's extras (plus `extras['run.end']`, the `RunEnd`, and
 * `extras['run.party']`, the party's `PartyMemberRecord`s). `lost` is what a wipe takes
 * (`wipeLoss`, ETH-023), empty for a victory or a retreat. Throws if the run hasn't ended.
 */
export function runResult(state: RunState): RunResult {
  const runEnd = state.domains.run.end;
  if (runEnd === null) throw new Error('The run has not ended');
  const atRisk = state.domains.run.rewards.atRisk;
  return clonePlain({
    outcome: runEnd.outcome,
    atRisk,
    lost: wipeLoss(atRisk, runEnd.outcome),
    turns: state.turn,
    deepestDepth: state.domains.floors.deepest,
    extras: { ...trackerExtras(state), 'run.end': runEnd, 'run.party': partyRecords(state) },
  });
}

/** Who set out, in party order, for the run summary and the run history. */
function partyRecords(state: RunState): PartyMemberRecord[] {
  return state.party.flatMap((id) => {
    const a = state.entities[id]?.adventurer;
    if (a === undefined) return [];
    const record: PartyMemberRecord = { actor: id, name: a.name, classId: a.classId, raceId: a.raceId };
    if (a.recordId !== undefined) record.recordId = a.recordId;
    return [record];
  });
}

/** The finished run's report for the UI. Throws if the run hasn't ended. */
export function runReport(state: RunState): RunReport {
  const result = runResult(state);
  return { result, end: result.extras['run.end'] as RunEnd };
}
