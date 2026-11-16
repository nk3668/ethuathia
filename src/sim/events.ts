/**
 * Sim events: the typed record of everything that happened (docs/ARCHITECTURE.md §2.4).
 *
 * `step` returns them as a plain array; there is no global event bus. The log, the AI trace,
 * reward and conduct trackers and the Codex all read this one stream. Events are plain data so
 * a worker host can post them as they are.
 */
import type { EntityId } from './state';

/** What each kind of event carries. `emit` adds the `turn`. */
export type SimEventBody =
  /** An actor spent its turn doing nothing. */
  | { type: 'waited'; actor: EntityId }
  /**
   * An actor's chosen action could not be done. The actor waits instead, so a bad decision
   * still costs a turn and can never stall the scheduler.
   */
  | { type: 'actionFailed'; actor: EntityId; action: string; reason: string }
  /** A command was ignored. `command` is its `type`, or `"?"` if it had none. Nothing changed. */
  | { type: 'commandRejected'; command: string; reason: string };

/** An event, stamped with the game turn (`RunState.turn`) it happened on. */
export type SimEvent = SimEventBody & { turn: number };

export type SimEventType = SimEvent['type'];

/** Records an event. Handed to everything that runs inside `step`. */
export type Emit = (event: SimEventBody) => void;
