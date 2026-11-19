/**
 * The run chronicle (ETH-120, docs/ARCHITECTURE.md, Contracts, "Run chronicle"): the run's notable
 * moments (a level-up, a contract complete, a fall), kept as compact plain-data entries for the
 * whole run. The Highlights feed, the run summary's "Moments", the run history and later epitaphs,
 * ballads, the nemesis and the time-away summary read it, never the UI's rolling event buffer.
 *
 * Notability is declared where the events are: each domain lists its moment kinds in
 * `SimDomain.chronicleKinds` (`defineChronicleKind`, with a priority) and says which of its events
 * are moments in `SimDomain.chronicle`, a map typed per event type like `discoveries`. The hub
 * joins them into `CHRONICLE_KINDS` and `CHRONICLE_RULES` (`registries.ts`), in domain order, and
 * `CHRONICLE_TRACKER` reduces the event stream with them.
 *
 * Entries carry no wording: the UI words each kind (`ui/shell/logText`, `MOMENT_TEXT`).
 */
import type { Pos } from '../../core';
import type { RunTracker } from '../domain';
import type { EventOf, SimEvent, SimEventType } from '../events';
import { CHRONICLE_KINDS, CHRONICLE_RULES } from '../registries';
import type { EntityId, FloorId } from '../state';

/** How many entries a run's chronicle keeps (tunable). Past it, the lowest-priority kind goes first. */
export const CHRONICLE_LIMIT = 200;

/**
 * A kind of moment. `id` is the highlight id when the moment is also a log highlight
 * (`leveledUp`, `adventurerFell`, …); a test keeps the two in step. `priority` decides what a full
 * chronicle drops first (lowest first) and what a short list keeps (highest first).
 */
export interface ChronicleKind {
  readonly id: string;
  readonly priority: number;
}

/** Declares a moment kind. Keep one constant per kind and list it in the domain's `chronicleKinds`. */
export function defineChronicleKind(kind: ChronicleKind): ChronicleKind {
  return Object.freeze({ ...kind });
}

/** One notable moment. Plain data, no wording. */
export interface ChronicleEntry {
  /** The `ChronicleKind` id. */
  kind: string;
  turn: number;
  /** Where it happened, or `null` for a moment with no one place (the wipe's loss). */
  floor: FloorId | null;
  pos: Pos | null;
  /** The dungeon depth it happened at (0 when unknown). */
  depth: number;
  /** The entities it is about, the main one first (the adventurer who fell, then their killer). */
  actors: EntityId[];
  /** The content ids it is about (the killer's def, the item found, the contract). */
  ids: string[];
  /** A number the moment is about, when there is one: the level reached, HP left, an item's value. */
  amount?: number;
}

/** A run's chronicle: its entries, oldest first. The tracker's state. */
export interface Chronicle {
  entries: ChronicleEntry[];
}

/** What an event of type `K` adds to the chronicle, or `null` when this one is not notable. */
export type ChronicleRule<K extends SimEventType = SimEventType> = (event: EventOf<K>) => ChronicleEntry | null;

/** A domain's chronicle map: for each of its event types that can be a moment, the entry it makes. */
export type ChronicleRules = { readonly [K in SimEventType]?: ChronicleRule<K> };

/**
 * The depth of a main-line floor id (`d4` → 4), or 0 for any other id. Floor ids are `d<depth>`
 * (`floorIdAt`), so a rule whose event names only the floor can still say how deep it was.
 */
export function depthOfFloor(floor: FloorId): number {
  const match = /^d(\d+)$/.exec(floor);
  return match === null ? 0 : Number(match[1]);
}

/**
 * The entry for a moment of `kind` at an event's place: the helper rules use.
 * `depth` defaults to the floor id's depth (`depthOfFloor`).
 */
export function momentAt(
  kind: ChronicleKind,
  event: { readonly turn: number; readonly floor: FloorId; readonly pos: Pos },
  actors: readonly EntityId[],
  ids: readonly string[] = [],
  extra: { depth?: number; amount?: number } = {},
): ChronicleEntry {
  return {
    kind: kind.id,
    turn: event.turn,
    floor: event.floor,
    pos: { x: event.pos.x, y: event.pos.y },
    depth: extra.depth ?? depthOfFloor(event.floor),
    actors: [...actors],
    ids: [...ids],
    ...(extra.amount === undefined ? {} : { amount: extra.amount }),
  };
}

