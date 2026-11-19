/**
 * The objective engine (ETH-114, docs/ARCHITECTURE.md "Objective engine"): goals with progress
 * toward a target, tracked per run with an owner. Contracts (ETH-024) are the first owner;
 * bounties, conducts, taboos, building quests and achievements are later ones.
 *
 * - **Kinds** (`OBJECTIVE_KINDS`): what each data `Objective` kind (`src/content/objectives.ts`)
 *   means. A `state` kind recomputes its progress from the run each time (a `recover` objective is
 *   1 of 1 while a living party member carries the item); an `events` kind folds the run's events
 *   into a plain `counter` kept in the slice, so it survives a save. A kind's `goal` is `reach`
 *   (complete once `current ≥ target`) or `avoid` (failed once `current > target`; complete at run
 *   end if it never was).
 * - **Tracking:** `state.domains.quests.objectives` holds the run's `TrackedObjective`s, each with
 *   an `owner` (`contract`, `bounty`, `conduct`, `taboo`, `quest`). `trackObjective` adds one
 *   mid-run; the contracts are added by `initQuests`. An `events` objective counts only events
 *   folded after it was tracked.
 * - **Syncing:** `syncObjectives` runs from the quests domain's `turnStart`, `turnEnd` and
 *   `stepEnd` hooks. It folds the step's events not yet folded (`slice.folded` is how many; reset
 *   to 0 at the end of each step, so it is always 0 between steps), recomputes progress, and
 *   returns what changed. The engine emits no events: each **owner** words its own changes
 *   (contracts emit `contractProgress` / `contractCompleted` / `contractLost`). Once the run has
 *   ended, progress is frozen and each `avoid` objective still active becomes `complete`.
 * - **Results:** the `quests.objectives` tracker copies every objective's owner, key and status,
 *   so `RunResult.extras['quests.objectives']` is where meta reads them (`objectiveRecords`,
 *   `completedObjectives`).
 */
import { defName, objectiveOwnerKey, OBJECTIVE_KIND_NAMES } from '../../content';
import type { EventMatch, Objective, ObjectiveKindName, ObjectiveOwner } from '../../content';
import { checkRequirement, describeRequirement } from '../ai/requirements';
import type { RunTracker } from '../domain';
import type { SimEvent } from '../events';
import { inventoryOf } from '../items/inventory';
import type { ActorEntity, RunState } from '../state';

/** Where a tracked objective stands. `failed` only happens to an `avoid` objective. */
export type ObjectiveStatus = 'active' | 'complete' | 'failed';

/** One objective the run tracks: `state.domains.quests.objectives[i]`. Plain data. */
export interface TrackedObjective {
  /** Unique in the run. By default the owner's key, `contract:contract.recover_relic` (`objectiveOwnerKey`). */
  key: string;
  owner: ObjectiveOwner;
  /** What it asks (a copy of the owner's data). */
  spec: Objective;
  /** An `events` kind's count of the events it has folded; absent for a `state` kind. */
  counter?: number;
  /** Progress: `current` of `target`. An `avoid` objective's `current` is how often it was broken (target 0). */
  current: number;
  target: number;
  status: ObjectiveStatus;
}

/** One tracked objective as the run result lists it: `RunResult.extras['quests.objectives']`. */
export interface ObjectiveRecord {
  key: string;
  owner: ObjectiveOwner;
  status: ObjectiveStatus;
}

/** How far along an objective is right now, and who (if anyone) made it so. */
export interface ObjectiveProgress {
  current: number;
  target: number;
  by: ActorEntity | undefined;
}

/** A tracked objective that moved or changed status in one `syncObjectives`, for its owner to word. */
export interface ObjectiveChange {
  /** The objective, as it is now (the slice's own object). */
  readonly objective: TrackedObjective;
  /** Its progress and status before. */
  readonly before: { readonly current: number; readonly target: number; readonly status: ObjectiveStatus };
  /** Who made the progress, when the kind knows (a `recover` objective's carrier). */
  readonly by: ActorEntity | undefined;
  /** True when the change is the run end settling it (an `avoid` objective kept to the end). */
  readonly atRunEnd: boolean;
}

