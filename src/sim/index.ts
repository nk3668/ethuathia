/**
 * sim: the deterministic simulation. No DOM access.
 * May import: core, content. See docs/ARCHITECTURE.md §1.
 */
export {
  actorAt,
  addEntity,
  addFloor,
  entitiesAt,
  entitiesOnFloor,
  featureAt,
  getEntity,
  getFloor,
  inFloorBounds,
  moveEntity,
  removeEntity,
} from './entities';
export type { NewEntity } from './entities';
export { floorToText, parseFloorText } from './floorText';
export type { FloorPlan } from './floorText';
export { createRun, M0_FLOOR } from './run';
export { deserialize, serialize } from './serialize';
export { DEFS, RNG_STREAMS, STATE_VERSION, Terrain, TERRAIN_IDS } from './state';
export type {
  ActorPart,
  AdventurerConfig,
  AdventurerPart,
  DungeonGraph,
  Entity,
  EntityId,
  Faction,
  FeaturePart,
  Floor,
  FloorId,
  FloorNode,
  RngStream,
  RunConfig,
  RunState,
} from './state';
