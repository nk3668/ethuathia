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
import { parseRequest } from './actions';
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
  const reason = isRecord(raw) ? run(state, raw) : 'Not a command object';
  if (reason !== null) emit({ type: 'commandRejected', command: type, reason });
}

/**
 * Applies `raw` and returns `null`, or returns why it can't be applied. Every check comes before
 * the first change, so a rejected command changes nothing.
 */
function run(state: RunState, raw: Readonly<Record<string, unknown>>): string | null {
  switch (raw.type) {
    case 'playerAction': {
      const entity = typeof raw.actor === 'number' ? state.entities[raw.actor] : undefined;
      if (entity === undefined) return `No entity ${String(raw.actor)}`;
      if (entity.actor === undefined) return `Entity ${entity.id} cannot act`;
      // Parsed into a fresh object, so nothing the caller holds ends up in the state.
      const request = parseRequest(raw.action);
      if (typeof request === 'string') return request;
      entity.actor.queued = request;
      return null;
    }
    default:
      return `Unknown command type "${String(raw.type)}"`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
