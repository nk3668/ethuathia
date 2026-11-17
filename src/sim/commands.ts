/**
 * Commands: the UI's only way to change a run (docs/ARCHITECTURE.md §3.5). `step` applies them,
 * in order, before it advances time.
 *
 * Commands may cross a worker boundary or come from a save, so each one is checked at run time.
 * A bad command is rejected with a `commandRejected` event and changes nothing; it never throws.
 *
 * This file holds the shapes and the pipeline. The definitions live with their domain: the core
 * commands in `coreCommands.ts`, the rest in `src/sim/<domain>/`, joined into `COMMANDS` by
 * `domains.ts`. More arrive with the features that need them: `setRules` and `setDoctrine` with
 * behavior rules (M3), `possess` and `release` with possession, and `retreat` with run endings.
 */
import type { CoreCommand } from './coreCommands';
import type { DomainKey, DomainTypes } from './domain';
import { COMMANDS } from './domains';
import type { Emit } from './events';
import type { RunState } from './state';

/** What every command has: the `type` that picks its definition. */
export interface BaseCommand {
  type: string;
}

/** Everything the UI can ask of a run: the core commands plus every domain's. Keyed by `type`. */
export type Command = CoreCommand | DomainTypes[DomainKey]['command'];

export type CommandType = Command['type'];

/** One command's definition, for command type `C`. */
export interface CommandDef<C extends BaseCommand> {
  readonly type: C['type'];
  /**
   * Applies the command and returns `null`, or returns why it can't be applied. `raw` is
   * untyped (it may come from a worker or a file), so check every field. Every check must come
   * before the first change, so a rejected command changes nothing.
   */
  apply(state: RunState, raw: Readonly<Record<string, unknown>>): string | null;
}

/**
 * The definitions for a command union `C`, keyed by type. Exhaustive like `ActionRecord`; each
 * domain exports one for its own commands (`CommandRecord<never>` is `{}`).
 */
export type CommandRecord<C extends BaseCommand> = { readonly [K in C['type']]: CommandDef<Extract<C, { type: K }>> };

export { COMMANDS };

/** Applies one command, or emits `commandRejected` with the reason and changes nothing. */
export function applyCommand(state: RunState, command: Command, emit: Emit): void {
  const raw: unknown = command;
  const type = isRecord(raw) && typeof raw.type === 'string' ? raw.type : '?';
  const reason = isRecord(raw) ? run(state, raw) : 'Not a command object';
  if (reason !== null) emit({ type: 'commandRejected', command: type, reason });
}

/** Applies `raw` and returns `null`, or returns why it can't be applied. */
function run(state: RunState, raw: Readonly<Record<string, unknown>>): string | null {
  const type = raw.type;
  if (typeof type !== 'string' || !Object.hasOwn(COMMANDS, type)) return `Unknown command type "${String(type)}"`;
  return COMMANDS[type as CommandType].apply(state, raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
