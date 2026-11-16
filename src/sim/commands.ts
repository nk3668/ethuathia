/**
 * Commands: the UI's only way to change a run (docs/ARCHITECTURE.md §3.5). `step` applies them,
 * in order, before it advances time.
 *
 * Commands may cross a worker boundary or come from a save, so each one is checked at run time.
 * A bad command is rejected with a `commandRejected` event and changes nothing; it never throws.
 *
 * More commands arrive with the features that need them: `setRules` and `setDoctrine` with
 * behavior rules (M3), `possess` and `release` with possession, and `retreat` with run endings.
 */
import { isActionId } from './actions';
import type { ActionRequest } from './actions';
import type { Emit } from './events';
import type { EntityId, RunState } from './state';

/**
 * Overrides `actor`'s next decision with `action`. Possession will send one of these per key
 * press; the AI resumes after it.
 */
export interface PlayerActionCommand {
  type: 'playerAction';
  actor: EntityId;
  action: ActionRequest;
}

/** Everything the UI can ask of a run. A union keyed by `type`. */
export type Command = PlayerActionCommand;

export type CommandType = Command['type'];

/** Applies one command, or emits `commandRejected` with the reason and changes nothing. */
export function applyCommand(state: RunState, command: Command, emit: Emit): void {
  const raw: unknown = command;
  const type = isRecord(raw) && typeof raw.type === 'string' ? raw.type : '?';
  const reason = isRecord(raw) ? checkCommand(state, raw) : 'Not a command object';
  if (reason !== null) {
    emit({ type: 'commandRejected', command: type, reason });
    return;
  }
  switch (command.type) {
    case 'playerAction': {
      const actor = state.entities[command.actor]?.actor;
      if (actor !== undefined) actor.queued = { id: command.action.id };
      return;
    }
  }
}

/** Why `raw` cannot be applied, or `null` if it can. */
function checkCommand(state: RunState, raw: Record<string, unknown>): string | null {
  switch (raw.type) {
    case 'playerAction': {
      const entity = typeof raw.actor === 'number' ? state.entities[raw.actor] : undefined;
      if (entity === undefined) return `No entity ${String(raw.actor)}`;
      if (entity.actor === undefined) return `Entity ${entity.id} cannot act`;
      const id = isRecord(raw.action) ? raw.action.id : undefined;
      if (!isActionId(id)) return `Unknown action "${String(id)}"`;
      return null;
    }
    default:
      return `Unknown command type "${String(raw.type)}"`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
