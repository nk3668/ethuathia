/**
 * Actions: the only way an actor changes the world (docs/ARCHITECTURE.md §2.3).
 *
 * The AI, behavior rules, monsters and a possessed adventurer all produce an `ActionRequest` and
 * hand it to `performAction`, so none of them can do anything the others could not. Each action
 * is an `ActionDef`: it parses a request from untyped data, validates it against the current
 * state without changing anything, and executes it.
 */
import { Grid } from '../core';
import type { Def, Pos } from '../core';
import { actorAt, featureAt, getFloor, inFloorBounds, moveEntity } from './entities';
import type { Emit } from './events';
import { Terrain } from './state';
import type { ActorEntity, Entity, FloorId, RunState } from './state';

// ---------------------------------------------------------------------------------------------
// Requests

/** Spend the turn doing nothing. */
export interface WaitRequest {
  id: 'wait';
}

/** Step one tile. `dir` is a step such as `{ x: 1, y: -1 }` (north-east); see `isStep`. */
export interface MoveRequest {
  id: 'move';
  dir: Pos;
}

/** Open the closed door one step away in `dir`. */
export interface OpenDoorRequest {
  id: 'openDoor';
  dir: Pos;
}

/** What an actor wants to do this turn. A union keyed by `id`, with one `ActionDef` per member. */
export type ActionRequest = WaitRequest | MoveRequest | OpenDoorRequest;

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
 * One action. `name` and `description` are its Codex and tooltip text. The energy `cost` is
 * charged by the scheduler; an actor needs `ENERGY_THRESHOLD` energy to act at all.
 */
export interface ActionDef<K extends ActionId> extends Def {
  readonly id: K;
  readonly cost: number;
  /**
   * Builds a clean request from untyped data (a command from the UI, a save), or returns why it
   * is malformed. `raw.id` is already known to be this action's id.
   */
  parse(raw: Readonly<Record<string, unknown>>): RequestOf<K> | string;
  /** Why the request can't be done right now, or `null` if it can. Changes nothing. */
  validate(ctx: ActorCtx, request: RequestOf<K>): string | null;
  /** Does it. Only called after `validate` returned `null`. */
  execute(ctx: ActionCtx, request: RequestOf<K>): void;
}

const wait: ActionDef<'wait'> = {
  id: 'wait',
  name: 'Wait',
  description: 'Do nothing for a turn.',
  tags: [],
  cost: 100,
  parse: () => ({ id: 'wait' }),
  validate: () => null,
  execute: ({ actor, emit }) => emit({ type: 'waited', actor: actor.id }),
};

const move: ActionDef<'move'> = {
  id: 'move',
  name: 'Move',
  description:
    'Step to a neighboring tile, diagonals included. Walls, closed doors and other creatures block the way, ' +
    'and doorways can only be entered or left straight on.',
  tags: [],
  cost: 100,
  parse: (raw) => (isStep(raw.dir) ? { id: 'move', dir: { x: raw.dir.x, y: raw.dir.y } } : BAD_DIR),
  validate: ({ state, actor }, { dir }) => {
    const blocked = stepBlocker(state, actor.floor, actor.pos, dir);
    if (blocked !== null) return blocked;
    const other = actorAt(state, actor.floor, add(actor.pos, dir));
    return other === undefined ? null : `${describe(other)} is in the way`;
  },
  execute: ({ state, actor, emit }, { dir }) => {
    const from = actor.pos;
    const to = add(from, dir);
    moveEntity(state, actor.id, actor.floor, to);
    emit({ type: 'moved', actor: actor.id, from: { ...from }, to: { ...to } });
  },
};