/** What one objective kind means. One entry per `Objective` kind in `OBJECTIVE_KINDS`. */
export interface ObjectiveKind<O extends Objective = Objective> {
  readonly kind: O['kind'];
  /** `state`: recomputed from the run each sync. `events`: folded from events into `counter`. */
  readonly measure: 'state' | 'events';
  /** `reach`: complete once `current ≥ target`. `avoid`: failed once `current > target`, complete at run end otherwise. */
  readonly goal: 'reach' | 'avoid';
  /** The target `current` is measured against. */
  target(spec: O): number;
  /** Progress right now. `counter` is the objective's counter (0 for a `state` kind). Changes nothing. */
  progress(state: RunState, spec: O, counter: number): { current: number; by?: ActorEntity };
  /** An `events` kind's next counter after `event`. Pure. */
  reduce?(counter: number, event: SimEvent, spec: O): number;
  /** The objective as an instruction, for tooltips and the Codex: "Reach floor 3". */
  describe(spec: O): string;
}

type KindTable = { readonly [K in ObjectiveKindName]: ObjectiveKind<Extract<Objective, { kind: K }>> };

/** The party member carrying `item`, alive, in party order; `undefined` if nobody is. */
export function carrierOf(state: RunState, item: string): ActorEntity | undefined {
  for (const id of state.party) {
    const e = state.entities[id];
    if (e?.actor === undefined || e.actor.hp <= 0) continue;
    if (inventoryOf(e).some((i) => i.def === item)) return e as ActorEntity;
  }
  return undefined;
}

/** Whether `event` is of type `type` and has every field of `match`. */
export function eventMatches(event: SimEvent, type: string, match: EventMatch | undefined): boolean {
  if (event.type !== type) return false;
  if (match === undefined) return true;
  const fields = event as unknown as Readonly<Record<string, unknown>>;
  for (const [field, value] of Object.entries(match)) if (fields[field] !== value) return false;
  return true;
}

/** " where victimDef is Slate Hound and byParty is true": a match in words (ids by their def's name). */
function matchText(match: EventMatch | undefined): string {
  const parts = Object.entries(match ?? {}).map(([field, value]) => `${field} is ${typeof value === 'string' ? defName(value) : String(value)}`);
  return parts.length === 0 ? '' : ` where ${parts.join(' and ')}`;
}

/** Every objective kind's meaning, by kind. A new kind is one entry here (and its data in content). */
export const OBJECTIVE_KINDS: KindTable = {
  recover: {
    kind: 'recover',
    measure: 'state',
    goal: 'reach',
    target: () => 1,
    progress(state, spec) {
      const by = carrierOf(state, spec.item);
      return by === undefined ? { current: 0 } : { current: 1, by };
    },
    describe: (spec) => `Find the ${defName(spec.item)} on the bottom floor and carry it out`,
  },
  count: {
    kind: 'count',
    measure: 'events',
    goal: 'reach',
    target: (spec) => spec.count,
    progress: (_state, spec, counter) => ({ current: Math.min(counter, spec.count) }),
    reduce: (counter, event, spec) => (eventMatches(event, spec.event, spec.match) ? counter + 1 : counter),
    describe: (spec) => `Make "${spec.event}" happen ${spec.count === 1 ? 'once' : `${spec.count} times`}${matchText(spec.match)}`,
  },
  reach: {
    kind: 'reach',
    measure: 'state',
    goal: 'reach',
    target: (spec) => spec.depth,
    progress: (state, spec) => ({ current: Math.min(state.domains.floors.deepest, spec.depth) }),
    describe: (spec) => `Reach floor ${spec.depth}`,
  },
  condition: {
    kind: 'condition',
    measure: 'state',
    goal: 'reach',
    target: () => 1,
    progress: (state, spec) => ({ current: checkRequirement({ state }, spec.requirement).ok ? 1 : 0 }),
    describe: (spec) => `Bring about: ${describeRequirement(spec.requirement)}`,
  },
  avoid: {
    kind: 'avoid',
    measure: 'events',
    goal: 'avoid',
    target: () => 0,
    progress: (_state, _spec, counter) => ({ current: counter }),
    reduce: (counter, event, spec) => (eventMatches(event, spec.event, spec.match) ? counter + 1 : counter),
    describe: (spec) => `Never let "${spec.event}" happen${matchText(spec.match)}`,
  },
};

// The table and the content's list of kinds must agree.
for (const name of OBJECTIVE_KIND_NAMES) if (OBJECTIVE_KINDS[name].kind !== name) throw new Error(`Objective kind "${name}" is misfiled`);

/** The kind entry for `spec`. */
export function objectiveKind(spec: Objective): ObjectiveKind {
  return OBJECTIVE_KINDS[spec.kind] as ObjectiveKind;
}

/** `spec` in words: "Reach floor 3". */
export function describeObjective(spec: Objective): string {
  return objectiveKind(spec).describe(spec);
}

