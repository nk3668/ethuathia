/**
 * Perception (docs/ARCHITECTURE.md §3.7): what actors can see, and what the party remembers.
 *
 * Sight uses symmetric shadowcasting (`fov.ts`). Walls and closed doors block it; open doors do
 * not. The party shares one memory per floor (`RunState.memory`): every tile any member has seen,
 * with the terrain and feature it had when last seen. The map's fog and the AI's frontier both
 * come from it.
 */
import { clonePlain, Grid } from '../core';
import type { Pos } from '../core';
import { getEntity, getFloor } from './entities';
import { computeFov } from './fov';
import { Terrain } from './state';
import type { ActorEntity, Entity, EntityId, FloorId, FloorMemory, RunState } from './state';
import { statValue } from './stats/getStat';

export { BASE_SIGHT_RADIUS } from './stats/statIds';

/**
 * How far `actor` can see, in tiles: its `sight` stat (base `BASE_SIGHT_RADIUS`). Every FOV goes
 * through this one function, so whatever changes sight (the Gloom Omen, a dazzled status, a
 * lantern) does it as a `sight` modifier in a bundle.
 */
export function sightRadius(state: RunState, actor: ActorEntity): number {
  return statValue(state, actor, 'sight');
}

/**
 * Whether each tile of a floor blocks sight right now: walls and closed doors. Build it once and
 * reuse it for several FOVs on the same floor in the same moment.
 */
export function sightBlockers(state: RunState, floorId: FloorId): (x: number, y: number) => boolean {
  const floor = getFloor(state, floorId);
  const { width, cells } = floor.terrain;
  const closedDoors = new Set<number>();
  for (const id of floor.entities) {
    const f = getEntity(state, id);
    if (f.feature?.kind === 'door' && !f.feature.open) closedDoors.add(f.pos.y * width + f.pos.x);
  }
  return (x, y) => {
    const i = y * width + x;
    return cells[i] !== Terrain.Floor || closedDoors.has(i);
  };
}

/**
 * The tiles `actor` can see from where it stands, as `{ x, y }` positions, its own tile
 * included. Each tile appears once, in a fixed order.
 */
export function fieldOfView(state: RunState, actor: ActorEntity, blocksSight = sightBlockers(state, actor.floor)): Pos[] {
  const { width, height } = getFloor(state, actor.floor).terrain;
  const tiles = computeFov({ width, height, origin: actor.pos, radius: sightRadius(state, actor), blocksSight });
  return tiles.map((i) => ({ x: i % width, y: Math.floor(i / width) }));
}

/** True if `viewer` can see the tile `pos` on its own floor right now. */
export function canSee(state: RunState, viewer: ActorEntity, pos: Pos): boolean {
  return fieldOfView(state, viewer).some((p) => p.x === pos.x && p.y === pos.y);
}

// ---------------------------------------------------------------------------------------------
// Party memory

/** The party's memory of a floor. Throws if the floor has not been built. */
export function getMemory(state: RunState, floorId: FloorId): FloorMemory {
  const memory = state.memory[floorId];
  if (memory === undefined) throw new Error(`No memory for floor "${floorId}"`);
  return memory;
}

/** The terrain the party last saw at `pos`, or `null` if nobody has seen it. */
export function rememberedTerrain(memory: FloorMemory, pos: Pos): Terrain | null {
  const code = Grid.wrap(memory.terrain).get(pos.x, pos.y);
  return code === 0 ? null : ((code - 1) as Terrain);
}

/**
 * Updates the party's memory with what `actorId` sees now: each visible tile's terrain and
 * feature are recorded, replacing what was remembered there. Tiles out of sight keep their last
 * known state, even if they have changed since. Returns the visible tiles.
 */
export function perceive(state: RunState, actorId: EntityId): Pos[] {
  const actor = getEntity(state, actorId) as ActorEntity;
  const floor = getFloor(state, actor.floor);
  const memory = getMemory(state, actor.floor);
  const { width, cells } = floor.terrain;
  const remembered = memory.terrain.cells;

  const featureByTile = new Map<number, Entity>();
  for (const id of floor.entities) {
    const e = getEntity(state, id);
    if (e.feature !== undefined) featureByTile.set(e.pos.y * width + e.pos.x, e);
  }

  const visible = fieldOfView(state, actor);
  for (const { x, y } of visible) {
    const i = y * width + x;
    remembered[i] = (cells[i] as number) + 1;
    const feature = featureByTile.get(i);
    if (feature?.feature === undefined) {
      Reflect.deleteProperty(memory.features, i);
    } else {
      memory.features[i] = { def: feature.def, feature: clonePlain(feature.feature) };
    }
  }
  return visible;
}

/** Updates the memory with what every living party member sees now. */
export function perceiveParty(state: RunState): void {
  for (const id of state.party) {
    const member = state.entities[id];
    if (member?.actor !== undefined && member.actor.hp > 0) perceive(state, id);
  }
}

/**
 * A `u8` mask of the tiles on `floorId` that at least one living party member there can see
 * right now (1 seen, 0 not). This is the "in view" layer of the map's fog.
 */
export function partyVisible(state: RunState, floorId: FloorId): Grid {
  const { width, height } = getFloor(state, floorId).terrain;
  const mask = new Grid(width, height, 'u8');
  const blocks = sightBlockers(state, floorId);
  for (const id of state.party) {
    const member = state.entities[id];
    if (member?.actor === undefined || member.floor !== floorId || member.actor.hp <= 0) continue;
    for (const { x, y } of fieldOfView(state, member as ActorEntity, blocks)) mask.cells[y * width + x] = 1;
  }
  return mask;
}

/** How much of a floor the party has seen. */
export interface Explored {
  /** Floor tiles the party has seen. */
  seen: number;
  /** Floor tiles on the floor, reachable or not. */
  total: number;
  /** `seen / total`, from 0 to 1 (1 for a floor with no floor tiles). */
  fraction: number;
}

/**
 * How much of a floor's walkable ground the party has seen. Walls don't count, so a fully seen
 * floor is at 1 however much rock surrounds it. Doors and stairs stand on floor tiles and count.
 */
export function explored(state: RunState, floorId: FloorId): Explored {
  const terrain = getFloor(state, floorId).terrain.cells;
  const remembered = getMemory(state, floorId).terrain.cells;
  let seen = 0;
  let total = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] !== Terrain.Floor) continue;
    total++;
    if (remembered[i] !== 0) seen++;
  }
  return { seen, total, fraction: total === 0 ? 1 : seen / total };
}
