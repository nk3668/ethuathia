/**
 * The core domain's events: turns, movement, doors, the AI trace and rejected input
 * (docs/ARCHITECTURE.md §2.4 and Contracts). Feature domains declare theirs in their own
 * `src/sim/<domain>/index.ts`; `events.ts` joins them all into `SimEventBody`.
 */
import type { Pos } from '../core';
import { FEATURE_DOOR } from '../content';
import type { RuleRef } from './ai/types';
import { defineChronicleKind, momentAt } from './run/chronicle';
import type { ChronicleKind, ChronicleRules } from './run/chronicle';
import type { DiscoveryRules } from './run/codex';
import type { EntityId, FloorId } from './state';

/** What each core event carries. `emit` adds the `turn`. */
export type CoreEvent =
  /** An actor spent its turn doing nothing. */
  | { type: 'waited'; actor: EntityId }
  /** An actor stepped from one tile to a neighboring one on the same floor. */
  | { type: 'moved'; actor: EntityId; from: Pos; to: Pos }
  /**
   * Two party members traded places: `actor` stepped from `from` to `to`, and `other`, who stood
   * on `to`, stepped back onto `from`.
   */
  | { type: 'swapped'; actor: EntityId; other: EntityId; from: Pos; to: Pos }
  /** An actor opened the door entity `door`, which stands at `pos`. */
  | { type: 'doorOpened'; actor: EntityId; door: EntityId; pos: Pos }
  /**
   * An actor's chosen action could not be done, for `reason`. The actor waits instead, so a bad
   * decision still costs a turn and can never stall the scheduler.
   */
  | { type: 'actionFailed'; actor: EntityId; action: string; reason: string }
  /**
   * The AI trace: the decision engine took `rule` for `actor`. `condition` and `action` are the
   * rule's condition and rule action ids, and `detail` is the readable reason, e.g.
   * "Explore: heading for unexplored ground 6 turns away".
   */
  | { type: 'ruleFired'; actor: EntityId; rule: RuleRef; condition: string; action: string; detail: string }
  /**
   * Stuck detection: `actor` neither moved nor saw anything new for `turns` decisions while
   * following `rule` (rule action `action`), so that goal is dropped for a while. `detail` says so.
   * `floor` and `pos` are where it got stuck (a highlight's place, ARCHITECTURE Contracts).
   */
  | {
      type: 'stuck';
      actor: EntityId;
      rule: RuleRef;
      action: string;
      turns: number;
      detail: string;
      floor: FloorId;
      pos: Pos;
    }
  /** The player took direct control of party member `actor` (ETH-066). */
  | { type: 'possessed'; actor: EntityId }
  /** The player handed party member `actor` back to the AI. */
  | { type: 'released'; actor: EntityId }
  /** A command was ignored. `command` is its `type`, or `"?"` if it had none. Nothing changed. */
  | { type: 'commandRejected'; command: string; reason: string };

/**
 * What the core events discover for the Codex (`run/codex.ts`). Each domain lists its own in its
 * `SimDomain.discoveries`.
 */
export const CORE_DISCOVERIES: DiscoveryRules = {
  doorOpened: () => [{ id: FEATURE_DOOR.id, mark: 'used' }],
};

/** A run chronicle moment (ETH-120): an adventurer got stuck and dropped its goal. The least notable kind. */
export const CHRONICLE_STUCK = defineChronicleKind({ id: 'stuck', priority: 10 });

/** The core moment kinds, registered before every domain's. */
export const CORE_CHRONICLE_KINDS: readonly ChronicleKind[] = [CHRONICLE_STUCK];

/** Which core events are run chronicle moments (`run/chronicle.ts`). */
export const CORE_CHRONICLE: ChronicleRules = {
  stuck: (e) => momentAt(CHRONICLE_STUCK, e, [e.actor], [e.action]),
};
