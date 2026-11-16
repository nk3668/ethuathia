/**
 * sim: the deterministic simulation. No DOM access.
 * May import: core, content. See docs/ARCHITECTURE.md §1.
 */
export { ACTIONS, isActionId, isStep, parseRequest, performAction, stepBlocker, validateAction } from './actions';
export type {
  ActionCtx,
  ActionDef,
  ActionId,
  ActionRequest,
  ActorCtx,
  MoveRequest,
  OpenDoorRequest,
  RequestOf,
  WaitRequest,
} from './actions';
export { applyCommand } from './commands';
export type { Command, CommandType, PlayerActionCommand } from './commands';
export type { Emit, SimEvent, SimEventBody, SimEventType } from './events';
export { ENERGY_THRESHOLD, step, waitDecide } from './step';
export type { Decide, DecideCtx, StepOptions } from './step';
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
export { floorToText, parseFloorText, planToText } from './floorText';
export type { FloorPlan } from './floorText';
export { checkFloorType, defineGenStep, GEN_STEPS, generateFloor, readParams, rectTiles } from './gen';
export type { BoundGenStep, FloorDraft, GenStepDef, NumberParam, Rect } from './gen';
export { createRun, FIRST_FLOOR_TYPE } from './run';
export { deserialize, serialize } from './serialize';
export { DEFS, RNG_STREAMS, STATE_VERSION, Terrain, TERRAIN_IDS } from './state';
export type {
  ActorEntity,
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