/** How far along `spec` is in `state` with `counter` (an `events` kind's count; 0 if left out). Changes nothing. */
export function measureObjective(state: RunState, spec: Objective, counter = 0): ObjectiveProgress {
  const kind = objectiveKind(spec);
  const { current, by } = kind.progress(state, spec, counter);
  return { current, target: kind.target(spec), by };
}

/** The status progress gives a `goal` (`ended`: the run is over, so an unbroken `avoid` is kept). */
export function objectiveStatus(goal: ObjectiveKind['goal'], current: number, target: number, ended: boolean): ObjectiveStatus {
  if (goal === 'avoid') return current > target ? 'failed' : ended ? 'complete' : 'active';
  return current >= target ? 'complete' : 'active';
}

/**
 * A new tracked objective for `owner`, nothing done yet (`current` 0; a `state` kind's first sync
 * measures it). `key` defaults to the owner's key. The spec is copied, so the slice shares nothing
 * with content.
 */
export function newObjective(owner: ObjectiveOwner, spec: Objective, key = objectiveOwnerKey(owner)): TrackedObjective {
  const kind = objectiveKind(spec);
  const target = kind.target(spec);
  const out: TrackedObjective = {
    key,
    owner: { kind: owner.kind, id: owner.id },
    spec: JSON.parse(JSON.stringify(spec)) as Objective,
    current: 0,
    target,
    status: objectiveStatus(kind.goal, 0, target, false),
  };
  if (kind.measure === 'events') out.counter = 0;
  return out;
}

/**
 * Starts tracking `spec` for `owner` in this run and returns it. It counts only events folded from
 * now on: called from a turn hook after `syncObjectives`, that is strictly from now. Throws if
 * `key` (default: the owner's key) is already tracked.
 */
export function trackObjective(state: RunState, owner: ObjectiveOwner, spec: Objective, key = objectiveOwnerKey(owner)): TrackedObjective {
  const list = state.domains.quests.objectives;
  if (list.some((o) => o.key === key)) throw new Error(`The objective "${key}" is already tracked`);
  const objective = newObjective(owner, spec, key);
  list.push(objective);
  return objective;
}

/** The tracked objective with this key, or `undefined`. */
export function findObjective(state: RunState, key: string): TrackedObjective | undefined {
  return state.domains.quests.objectives.find((o) => o.key === key);
}

/** The tracked objectives `owner` has, in tracking order. */
export function objectivesOf(state: RunState, owner: ObjectiveOwner): TrackedObjective[] {
  return state.domains.quests.objectives.filter((o) => o.owner.kind === owner.kind && o.owner.id === owner.id);
}

/**
 * Folds the step's events not yet folded (`events` is the step's array; `slice.folded` how many
 * of it are done) into each active `events` objective, then remeasures every objective and
 * returns the ones that moved or changed status, in tracking order. Once the run has ended,
 * progress is frozen and each `avoid` objective still active becomes `complete`. Emits nothing.
 */
export function syncObjectives(state: RunState, events: readonly SimEvent[] = []): ObjectiveChange[] {
  const slice = state.domains.quests;
  const fresh = events.slice(Math.min(slice.folded, events.length));
  slice.folded = events.length;
  const ended = state.domains.run.end !== null;
  const changes: ObjectiveChange[] = [];
  for (const o of slice.objectives) {
    // A broken `avoid` stays broken.
    if (o.status === 'failed') continue;
    const kind = objectiveKind(o.spec);
    const before = { current: o.current, target: o.target, status: o.status };
    let by: ActorEntity | undefined;
    // A count already done stops counting; a `state` kind is remeasured whatever its status.
    if (kind.measure === 'events' && o.status === 'active') {
      let counter = o.counter ?? 0;
      if (kind.reduce !== undefined) for (const e of fresh) counter = kind.reduce(counter, e, o.spec);
      o.counter = counter;
    }
    // A finished run's progress stays as it ended; events from its last step still count.
    if (!ended || kind.measure === 'events') {
      const p = measureObjective(state, o.spec, o.counter ?? 0);
      o.current = p.current;
      o.target = p.target;
      by = p.by;
    }
    o.status = objectiveStatus(kind.goal, o.current, o.target, ended);
    if (o.current !== before.current || o.target !== before.target || o.status !== before.status) {
      changes.push({ objective: o, before, by, atRunEnd: ended });
    }
  }
  return changes;
}