/** A kind's priority, or 0 for an unknown kind. */
export function chroniclePriority(kind: string): number {
  return CHRONICLE_KINDS.get(kind)?.priority ?? 0;
}

/** The entries `event` adds, by every domain's rule for its type, in domain order. */
export function chronicleEntriesOf(event: SimEvent): ChronicleEntry[] {
  const rules = CHRONICLE_RULES.get(event.type);
  if (rules === undefined) return [];
  const out: ChronicleEntry[] = [];
  for (const rule of rules) {
    const entry = rule(event);
    if (entry !== null) out.push(entry);
  }
  return out;
}

/**
 * `chronicle` with `entry` added at the end. Past `limit` it drops one entry: the earliest of the
 * lowest-priority kind, never the run's first entry nor the newest one. Never changes `chronicle`.
 */
export function addChronicleEntry(chronicle: Chronicle, entry: ChronicleEntry, limit = CHRONICLE_LIMIT): Chronicle {
  const entries = [...chronicle.entries, entry];
  while (entries.length > Math.max(2, limit)) entries.splice(dropIndex(entries), 1);
  return { entries };
}

/** The entry a full chronicle drops: the earliest of the lowest priority, between the first and the last. */
function dropIndex(entries: readonly ChronicleEntry[]): number {
  let best = 1;
  let lowest = Infinity;
  for (let i = 1; i < entries.length - 1; i++) {
    const p = chroniclePriority((entries[i] as ChronicleEntry).kind);
    if (p < lowest) {
      lowest = p;
      best = i;
    }
  }
  return best;
}

/**
 * The `n` most notable entries, in the order they happened: highest priority first, the earlier
 * on a tie. The run summary's "Moments" and the history's kept entries use it.
 */
export function topMoments(entries: readonly ChronicleEntry[], n: number): ChronicleEntry[] {
  const picked = entries
    .map((entry, index) => ({ entry, index, p: chroniclePriority(entry.kind) }))
    .sort((a, b) => b.p - a.p || a.index - b.index)
    .slice(0, Math.max(0, n));
  return picked.sort((a, b) => a.index - b.index).map((x) => x.entry);
}

/**
 * `track.chronicle`: the run's notable moments, reduced from every event with `CHRONICLE_RULES`
 * and capped at `CHRONICLE_LIMIT`. Its extras, `RunResult.extras['track.chronicle']`, are the
 * entries. The UI runs it over every event it receives too (`simStore.chronicle`).
 */
export const CHRONICLE_TRACKER: RunTracker<Chronicle> = {
  id: 'track.chronicle',
  init: () => ({ entries: [] }),
  reduce: (state, event) => {
    let next = state;
    for (const entry of chronicleEntriesOf(event)) next = addChronicleEntry(next, entry);
    return next;
  },
  extras: (state) => state.entries,
};

/** Problems with a chronicle's entries, for the `run.chronicle` invariant. */
export function chronicleProblems(chronicle: unknown, turn: number): string[] {
  if (typeof chronicle !== 'object' || chronicle === null || !Array.isArray((chronicle as Chronicle).entries)) {
    return ['the chronicle has no entries list'];
  }
  const { entries } = chronicle as Chronicle;
  const problems: string[] = [];
  if (entries.length > CHRONICLE_LIMIT) problems.push(`the chronicle holds ${entries.length} entries, over ${CHRONICLE_LIMIT}`);
  let last = 0;
  entries.forEach((e, i) => {
    if (!CHRONICLE_KINDS.has(e.kind)) problems.push(`chronicle entry ${i} has the unknown kind "${e.kind}"`);
    if (!Number.isSafeInteger(e.turn) || e.turn < last || e.turn > turn) problems.push(`chronicle entry ${i} is on turn ${e.turn}, out of order`);
    if (!Array.isArray(e.actors) || !Array.isArray(e.ids)) problems.push(`chronicle entry ${i} lacks its actors or ids`);
    if ((e.floor === null) !== (e.pos === null)) problems.push(`chronicle entry ${i} has a floor without a place, or the reverse`);
    last = Math.max(last, e.turn);
  });
  return problems;
}