const openDoor: ActionDef<'openDoor'> = {
  id: 'openDoor',
  name: 'Open door',
  description: 'Open a closed door next to you.',
  tags: [],
  cost: 100,
  parse: (raw) => (isStep(raw.dir) ? { id: 'openDoor', dir: { x: raw.dir.x, y: raw.dir.y } } : BAD_DIR),
  validate: ({ state, actor }, { dir }) => {
    const pos = add(actor.pos, dir);
    const floor = getFloor(state, actor.floor);
    if (!inFloorBounds(floor, pos)) return 'There is no door there';
    const door = featureAt(state, actor.floor, pos)?.feature;
    if (door?.kind !== 'door') return 'There is no door there';
    return door.open ? 'The door is already open' : null;
  },
  execute: ({ state, actor, emit }, { dir }) => {
    const pos = add(actor.pos, dir);
    const door = featureAt(state, actor.floor, pos);
    if (door?.feature?.kind !== 'door') return;
    door.feature.open = true;
    emit({ type: 'doorOpened', actor: actor.id, door: door.id, pos });
  },
};

/**
 * Every action, keyed by id. The type makes the set exhaustive: a request type without a
 * definition, or a definition without a request type, fails to compile. The Codex and tooltips
 * read `name` and `description` from here.
 */
export const ACTIONS: { readonly [K in ActionId]: ActionDef<K> } = { wait, move, openDoor };

/** True if `value` names a known action. */
export function isActionId(value: unknown): value is ActionId {
  return typeof value === 'string' && Object.hasOwn(ACTIONS, value);
}

/** The definition for a request. The cast is safe because `ACTIONS` pairs every id with its def. */
function defOf<R extends ActionRequest>(request: R): ActionDef<R['id']> {
  return ACTIONS[request.id] as unknown as ActionDef<R['id']>;
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
  return ACTIONS[id].parse(raw as Record<string, unknown>);
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
    wait.execute({ state, actor, emit }, { id: 'wait' });
    return wait.cost;
  }
  const def = defOf(parsed);
  def.execute({ state, actor, emit }, parsed);
  return def.cost;
}

// ---------------------------------------------------------------------------------------------
// Movement rules

/**
 * Why a step from `from` in direction `dir` on a floor is blocked by the map, or `null` if the
 * map allows it. Creatures are not considered, so pathing (goal maps) can share these rules:
 *
 * - the target must be inside the floor and not a wall;
 * - a closed door blocks until it is opened;
 * - a doorway (a tile with a door, open or closed) can only be entered or left orthogonally.
 */
export function stepBlocker(state: RunState, floorId: FloorId, from: Pos, dir: Pos): string | null {
  const floor = getFloor(state, floorId);
  const to = add(from, dir);
  if (!inFloorBounds(floor, to)) return 'That is the edge of the map';
  if (Grid.wrap(floor.terrain).get(to.x, to.y) !== Terrain.Floor) return 'A wall is in the way';
  const door = featureAt(state, floorId, to)?.feature;
  if (door?.kind === 'door' && !door.open) return 'The door is closed';
  if (dir.x !== 0 && dir.y !== 0 && (door?.kind === 'door' || featureAt(state, floorId, from)?.feature?.kind === 'door')) {
    return 'Doorways can’t be entered or left diagonally';
  }
  return null;
}

/** True if `value` is a one-tile step: whole-number `x` and `y` in -1..1, not both 0. */
export function isStep(value: unknown): value is Pos {
  if (typeof value !== 'object' || value === null) return false;
  const { x, y } = value as Record<string, unknown>;
  return isUnit(x) && isUnit(y) && (x !== 0 || y !== 0);
}

const BAD_DIR = 'The direction must be one step: x and y each -1, 0 or 1, not both 0';

function isUnit(n: unknown): n is -1 | 0 | 1 {
  return n === -1 || n === 0 || n === 1;
}

function add(p: Pos, d: Pos): Pos {
  return { x: p.x + d.x, y: p.y + d.y };
}

/** A short name for an entity in a reason string. */
function describe(entity: Entity): string {
  return entity.adventurer?.name ?? `Entity ${entity.id}`;
}
