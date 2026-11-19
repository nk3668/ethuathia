/**
 * The run domain (ETH-062): how a run ends (victory, retreat, wipe), run trackers and the at-risk
 * rewards.
 *
 * - `result.ts`: `RunResult`, what a finished run hands to meta, and the currency ids.
 * - `trackers.ts`: the tracker framework (every domain's `RunTracker` over the event stream into
 *   `rewards.atRisk` and `RunResult.extras`) and the base trackers (depth, turns, kills, deaths).
 * - `end.ts`: noticing the end (`settleRun`), its cause, and building the `RunResult`.
 * - `wipeLoss.ts`: the share of the at-risk earnings a wipe loses (ETH-023).
 * - `rules.ts`: `cond.heading_out` and `act.retreat_run`.
 * - `requirements.ts`: `track.requirements`, the watched run-scope requirements met (ETH-121).
 * - Here: the events, the `retreat` command, the state and snapshot slices and the invariants.
 *
 * Never import `domains.ts` or `index.ts` from this folder.
 */
import type { Pos } from '../../core';
import { requirementKey } from '../../content';
import type { Requirement } from '../../content';
import type { ActionRecord } from '../actions';
import type { Killer } from '../combat/death';
import type { CommandRecord } from '../commands';
import type { RunTracker, SimDomain, SnapshotCtx } from '../domain';
import { registerInvariant } from '../invariants';
import { TRACKER_LIST } from '../registries';
import type { EntityId, FloorId, RunConfig } from '../state';
import { livingParty } from './end';
import type { Leaving, LeavingReason, RunEnd } from './end';
import { RUN_OUTCOMES } from './result';
import type { RewardAmounts, RunOutcome } from './result';
import { RUN_DOMAIN_CONDITIONS, RUN_DOMAIN_RULE_ACTIONS } from './rules';
import { CHRONICLE_TRACKER, chronicleProblems, defineChronicleKind, momentAt } from './chronicle';
import type { ChronicleRules } from './chronicle';
import { CODEX_TRACKER } from './codex';
import { REQUIREMENTS_TRACKER, REQUIREMENTS_TRACKER_ID, watchedRequirements } from './requirements';
import type { RequirementsTrackerState } from './requirements';
import { initTrackers, RUN_DOMAIN_TRACKERS, trackerRewards } from './trackers';

export * from './chronicle';
export * from './codex';
export * from './result';
export * from './trackers';
export * from './end';
export * from './rules';
export * from './wipeLoss';
export * from './requirements';

/** The events this domain emits (bodies, without `turn`). Each has wording in `ui/shell/logText/run.ts`. */
export type RunDomainEvent =
  /**
   * The run's first event: who set out (with class and race ids, which the Codex discovers) into
   * a dungeon `depth` floors deep.
   */
  | { type: 'runStarted'; party: { actor: EntityId; name: string; classId: string; raceId: string }[]; depth: number }
  /** The party turned back for the surface: ordered (`actor` null) or by `actor`'s retreat rule. */
  | { type: 'turnedBack'; actor: EntityId | null; reason: LeavingReason }
  /**
   * A party member's HP reached 0: they fell on `floor` (at `depth`), struck down by `killer`
   * (ETH-075: a monster, a status and who inflicted it, …), or `null` when nothing is known.
   */
  | { type: 'fell'; actor: EntityId; name: string; floor: FloorId; pos: Pos; depth: number; killer: Killer | null }
  /**
   * The party was wiped out: `lost` is what the wipe takes from this run's at-risk earnings
   * (`share` of each, ETH-023), out of `atRisk`; the rest is banked. Just before `runEnded`, only
   * on a wipe that loses something. `lost` equals the `RunResult`'s. `depth` is the deepest floor
   * reached (`RunEnd.depth`), for the run chronicle (ETH-120).
   */
  | { type: 'earningsLost'; lost: RewardAmounts; atRisk: RewardAmounts; share: number; depth: number }
  /** The run is over. Always the last event of a run. */
  | { type: 'runEnded'; outcome: RunOutcome; cause: string; depth: number };

/** The action requests this domain defines. Leaving uses the floors domain's `stairs`. */
export type RunDomainRequest = never;

/** Turn the whole party back: everyone heads up and out of the dungeon, ending the run as a retreat. */
export interface RetreatCommand {
  type: 'retreat';
}

/** The commands this domain accepts. */
export type RunDomainCommand = RetreatCommand;