/**
 * Ends the step for the engine: syncs once more over the whole step (`stepEnd`), then forgets the
 * step's event count, so `folded` is 0 between steps. Returns the changes, as `syncObjectives`.
 */
export function finishObjectivesStep(state: RunState, events: readonly SimEvent[]): ObjectiveChange[] {
  const changes = syncObjectives(state, events);
  state.domains.quests.folded = 0;
  return changes;
}

// ---------------------------------------------------------------------------------------------
// Results

export const OBJECTIVES_TRACKER_ID = 'quests.objectives';

/** Every tracked objective's owner, key and status, in tracking order. Fresh plain data. */
export function objectiveRecordsOf(state: RunState): ObjectiveRecord[] {
  return state.domains.quests.objectives.map((o) => ({ key: o.key, owner: { kind: o.owner.kind, id: o.owner.id }, status: o.status }));
}

/**
 * `quests.objectives`: a copy of every tracked objective's owner, key and status, taken from the
 * run after each step, so `RunResult.extras['quests.objectives']` (an `ObjectiveRecord[]`) holds
 * their final statuses. Earns nothing.
 */
export const OBJECTIVES_TRACKER: RunTracker<{ objectives: ObjectiveRecord[] }> = {
  id: OBJECTIVES_TRACKER_ID,
  init: () => ({ objectives: [] }),
  reduce: (s) => s,
  afterStep(s, run) {
    const now = run.domains.quests.objectives;
    const same =
      now.length === s.objectives.length && now.every((o, i) => s.objectives[i]?.key === o.key && s.objectives[i]?.status === o.status);
    return same ? s : { objectives: objectiveRecordsOf(run) };
  },
  extras: (s) => s.objectives,
};

/**
 * The objective records a `RunResult`'s extras list, or none if they are missing or malformed (a
 * result from before ETH-114).
 */
export function objectiveRecords(extras: Readonly<Record<string, unknown>>): ObjectiveRecord[] {
  const value = extras[OBJECTIVES_TRACKER_ID];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is ObjectiveRecord =>
      typeof r === 'object' &&
      r !== null &&
      typeof (r as ObjectiveRecord).key === 'string' &&
      typeof (r as ObjectiveRecord).status === 'string' &&
      typeof (r as ObjectiveRecord).owner?.kind === 'string' &&
      typeof (r as ObjectiveRecord).owner?.id === 'string',
  );
}

/** The `objectiveOwnerKey`s of the objectives a run ended with complete, once each: what `objectiveDone` milestones read. */
export function completedObjectives(extras: Readonly<Record<string, unknown>>): string[] {
  const keys = objectiveRecords(extras)
    .filter((r) => r.status === 'complete')
    .map((r) => objectiveOwnerKey(r.owner));
  return [...new Set(keys)];
}

// ---------------------------------------------------------------------------------------------
// Invariant

/** Problems with the tracked objectives, for the `quests.objectives` invariant. */
export function objectiveProblems(state: RunState): string[] {
  const problems: string[] = [];
  const slice = state.domains.quests;
  if (slice.folded !== 0) problems.push(`${slice.folded} events are marked folded between steps (expected 0)`);
  const ended = state.domains.run.end !== null;
  const keys = new Set<string>();
  for (const o of slice.objectives) {
    const label = `objective "${o.key}"`;
    if (keys.has(o.key)) problems.push(`${label} is tracked twice`);
    keys.add(o.key);
    if (!Object.hasOwn(OBJECTIVE_KINDS, o.spec.kind)) {
      problems.push(`${label} has unknown kind "${String(o.spec.kind)}"`);
      continue;
    }
    const kind = objectiveKind(o.spec);
    const whole = (n: unknown) => Number.isSafeInteger(n) && (n as number) >= 0;
    if (!whole(o.current) || !whole(o.target)) {
      problems.push(`${label} progress is ${o.current}/${o.target}`);
      continue;
    }
    if (o.target !== kind.target(o.spec)) problems.push(`${label} target is ${o.target}, its kind says ${kind.target(o.spec)}`);
    if (kind.goal === 'reach' && o.current > o.target) problems.push(`${label} is past its target at ${o.current}/${o.target}`);
    if (kind.measure === 'events' ? !whole(o.counter) : o.counter !== undefined) {
      problems.push(`${label} counter is ${String(o.counter)} for a ${kind.measure} kind`);
    }
    const expected = objectiveStatus(kind.goal, o.current, o.target, ended);
    if (o.status !== expected) problems.push(`${label} is ${o.status} at ${o.current}/${o.target}, expected ${expected}`);
  }
  return problems;
}
