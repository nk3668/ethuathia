/**
 * sim: the deterministic simulation. No DOM access.
 * May import: core, content. See docs/ARCHITECTURE.md §1.
 *
 * The composition hub, `domains.ts`, must stay the first module loaded: it reads every domain
 * once they have all finished loading (docs/ARCHITECTURE.md, Contracts). Keep this line first.
 */
export {
  ACTIONS,
  CHRONICLE_KINDS,
  CHRONICLE_RULES,
  COMMANDS,
  CONDITIONS,
  DISCOVERY_RULES,
  DOMAIN_KEYS,
  DOMAINS,
  domainSnapshots,
  BUNDLE_SOURCES,
  GEN_STEPS,
  initDomains,
  RULE_ACTIONS,
  RUN_TRACKERS,
  runStepEnd,
  runTurnEnd,
  runTurnStart,
  STAT_PROVIDERS,
  TRIGGERS,
  VICTORY_CHECKS,
} from './domains';
export type {
  DomainKey,
  DomainShape,
  DomainSnapshots,
  DomainStates,
  DomainTypes,
  RunTracker,
  SimDomain,
  SnapshotCtx,
  StepCtx,
  TurnCtx,
  VictoryCheck,
} from './domain';
export { isActionId, parseRequest, performAction, validateAction } from './actions';
export type { ActionCtx, ActionDef, ActionId, ActionRecord, ActionRequest, ActorCtx, BaseRequest, RequestOf } from './actions';
export { bumpTarget, CORE_ACTIONS, isStep, stepBlocker } from './coreActions';
export type { BumpRequest, CoreRequest, MoveRequest, OpenDoorRequest, WaitRequest } from './coreActions';
export { CORE_COMMANDS } from './coreCommands';
export type { CoreCommand, PlayerActionCommand } from './coreCommands';
export { CORE_DISCOVERIES } from './coreEvents';
export type { CoreEvent } from './coreEvents';
export * from './stats';
export * from './floors';
export * from './combat';
export * from './items';
export * from './quests';
export * from './run';
export {
  ACT_BACK_OFF,
  ACT_EXPLORE,
  ACT_WAIT,
  aiPathGrid,
  BASELINE_RULES,
  chooseRule,
  COND_ALWAYS,
  COND_STUCK,
  CORE_CONDITIONS,
  defineCondition,
  defineRuleAction,
  DROP_TURNS,
  followMap,
  frontier,
  newAiPart,
  noParams,
  OCCUPIED_COST,
  willingToSwap,
  CORE_RULE_ACTIONS,
  ruleDecide,
  STUCK_TURNS,
  WAIT_STUCK_TURNS,
  awaitsPlayer,
  compassName,
  describePlayerAction,
  isPossessed,
  PLAYER_RULE,
  POSSESSION_COMMANDS,
  possessedMember,
  tracePlayerAction,
  checkRequirement,
  CONDITION_TARGET,
  describeCondition,
  describeRequirement,
  hasActor,
  requirementProblems,
  requirementScope,
} from './ai';
export type {
  AiActor,
  AiCtx,
  AiMemory,
  AiPart,
  Choice,
  ConditionDef,
  ConditionResult,
  ConditionScope,
  DroppedGoal,
  Intent,
  ParamParser,
  ProgressMark,
  Resolved,
  Rule,
  RuleActionDef,
  RulePart,
  RuleRef,
  PossessCommand,
  PossessionCommand,
  ReleaseCommand,
  RunCtx,
} from './ai';
export { applyCommand } from './commands';
export type { BaseCommand, Command, CommandDef, CommandRecord, CommandType } from './commands';
export type { Emit, EventOf, SimEvent, SimEventBody, SimEventType } from './events';
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
export { floorToText, parseFloorText, planToText, TEXT_FOUNTAIN_DRAUGHTS } from './floorText';
export type { FloorPlan, PlannedItem } from './floorText';
export { checkFloorType, defineGenStep, generateFloor, readParams, rectTiles, ROOM_STEPS } from './gen';
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
export { adventurerActor, createRun, FIRST_FLOOR_TYPE } from './createRun';
export { deserialize, serialize, stateHash } from './serialize';
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
export * from './invariants';