/** This domain's slice of the run state, at `state.domains.run`. Plain data. */
export interface RunDomainState {
  /**
   * The reward flow (docs/ARCHITECTURE.md, Contracts, "Rewards"): run trackers reduce sim
   * events into `rewards.atRisk` (`trackers.ts`); at run end it goes into the `RunResult`, and
   * meta's `applyRunResult` banks it, less `RunResult.lost` on a wipe (`wipeLoss`). The sim never
   * touches banked currency.
   */
  rewards: { atRisk: RewardAmounts };
  /** Whether `runStarted` has been emitted (on the first step). */
  started: boolean;
  /** Every run tracker's state, keyed by tracker id. */
  trackers: Record<string, unknown>;
  /** Set once the party turns back for the surface. */
  leaving: Leaving | null;
  /** Party members who have fallen, in the order they fell. */
  fallen: EntityId[];
  /** `null` while the run goes on; how it ended once it has. */
  end: RunEnd | null;
}

/** This domain's slice of the snapshot, at `snapshot.domains.run`. Plain data. */
export interface RunDomainSnapshot {
  /** This run's earnings so far, not yet banked. */
  atRisk: RewardAmounts;
  /** True once the party has turned back for the surface. */
  leaving: boolean;
  end: RunEnd | null;
}

/** Optional parts this domain adds to `Entity`. */
export interface RunDomainParts {}

/** Fields this domain adds to `RunConfig`. */
export interface RunDomainConfig {
  /**
   * Run-scope requirements to watch (ETH-121): `track.requirements` records each one that holds
   * at the end of some step. Meta's `buildRunConfig` fills it with the `metInRun` milestones
   * still locked. Leave it out to watch none.
   */
  watchRequirements?: readonly Requirement[];
}

/** This domain's row in `DomainTypes` (`src/sim/domain.ts`). */
export interface RunDomainTypes {
  event: RunDomainEvent;
  request: RunDomainRequest;
  command: RunDomainCommand;
  state: RunDomainState;
  snapshot: RunDomainSnapshot;
}

export const RUN_DOMAIN_ACTIONS: ActionRecord<RunDomainRequest> = {};

export const RUN_DOMAIN_COMMANDS: CommandRecord<RunDomainCommand> = {
  retreat: {
    type: 'retreat',
    apply(state) {
      const slice = state.domains.run;
      if (slice.end !== null) return 'The run is over';
      if (slice.leaving !== null) return 'The party is already heading out';
      slice.leaving = { turn: state.turn, reason: 'ordered', by: null, announced: false };
      return null;
    },
  },
};

/** The state slice for a new run. */
export function initRunDomain(_config: RunConfig): RunDomainState {
  return { rewards: { atRisk: {} }, started: false, trackers: initTrackers(), leaving: null, fallen: [], end: null };
}

/** The snapshot slice. Shares nothing with the state. */
export function runDomainSnapshot({ state }: SnapshotCtx): RunDomainSnapshot {
  const slice = state.domains.run;
  return {
    atRisk: { ...slice.rewards.atRisk },
    leaving: slice.leaving !== null,
    end: slice.end === null ? null : { ...slice.end },
  };
}

// Invariants for this domain's state (docs/ARCHITECTURE.md §11.1).

registerInvariant('run.rewardsAtRisk', (state) => {
  const problems = Object.entries(state.domains.run.rewards.atRisk)
    .filter(([, amount]) => !Number.isFinite(amount) || amount < 0)
    .map(([currency, amount]) => `at-risk ${currency} is ${amount}, not a finite amount of 0 or more`);
  // Nothing but the trackers writes it.
  const expected = trackerRewards(state);
  const actual = state.domains.run.rewards.atRisk;
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    if ((expected[key] ?? 0) !== (actual[key] ?? 0)) problems.push(`at-risk ${key} is ${actual[key] ?? 0}, the trackers say ${expected[key] ?? 0}`);
  }
  return problems;
});

registerInvariant('run.trackers', (state) => {
  const problems: string[] = [];
  const states = state.domains.run.trackers;
  for (const tracker of TRACKER_LIST) if (!Object.hasOwn(states, tracker.id)) problems.push(`tracker "${tracker.id}" has no state`);
  for (const id of Object.keys(states)) {
    if (!TRACKER_LIST.some((t) => t.id === id)) problems.push(`state for unknown tracker "${id}"`);
  }
  return problems;
});

