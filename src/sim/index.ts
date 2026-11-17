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
export {
  ACT_BACK_OFF,
  ACT_EXPLORE,
  ACT_WAIT,
  aiPathGrid,
  BASELINE_RULES,
  chooseRule,
  COND_ALWAYS,
  COND_STUCK,
  CONDITIONS,
  defineCondition,
  defineRuleAction,
  DROP_TURNS,
  followMap,
  frontier,
  newAiPart,
  noParams,
  OCCUPIED_COST,
  RULE_ACTIONS,
  ruleDecide,
  STUCK_TURNS,
} from './ai';
export type {
  AiActor,
  AiCtx,
  AiMemory,
  AiPart,
  Choice,
  ConditionDef,
  ConditionResult,
  DroppedGoal,
  Intent,
  ParamParser,
  ProgressMark,
  Resolved,
  Rule,
  RuleActionDef,
  RulePart,
  RuleRef,
} from './ai';
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
export {
  buildFleeMap,
  buildGoalMap,
  canStep,
  FLEE_FACTOR,
  floorPathGrid,
  memoryPathGrid,
  OPEN_DOOR_COST,
  pathAlong,
  STEP_COST,
  stepToward,
  UNREACHABLE,
} from './goalMap';
export type { Passability, PathGrid } from './goalMap';
export { computeFov } from './fov';
export type { FovInput } from './fov';
export {
  BASE_SIGHT_RADIUS,
  canSee,
  explored,
  fieldOfView,
  getMemory,
  partyVisible,
  perceive,
  perceiveParty,
  rememberedTerrain,
  sightBlockers,
  sightRadius,
} from './perception';
export type { Explored } from './perception';
export {
  deliver,
  InlineHost,
  isSpeed,
  Listeners,
  MAX_SLICE_MS,
  MAX_STEPS_PER_PUMP,
  PacedRunner,
  readHostRequest,
  SimSession,
  SNAPSHOT_INTERVAL_MS,
  SPEEDS,
  TURNS_PER_SECOND,
} from './host';
export type { Clock, HostMessage, HostRequest, HostUpdate, SimHost, Speed, Unsubscribe } from './host';
export { adventurerActor, createRun, FIRST_FLOOR_TYPE } from './run';
export { deserialize, serialize } from './serialize';
export { snapshot } from './snapshot';
export { checkFloorParams, checkGame, validateGame } from './validate';
export type { ActorView, FeatureView, FloorView, PartyMemberView, Snapshot, ViewOptions } from './snapshot';
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
  FloorMemory,
  FloorNode,
  RememberedFeature,
  RngStream,
  RunConfig,
  RunState,
} from './state';
