/**
 * Sim events: the typed record of everything that happened (docs/ARCHITECTURE.md §2.4).
 *
 * `step` returns them as a plain array; there is no global event bus. The log, the AI trace,
 * reward and conduct trackers and the Codex all read this one stream. Events are plain data so
 * a worker host can post them as they are.
 */
import type { Pos } from '../core';
import type { RuleRef } from './ai/types';
import type { EntityId } from './state';

/** What each kind of event carries. `emit` adds the `turn`. */
export type SimEventBody =
  /** An actor spent its turn doing nothing. */
  | { type: 'waited'; actor: EntityId }
  /** An actor stepped from one tile to a neighboring one on the same floor. */
  | { type: 'moved'; actor: EntityId; from: Pos; to: Pos }
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
   */
  | { type: 'stuck'; actor: EntityId; rule: RuleRef; action: string; turns: number; detail: string }
  /** A command was ignored. `command` is its `type`, or `"?"` if it had none. Nothing changed. */
  | { type: 'commandRejected'; command: string; reason: string };

/** An event, stamped with the game turn (`RunState.turn`) it happened on. */
export type SimEvent = SimEventBody & { turn: number };

export type SimEventType = SimEvent['type'];

/** Records an event. Handed to everything that runs inside `step`. */
export type Emit = (event: SimEventBody) => void;
