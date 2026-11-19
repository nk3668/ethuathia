/**
 * The core domain's actions: wait, move, open door and swap places, plus the movement rules that goal maps
 * share (docs/ARCHITECTURE.md §2.3). Feature domains declare their actions in their own
 * `src/sim/<domain>/` files; `domains.ts` joins every record into `ACTIONS`.
 *
 * This is a leaf module: it never imports the composition files (`actions.ts` values,
 * `domains.ts`, `index.ts`), so any domain may import its helpers (`isStep`, `stepBlocker`).
 */
import { Grid } from '../core';
import { MONSTERS } from '../content';
import type { Pos } from '../core';
import { performAction, validateAction } from './actions';
import type { ActionRecord, ActionRequest, ActorCtx } from './actions';
import { actorAt, blockerAt, featureAt, getFloor, inFloorBounds, moveEntity } from './entities';
import { Terrain } from './state';
import type { Entity, FloorId, RunState } from './state';

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

/**
 * Trade places with the party member one step away in `dir`: the actor steps onto their tile and
 * they step onto the actor's. Only party members swap; monsters and neutral creatures never do.
 */
export interface SwapRequest {
  id: 'swap';
  dir: Pos;
}

/**
 * Step toward `dir` and do whatever that means (ETH-066): attack an enemy there, open a closed
 * door, swap places with a party member, or move. What a possessed adventurer's movement keys
 * send; `bumpTarget` says which it would be.
 */
export interface BumpRequest {
  id: 'bump';
  dir: Pos;
}

/** The core domain's action requests. */
export type CoreRequest = WaitRequest | MoveRequest | OpenDoorRequest | SwapRequest | BumpRequest;

// ---------------------------------------------------------------------------------------------
// Definitions

/**
 * Every core action, keyed by id. `ActionRecord` makes the set exhaustive: a request type
 * without a definition, or a definition without a request type, fails to compile.
 */
export const CORE_ACTIONS: ActionRecord<CoreRequest> = {
  wait: {
    id: 'wait',
    name: 'Wait',
    description: 'Do nothing for a turn.',
    tags: [],
    cost: 100,
    parse: () => ({ id: 'wait' }),
    validate: () => null,
    execute: ({ actor, emit }) => emit({ type: 'waited', actor: actor.id }),
  },

  move: {
    id: 'move',
    name: 'Move',
    description:
      'Step to a neighboring tile, diagonals included. Walls, closed doors and other creatures block the way ' +
      '(only small folk and swarms can crowd onto a tile together), and doorways can only be entered or left straight on.',
    tags: [],
    cost: 100,
    parse: (raw) => (isStep(raw.dir) ? { id: 'move', dir: { x: raw.dir.x, y: raw.dir.y } } : BAD_DIR),
    validate: ({ state, actor }, { dir }) => {
      const blocked = stepBlocker(state, actor.floor, actor.pos, dir);
      if (blocked !== null) return blocked;
      const other = blockerAt(state, actor, actor.floor, add(actor.pos, dir));
      return other === undefined ? null : `${describe(other)} is in the way`;
    },
    execute: ({ state, actor, emit }, { dir }) => {
      const from = actor.pos;
      const to = add(from, dir);
      moveEntity(state, actor.id, actor.floor, to);
      emit({ type: 'moved', actor: actor.id, from: { ...from }, to: { ...to } });
    },
  },

  openDoor: {
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
  },

  swap: {
    id: 'swap',
    name: 'Swap places',
    description:
      'Trade places with a party member on a neighboring tile, so two adventurers can get past each other ' +
      'in a narrow passage. Only party members swap: monsters and other creatures never do. The same walls, ' +
      'doors and doorway rules as a move apply to both of them. Only the one who asks spends the turn.',
    tags: [],
    cost: 100,
    parse: (raw) => (isStep(raw.dir) ? { id: 'swap', dir: { x: raw.dir.x, y: raw.dir.y } } : BAD_DIR),
    validate: ({ state, actor }, { dir }) => {
      const blocked = stepBlocker(state, actor.floor, actor.pos, dir);
      if (blocked !== null) return blocked;
      const to = add(actor.pos, dir);
      const other = actorAt(state, actor.floor, to);
      if (other === undefined) return 'There is nobody there to swap places with';
      if (actor.actor.faction !== 'party' || other.actor?.faction !== 'party') {
        return `${describe(other)} is not in the party`;
      }
      return stepBlocker(state, actor.floor, to, { x: -dir.x, y: -dir.y });
    },
    execute: ({ state, actor, emit }, { dir }) => {
      const from = actor.pos;
      const to = add(from, dir);
      const other = actorAt(state, actor.floor, to);
      if (other === undefined) return;
      moveEntity(state, other.id, actor.floor, from);
      moveEntity(state, actor.id, actor.floor, to);
      emit({ type: 'swapped', actor: actor.id, other: other.id, from: { ...from }, to: { ...to } });
    },
  },

  bump: {
    id: 'bump',
    name: 'Step or strike',
    description:
      'Head one tile toward a direction and do what that takes: attack an enemy standing there, open a closed door, ' +
      'swap places with a party member, or step onto the tile. The movement keys of a possessed adventurer do this.',
    tags: [],
    cost: 100,
    parse: (raw) => (isStep(raw.dir) ? { id: 'bump', dir: { x: raw.dir.x, y: raw.dir.y } } : BAD_DIR),
    validate: (ctx, { dir }) => {
      const target = bumpTarget(ctx, dir);
      return typeof target === 'string' ? target : null;
    },
    execute: ({ state, actor, emit }, { dir }) => {
      const target = bumpTarget({ state, actor }, dir);
      if (typeof target !== 'string') performAction(state, actor, target, emit);
    },
  },
};

/** What a bump toward `dir` tries, in order: the first the actor can do is taken. */
const BUMP_ORDER = ['attack', 'openDoor', 'swap', 'move'] as const;

/**
 * The action a bump toward `dir` comes to (attack, open the door, swap places or move), or why
 * none can be done: the reason a plain move would fail. Changes nothing.
 */
export function bumpTarget({ state, actor }: ActorCtx, dir: Pos): ActionRequest | string {
  let reason = 'Nothing can be done there';
  for (const id of BUMP_ORDER) {
    const request = { id, dir: { x: dir.x, y: dir.y } } as ActionRequest;
    const why = validateAction(state, actor, request);
    if (why === null) return request;
    if (id === 'move') reason = why;
  }
  return reason;
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
  if (entity.adventurer !== undefined) return entity.adventurer.name;
  return MONSTERS.has(entity.def) ? `A ${MONSTERS.get(entity.def).name.toLowerCase()}` : `Entity ${entity.id}`;
}
