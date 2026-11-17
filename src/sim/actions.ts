/**
 * Actions: the only way an actor changes the world (docs/ARCHITECTURE.md §2.3).
 *
 * The AI, behavior rules, monsters and a possessed adventurer all produce an `ActionRequest` and
 * hand it to `performAction`, so none of them can do anything the others could not. Each action
 * is an `ActionDef`: it parses a request from untyped data, validates it against the current
 * state without changing anything, and executes it.
 *
 * This file holds the shapes and the pipeline. The definitions live with their domain: the core
 * actions in `coreActions.ts`, the rest in `src/sim/<domain>/`, joined into `ACTIONS` by
 * `domains.ts` (docs/ARCHITECTURE.md, Contracts).
 */
import type { Def } from '../core';
import { CORE_ACTIONS } from './coreActions';
import type { CoreRequest } from './coreActions';
import type { DomainKey, DomainTypes } from './domain';
import { ACTIONS } from './domains';
import type { Emit } from './events';
import type { ActorEntity, RunState } from './state';

// ---------------------------------------------------------------------------------------------
// Requests

/** What every action request has: the id of the action it asks for. */
export interface BaseRequest {
  id: string;
}

/**
 * What an actor wants to do this turn: the core requests plus every domain's. A union keyed by
 * `id`, with one `ActionDef` per member.
 */
export type ActionRequest = CoreRequest | DomainTypes[DomainKey]['request'];

export type ActionId = ActionRequest['id'];

/** The request type for one action id. */
export type RequestOf<K extends ActionId> = Extract<ActionRequest, { id: K }>;

// ---------------------------------------------------------------------------------------------
// Definitions

/** What validation may look at. It must not change anything. */
export interface ActorCtx {
  readonly state: RunState;
  readonly actor: ActorEntity;
}

/** What execution gets: validation's view plus a way to record events. */
export interface ActionCtx extends ActorCtx {
  readonly emit: Emit;
}

/**
 * One action, for request type `R`. `name` and `description` are its Codex and tooltip text.
 * The energy `cost` is charged by the scheduler; an actor needs `ENERGY_THRESHOLD` energy to act
 * at all.
 */
export interface ActionDef<R extends BaseRequest> extends Def {
  readonly id: R['id'];
  readonly cost: number;
  /**
   * Builds a clean request from untyped data (a command from the UI, a save), or returns why it
   * is malformed. `raw.id` is already known to be this action's id.
   */
  parse(raw: Readonly<Record<string, unknown>>): R | string;
  /** Why the request can't be done right now, or `null` if it can. Changes nothing. */
  validate(ctx: ActorCtx, request: R): string | null;
  /** Does it. Only called after `validate` returned `null`. */
  execute(ctx: ActionCtx, request: R): void;
}

/**
 * The definitions for a request union `R`, keyed by id. The type makes the set exhaustive: a
 * request type without a definition, or a definition without a request type, fails to compile.
 * Each domain exports one for its own requests (`ActionRecord<never>` is `{}`).
 */
export type ActionRecord<R extends BaseRequest> = { readonly [K in R['id']]: ActionDef<Extract<R, { id: K }>> };

export { ACTIONS };

/** True if `value` names a known action. */
export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && Object.hasOwn(ACTIONS, value);
}

/** The definition for a request. The cast is safe because `ACTIONS` pairs every id with its def. */
function defOf<R extends ActionRequest>(request: R): ActionDef<R> {
  return ACTIONS[request.id as ActionId] as unknown as ActionDef<R>;
}

// ---------------------------------------------------------------------------------------------
// Pipeline

/**
 * Turns untyped data into a clean `ActionRequest`, or returns why it can't. Use it on anything
 * that crosses into the sim from outside, such as a command's payload.
 */
export function parseRequest(raw: unknown): ActionRequest | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'Not an action request';
  const id: unknown = (raw as Record<string, unknown>).id;
  if (!isActionId(id)) return `Unknown action "${String(id)}"`;
  return (ACTIONS[id] as ActionDef<ActionRequest>).parse(raw as Record<string, unknown>);
}

/**
 * Why `actor` can't do `request` right now, or `null` if it can. Changes nothing, so the AI can
 * use it to try actions before choosing one. The request is re-parsed first, because it may have
 * come from code the type system can't vouch for.
 */
export function validateAction(state: RunState, actor: ActorEntity, request: ActionRequest): string | null {
  const parsed = parseRequest(request);
  if (typeof parsed === 'string') return parsed;
  return defOf(parsed).validate({ state, actor }, parsed);
}

/**
 * Carries out `request` for `actor` and returns the energy it cost. A request that is malformed
 * or can't be done right now emits `actionFailed` with the reason and becomes a wait, so a bad
 * decision still costs a turn and the scheduler always moves on.
 */
export function performAction(state: RunState, actor: ActorEntity, request: ActionRequest, emit: Emit): number {
  const parsed = parseRequest(request);
  const reason = typeof parsed === 'string' ? parsed : defOf(parsed).validate({ state, actor }, parsed);
  if (typeof parsed === 'string' || reason !== null) {
    const id: unknown = (request as { id?: unknown } | null)?.id;
    emit({ type: 'actionFailed', actor: actor.id, action: String(id), reason: reason ?? 'Invalid request' });
    const wait = CORE_ACTIONS.wait;
    wait.execute({ state, actor, emit }, { id: 'wait' });
    return wait.cost;
  }
  const def = defOf(parsed);
  def.execute({ state, actor, emit }, parsed);
  return def.cost;
}
