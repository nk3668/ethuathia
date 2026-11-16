/**
 * Action requests and their execution: the only way an actor changes the world
 * (docs/ARCHITECTURE.md §2.3).
 *
 * This is the minimum the scheduler needs: a request type, an energy cost and one action, wait.
 * ETH-005 replaces it with the `ActionDef` registry (validate and execute) and adds move and
 * open door.
 */
import type { Emit } from './events';
import type { Entity } from './state';

/** Spend the turn doing nothing. */
export interface WaitRequest {
  id: 'wait';
}

/**
 * What an actor wants to do this turn. Produced by the AI, behavior rules or a player command.
 * A union keyed by `id`; ETH-005 adds move and open door.
 */
export type ActionRequest = WaitRequest;

export type ActionId = ActionRequest['id'];

/** Energy each action costs. An actor needs `ENERGY_THRESHOLD` energy to act at all. */
export const ACTION_COSTS: Readonly<Record<ActionId, number>> = { wait: 100 };

/** True if `value` names a known action. Requests arriving from outside the sim are checked with it. */
export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && Object.hasOwn(ACTION_COSTS, value);
}

/**
 * Carries out `request` for `actor` and returns the energy it costs. A request that cannot be done
 * emits `actionFailed` and becomes a wait, so every turn costs energy and the scheduler always
 * moves on.
 */
export function performAction(actor: Entity, request: ActionRequest, emit: Emit): number {
  // Checked at run time too: the request may come from a decide function or a command payload
  // that the type system never saw.
  const id: unknown = (request as { id?: unknown } | null)?.id;
  if (!isActionId(id)) {
    emit({ type: 'actionFailed', actor: actor.id, action: String(id), reason: 'Unknown action' });
  }
  emit({ type: 'waited', actor: actor.id });
  return ACTION_COSTS.wait;
}
