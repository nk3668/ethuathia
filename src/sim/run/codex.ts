/**
 * Codex discovery (docs/ARCHITECTURE.md, Contracts, "Codex discoveries"): which content the
 * party met this run, and how. The Codex (ETH-065) fills in from it.
 *
 * Discoveries come from sim events. Each domain says which of its event types discover what in
 * the `discoveries` map of its `SimDomain` (core's is `CORE_DISCOVERIES` in `coreEvents.ts`);
 * the hub joins them into `DISCOVERY_RULES`, and `CODEX_TRACKER` reduces the event stream with
 * them. A discovery key is always a content id (`monster.cave_rat`, `feature.door`).
 */
import type { EventOf, SimEvent, SimEventType } from '../events';
import { DISCOVERY_RULES } from '../registries';
import type { RunTracker } from '../domain';

/** How a content entry was met: seen, killed, or used (quaffed, read, opened, prayed at…). */
export type CodexMark = 'seen' | 'killed' | 'used';

/** Every mark, in the order a discovery lists them. */
export const CODEX_MARKS: readonly CodexMark[] = ['seen', 'killed', 'used'];

/** One discovery: content `id` was met in the way `mark` says. */
export interface Discovery {
  readonly id: string;
  readonly mark: CodexMark;
}

/**
 * Discoveries so far, keyed by content id: the marks each one has earned, in `CODEX_MARKS` order
 * and without repeats. Plain data. The run's tracker state and the profile's Codex share it.
 */
export type CodexDiscoveries = Readonly<Record<string, readonly CodexMark[]>>;

/** What an event of type `K` discovers. Return `[]` when this event discovers nothing. */
export type DiscoveryRule<K extends SimEventType = SimEventType> = (event: EventOf<K>) => readonly Discovery[];

/**
 * A domain's discovery map: for each of its event types that discovers something, what it
 * discovers. One line per event type, in the domain's own module, e.g.
 * `monsterSighted: (e) => [{ id: e.monster, mark: 'seen' }]`.
 */
export type DiscoveryRules = { readonly [K in SimEventType]?: DiscoveryRule<K> };

/** Sorts marks into `CODEX_MARKS` order without repeats. */
function canonical(marks: readonly CodexMark[]): CodexMark[] {
  return CODEX_MARKS.filter((m) => marks.includes(m));
}

/** `discoveries` with `discovery` added. The same object if it was already there. */
export function addDiscovery(discoveries: CodexDiscoveries, discovery: Discovery): CodexDiscoveries {
  const marks = discoveries[discovery.id];
  if (marks?.includes(discovery.mark) === true) return discoveries;
  return { ...discoveries, [discovery.id]: canonical([...(marks ?? []), discovery.mark]) };
}

/** Everything in `a` and `b`. Ids keep `a`'s order, then `b`'s new ones. Returns `a` if `b` adds nothing. */
export function mergeDiscoveries(a: CodexDiscoveries, b: CodexDiscoveries): CodexDiscoveries {
  let out = a;
  for (const [id, marks] of Object.entries(b)) {
    for (const mark of marks) out = addDiscovery(out, { id, mark });
  }
  return out;
}

/** What `event` discovers, by every domain's rules for its type, in domain order. */
export function discoveriesOf(event: SimEvent): Discovery[] {
  const rules = DISCOVERY_RULES.get(event.type);
  return rules === undefined ? [] : rules.flatMap((rule) => rule(event));
}

/**
 * The Codex discovery tracker. Its state is the run's `CodexDiscoveries`. At run end ETH-062 puts
 * it in `RunResult.extras['track.codex']` (every tracker's final state goes under its id), and
 * the profile's `codex` slice merges it.
 */
export const CODEX_TRACKER: RunTracker<CodexDiscoveries> = {
  id: 'track.codex',
  init: () => ({}),
  reduce: (state, event) => {
    let next = state;
    for (const discovery of discoveriesOf(event)) next = addDiscovery(next, discovery);
    return next;
  },
};