registerInvariant('run.requirements', (state) => {
  const s = state.domains.run.trackers[REQUIREMENTS_TRACKER_ID] as RequirementsTrackerState | undefined;
  if (s === undefined) return [];
  const problems: string[] = [];
  if (!Array.isArray(s.met)) return ['the requirements tracker has no met list'];
  const watched = new Set(watchedRequirements(state).map(requirementKey));
  if (new Set(s.met).size !== s.met.length) problems.push('a requirement is recorded as met twice');
  for (const key of s.met) if (!watched.has(key)) problems.push(`met requirement ${key} is not watched`);
  return problems;
});

registerInvariant('run.end', (state) => {
  const problems: string[] = [];
  const { end, leaving, fallen } = state.domains.run;
  if (leaving !== null && (!Number.isSafeInteger(leaving.turn) || leaving.turn < 0 || leaving.turn > state.turn)) {
    problems.push(`the party turned back on turn ${leaving.turn}`);
  }
  if (new Set(fallen).size !== fallen.length) problems.push('a party member fell twice');
  for (const id of fallen) {
    if (!state.party.includes(id)) problems.push(`fallen ${id} is not in the party`);
    else if ((state.entities[id]?.actor?.hp ?? 0) > 0) problems.push(`fallen ${id} has HP left`);
  }
  if (end === null) return problems;
  if (!RUN_OUTCOMES.includes(end.outcome)) problems.push(`outcome "${end.outcome}" is not a run outcome`);
  if (end.turn > state.turn || end.turn < 0) problems.push(`the run ended on turn ${end.turn}, now ${state.turn}`);
  const living = livingParty(state).length;
  if (end.outcome === 'wipe' && living > 0) problems.push(`a wipe with ${living} party member(s) alive`);
  if (end.outcome !== 'wipe' && living === 0) problems.push(`a ${end.outcome} with nobody alive`);
  return problems;
});

registerInvariant('run.chronicle', (state) => chronicleProblems(state.domains.run.trackers[CHRONICLE_TRACKER.id], state.turn));

/**
 * A run chronicle moment (ETH-120): a party member fell. `actors` are the fallen, then their
 * killer and a status's inflicter when those are actors; `ids` the killer's content id (and the
 * inflicter's). The most notable kind.
 */
export const CHRONICLE_FELL = defineChronicleKind({ id: 'adventurerFell', priority: 100 });

/**
 * A run chronicle moment: a wipe cost a share of the run's earnings. It has no one place (`floor`
 * and `pos` are `null`); `amount` is the share lost, in percent.
 */
export const CHRONICLE_EARNINGS_LOST = defineChronicleKind({ id: 'earningsLost', priority: 80 });

/** Which of this domain's events are run chronicle moments. */
export const RUN_DOMAIN_CHRONICLE: ChronicleRules = {
  fell: (e) => {
    const k = e.killer;
    const actors = [e.actor, ...(k === null || k.id === null ? [] : [k.id]), ...(k?.source === undefined ? [] : [k.source.id])];
    const ids = k === null ? [] : [k.def, ...(k.source === undefined ? [] : [k.source.def])];
    return momentAt(CHRONICLE_FELL, e, actors, ids, { depth: e.depth });
  },
  earningsLost: (e) => ({
    kind: CHRONICLE_EARNINGS_LOST.id,
    turn: e.turn,
    floor: null,
    pos: null,
    depth: e.depth,
    actors: [],
    ids: [],
    amount: Math.round(e.share * 100),
  }),
};

/** What this domain registers with the shared code, in this order. */
export const RUN_DOMAIN: SimDomain<RunDomainTypes> = {
  actions: RUN_DOMAIN_ACTIONS,
  commands: RUN_DOMAIN_COMMANDS,
  init: initRunDomain,
  snapshot: runDomainSnapshot,
  conditions: RUN_DOMAIN_CONDITIONS,
  ruleActions: RUN_DOMAIN_RULE_ACTIONS,
  trackers: [...RUN_DOMAIN_TRACKERS, CODEX_TRACKER, REQUIREMENTS_TRACKER as RunTracker<unknown>, CHRONICLE_TRACKER as RunTracker<unknown>],
  // The party's classes and races are met when the run starts.
  discoveries: {
    runStarted: (e) => e.party.flatMap((m) => [{ id: m.classId, mark: 'seen' as const }, { id: m.raceId, mark: 'seen' as const }]),
  },
  chronicle: RUN_DOMAIN_CHRONICLE,
  chronicleKinds: [CHRONICLE_FELL, CHRONICLE_EARNINGS_LOST],
};
