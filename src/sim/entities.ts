/**
 * Adding, removing, moving and finding entities and floors in a `RunState`.
 *
 * These helpers are the only code that changes which floor an entity is on, so each floor's
 * `entities` list always matches its entities' `floor` fields. Changing an entity's `pos` on the
 * same floor is safe anywhere, as long as it gets a new object (`moveEntity` does that).
 */
import { clonePlain, Grid } from '../core';
import type { Pos } from '../core';
import { MONSTERS } from '../content';
import type { FloorPlan } from './floorText';
import type { Entity, EntityId, Floor, FloorId, RunState } from './state';

/** Everything an entity needs except its id, which `addEntity` assigns. */
export type NewEntity = Omit<Entity, 'id'>;

/** The floor with this id. Throws if it has not been built. */
export function getFloor(state: RunState, id: FloorId): Floor {
  const floor = state.floors[id];
  if (floor === undefined) throw new Error(`Unknown floor "${id}"`);
  return floor;
}

/**
 * Builds floor `id` from a plan: stores its terrain, creates its features and gives the party an
 * empty memory of it. The floor must be a node of the dungeon graph and must not have been built
 * already.
 */
export function addFloor(state: RunState, id: FloorId, plan: FloorPlan): Floor {
  const node = state.dungeon.nodes[id];
  if (node === undefined) throw new Error(`Floor "${id}" is not in the dungeon graph`);
  if (state.floors[id] !== undefined) throw new Error(`Floor "${id}" has already been built`);
  const floor: Floor = { id, depth: node.depth, terrain: plan.terrain.clone().toBuffer(), entities: [] };
  state.floors[id] = floor;
  state.memory[id] = { terrain: new Grid(plan.terrain.width, plan.terrain.height, 'u8').toBuffer(), features: {} };
  for (const { def, pos, feature } of plan.features) addEntity(state, { def, floor: id, pos, feature });
  for (const { pos, item } of plan.items ?? []) addEntity(state, { def: item.def, floor: id, pos, item });
  for (const spawn of plan.spawns ?? []) addEntity(state, { ...spawn, floor: id });
  return floor;
}

/** True if `pos` is a whole-number position inside the floor's grid. */
export function inFloorBounds(floor: Floor, pos: Pos): boolean {
  const { width, height } = floor.terrain;
  return Number.isInteger(pos.x) && Number.isInteger(pos.y) && pos.x >= 0 && pos.y >= 0 && pos.x < width && pos.y < height;
}

function checkPlacement(state: RunState, floorId: FloorId, pos: Pos): Floor {
  const floor = getFloor(state, floorId);
  if (!inFloorBounds(floor, pos)) {
    throw new RangeError(`(${pos.x}, ${pos.y}) is outside floor "${floorId}"`);
  }
  return floor;
}

/**
 * Adds an entity, giving it the next id, and returns it. `init` is deep-copied, so the caller can
 * reuse it (for example a template object) without the new entity sharing any of it.
 */
export function addEntity(state: RunState, init: NewEntity): Entity {
  const floor = checkPlacement(state, init.floor, init.pos);
  const id = state.nextEntityId++;
  const entity: Entity = { id, ...clonePlain(init) };
  state.entities[id] = entity;
  floor.entities.push(id);
  return entity;
}

/** The entity with this id. Throws if there is none. */
export function getEntity(state: RunState, id: EntityId): Entity {
  const entity = state.entities[id];
  if (entity === undefined) throw new Error(`Unknown entity ${id}`);
  return entity;
}

function removeId(list: EntityId[], id: EntityId): void {
  const i = list.indexOf(id);
  if (i !== -1) list.splice(i, 1);
}

/**
 * Removes an entity from the run, its floor and the party, and returns it. Throws if there is
 * no such entity.
 */
export function removeEntity(state: RunState, id: EntityId): Entity {
  const entity = getEntity(state, id);
  Reflect.deleteProperty(state.entities, id);
  removeId(getFloor(state, entity.floor).entities, id);
  removeId(state.party, id);
  return entity;
}

/** Puts an entity at `pos` on `floorId`, which may be a different floor from its current one. */
export function moveEntity(state: RunState, id: EntityId, floorId: FloorId, pos: Pos): void {
  const entity = getEntity(state, id);
  const target = checkPlacement(state, floorId, pos);
  if (entity.floor !== floorId) {
    removeId(getFloor(state, entity.floor).entities, id);
    target.entities.push(id);
    entity.floor = floorId;
  }
  entity.pos = { x: pos.x, y: pos.y };
}

/** Every entity on a floor, in the order they arrived there. */
export function entitiesOnFloor(state: RunState, floorId: FloorId): Entity[] {
  return getFloor(state, floorId).entities.map((id) => getEntity(state, id));
}

/** Every entity on a floor at `pos`, in the order they arrived there. */
export function entitiesAt(state: RunState, floorId: FloorId, pos: Pos): Entity[] {
  return entitiesOnFloor(state, floorId).filter((e) => e.pos.x === pos.x && e.pos.y === pos.y);
}

/** True for an actor still standing: one with HP left. A fallen adventurer takes up no tile. */
export function isStanding(entity: Entity): boolean {
  return entity.actor !== undefined && entity.actor.hp > 0;
}

/**
 * The standing actor (adventurer or monster) at `pos`, if any: the first to arrive. At most one
 * actor stands on a tile, except creatures that share tiles (`sharesTile`), which may crowd
 * together. Fallen adventurers lie where they fell without taking up the tile.
 */
export function actorAt(state: RunState, floorId: FloorId, pos: Pos): Entity | undefined {
  return entitiesAt(state, floorId, pos).find(isStanding);
}

/** Every standing actor at `pos`, in the order they arrived there. */
export function actorsAt(state: RunState, floorId: FloorId, pos: Pos): Entity[] {
  return entitiesAt(state, floorId, pos).filter(isStanding);
}

/**
 * True for a creature that can crowd onto a tile with others of its sort: small folk and swarms
 * whose monster def says `sharesTile`. Adventurers never do.
 */
export function sharesTile(entity: Entity): boolean {
  return entity.adventurer === undefined && MONSTERS.has(entity.def) && MONSTERS.get(entity.def).sharesTile === true;
}

/** Whether two actors may stand on one tile: only when both share tiles (`sharesTile`). */
export function mayShareTile(a: Entity, b: Entity): boolean {
  return sharesTile(a) && sharesTile(b);
}

/**
 * The actor at `pos` that keeps `mover` from stepping there, if any: anyone, unless both it and
 * the mover share tiles. This is the one rule for who may stand together (movement, pathing,
 * spawning and the `core.positions` invariant all follow it).
 */
export function blockerAt(state: RunState, mover: Entity, floorId: FloorId, pos: Pos): Entity | undefined {
  return actorsAt(state, floorId, pos).find((e) => e.id !== mover.id && !mayShareTile(mover, e));
}

/** The feature (door, stairs, ...) at `pos`, if any. */
export function featureAt(state: RunState, floorId: FloorId, pos: Pos): Entity | undefined {
  return entitiesAt(state, floorId, pos).find((e) => e.feature !== undefined);
}
