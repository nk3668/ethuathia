/**
 * The run state and entity model (docs/ARCHITECTURE.md §3.1 and §3.2).
 *
 * `RunState` is one plain-data object (see `findNonPlain` in core): no class instances, `Map`,
 * `Set` or functions. Grids are stored as `GridBuffer`s and wrapped with `Grid.wrap` to use.
 * Content (classes, monsters, features) is referenced by id only, never copied in.
 */
import type { GridBuffer, Pos, RngState } from '../core';
import { FEATURE_DOOR, FEATURE_FOUNTAIN, FEATURE_STAIRS_DOWN, FEATURE_STAIRS_UP, TERRAIN_FLOOR, TERRAIN_WALL } from '../content';
import type { AdventurerPicks } from '../content';
import type { ActionRequest } from './actions';
import type { AiPart } from './ai/types';
import type { CombatConfig, CombatParts } from './combat';
import type { DomainStates } from './domain';
import type { FloorsConfig, FloorsParts } from './floors';
import type { ItemsConfig, ItemsParts } from './items';
import type { QuestsConfig, QuestsParts } from './quests';
import type { RunDomainConfig, RunDomainParts } from './run';
import type { StatsConfig, StatsParts } from './stats';

/**
 * Bumped whenever the shape of `RunState` changes. Saves from other versions need a migration.
 * A branch that changes the shape sets it to (the version on main) + 1 when it rebases, so two
 * branches never ship different shapes under one number (docs/ARCHITECTURE.md, Contracts).
 */
export const STATE_VERSION = 42;

/**
 * Entity ids are positive integers handed out in order from `RunState.nextEntityId` and never
 * reused within a run. As keys of `RunState.entities` they iterate in ascending order.
 */
export type EntityId = number;

/** A floor's id in the dungeon graph, e.g. `d1`. */
export type FloorId = string;

/**
 * The named RNG streams. Each system draws only from its own stream, so a change to one (a new
 * monster in a spawn table) does not shift another (the layout of the floor).
 */
export const RNG_STREAMS = ['dungeon', 'combat', 'loot', 'ai'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];

/**
 * Terrain codes, as stored in a floor's `u8` terrain grid. Terrain is what a tile is made of;
 * doors, stairs and other things on a tile are feature entities. Code 0 is solid rock, so a new
 * grid starts as all wall.
 */
export const Terrain = { Wall: 0, Floor: 1 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** The content id for each terrain code, indexed by code. Glyphs, names and tooltips live there. */
export const TERRAIN_IDS: readonly string[] = [TERRAIN_WALL.id, TERRAIN_FLOOR.id];

/**
 * Content ids of the entities M0 creates. The features are content defs. `actor.adventurer` is
 * not: an adventurer's name, look and stats come from its party slot, class and race.
 */
export const DEFS = {
  adventurer: 'actor.adventurer',
  door: FEATURE_DOOR.id,
  stairsUp: FEATURE_STAIRS_UP.id,
  stairsDown: FEATURE_STAIRS_DOWN.id,
  fountain: FEATURE_FOUNTAIN.id,
} as const;

// ---------------------------------------------------------------------------------------------
// Config

/** One adventurer the run starts with. */
export interface AdventurerConfig {
  name: string;
  /** Content id, e.g. `class.vanguard`. */
  classId: string;
  /** Content id, e.g. `race.human`. */
  raceId: string;
  /**
   * The id of this adventurer's profile record (`adv.<n>`, ETH-119), which meta's `startRun`
   * issues. Left out for adventurers with no record (tests, bare configs): `applyRunResult` then
   * makes one.
   */
  recordId?: string;
  /**
   * The Forge Stamp (ETH-188) worked into this adventurer's kit, by stamp id. Only used when the
   * config sets `stamps`. Left out, the kit carries none.
   */
  stamp?: string;
  /**
   * This adventurer's own tactics picks (ETH-162): role, range, focus and habits, as `tactic.*`
   * ids. Whatever is left out comes from the class's default build, so a recruit with none plays
   * as their class does. A roster record's stored picks arrive here (`startRun`).
   */
  tactics?: Partial<AdventurerPicks>;
}

/**
 * What the sim needs to start a run. Built from the Prepare screen's choices (§6.3). Each domain
 * adds its own optional fields (depth, contracts, Omens, …) in its `<Domain>Config` interface.
 */
export interface RunConfig
  extends StatsConfig, FloorsConfig, CombatConfig, ItemsConfig, QuestsConfig, RunDomainConfig {
  /** At least one adventurer. */
  party: AdventurerConfig[];
  /**
   * The party's tactics at the start (ETH-162): the stance and formation (`tactic.*`,
   * `tactic.*`) every member begins with. Left out, the neutral defaults.
   */
  tactics?: { stance?: string; formation?: string };
  /**
   * Habits each adventurer may carry (ETH-194): the Guild Hall's habit slots, 1 to `MAX_HABITS`.
   * Left out, no limit but `MAX_HABITS`, so hand-built runs and tests need not set it.
   */
  habitSlots?: number;
  /**
   * A hand-built first floor as text (see `parseFloorText`). Tests use it for hand-built maps.
   * Leave it out to generate the first floor from the run's seed.
   */
  floorText?: string[];
}

// ---------------------------------------------------------------------------------------------
// Dungeon and floors

/** A floor's place in the dungeon. M0 and M1 are a straight line; M6 adds forks. */
export interface FloorNode {
  id: FloorId;
  /** 1 for the first floor, counting down. */
  depth: number;
  /** The floor its up stairs lead to, or `null` on the first floor (they lead out). */
  up: FloorId | null;
  /** The floors its down stairs lead to: none on the last floor, more than one at a fork. */
  down: FloorId[];
}

export interface DungeonGraph {
  /** The floor a run starts on. */
  entry: FloorId;
  nodes: Record<FloorId, FloorNode>;
}

/** A floor that has been built. Floors are built on arrival, so `RunState.floors` grows. */
export interface Floor {
  id: FloorId;
  depth: number;
  /** `u8` grid of `Terrain` codes. */
  terrain: GridBuffer;
  /**
   * The ids of the entities on this floor, in the order they arrived. Kept in step with each
   * entity's `floor` by the helpers in `entities.ts`, which are the only code that changes it.
   */
  entities: EntityId[];
}

/** A feature as the party last saw it: a copy, so it goes stale when the real one changes. */
export interface RememberedFeature {
  /** Content id, e.g. `feature.door`. */
  def: string;
  feature: FeaturePart;
}

/**
 * What the party knows of one floor (docs/ARCHITECTURE.md §3.7). It is shared: whatever one
 * member sees, they all know. Updated by `perceive` in `perception.ts`.
 */
export interface FloorMemory {
  /** `u8` grid: 0 for a tile nobody has seen, otherwise 1 + the `Terrain` code last seen there. */
  terrain: GridBuffer;
  /**
   * Features last seen, keyed by tile index (`y * width + x`). A tile last seen with no feature
   * has no entry. Monsters are never remembered.
   */
  features: Record<number, RememberedFeature>;
}

// ---------------------------------------------------------------------------------------------
// Entities

export type Faction = 'party' | 'monster' | 'neutral';

/**
 * Anything that takes turns: adventurers and monsters. Speed and the HP and MP maxima are stats
 * (the stats domain's `getStat` / `statValue`), not fields here.
 */
export interface ActorPart {
  /** Builds up by `speed` each tick; the actor acts at `ENERGY_THRESHOLD` (§3.3). */
  energy: number;
  /** Current HP. The maximum is the `hp` stat (`statValue(state, entity, 'hp')`). */
  hp: number;
  /** Current MP. The maximum is the `mp` stat. */
  mp: number;
  faction: Faction;
  /**
   * An action a `playerAction` command asked for. The actor's next turn does it instead of
   * deciding, then clears it.
   */
  queued?: ActionRequest;
}

/** The parts of a party member that monsters don't have. */
export interface AdventurerPart {
  name: string;
  classId: string;
  raceId: string;
  /** The profile record's id (`AdventurerConfig.recordId`), when the adventurer has one (ETH-119). */
  recordId?: string;
}

/**
 * Something built into a tile: a door, stairs or a fountain, later altars and graves. A
 * fountain's `draughts` are the draught ids (`draught.*`) it still holds, drunk from the front;
 * empty means it has run dry. They are rolled when the floor is built (ETH-072).
 */
export type FeaturePart =
  | { kind: 'door'; open: boolean }
  | { kind: 'stairs'; dir: 'up' | 'down' }
  | { kind: 'fountain'; draughts: string[] };

/**
 * One entity type with optional parts, not a full entity-component system. Systems are
 * functions over `RunState` that look for the parts they need. The core parts are below; each
 * domain adds its own (`stats`, `inventory`, `item`, …) as optional fields of its `<Domain>Parts`
 * interface, which `Entity` extends. Two domains naming the same part fails to compile.
 */
export interface Entity
  extends StatsParts, FloorsParts, CombatParts, ItemsParts, QuestsParts, RunDomainParts {
  id: EntityId;
  /** Content id of what this is: `actor.adventurer`, `monster.cave_rat`, `feature.door`. */
  def: string;
  floor: FloorId;
  /** Replaced, never mutated in place, so no two entities ever share a position object. */
  pos: Pos;
  actor?: ActorPart;
  adventurer?: AdventurerPart;
  feature?: FeaturePart;
  /** Rules and decision memory, for actors the decision engine drives (docs/ARCHITECTURE.md §4). */
  ai?: AiPart;
}

/** An entity known to have an actor part. */
export type ActorEntity = Entity & { actor: ActorPart };

// ---------------------------------------------------------------------------------------------
// The run

export interface RunState {
  version: number;
  /** The seed the run was created with, for display and bug reports. */
  seed: number;
  /** One RNG state per stream. Draw with `new Rng(state.rng.combat)`, which updates it in place. */
  rng: Record<RngStream, RngState>;
  turn: number;
  config: RunConfig;
  dungeon: DungeonGraph;
  floors: Record<FloorId, Floor>;
  /** The party's memory of each built floor, with the same keys as `floors`. */
  memory: Record<FloorId, FloorMemory>;
  entities: Record<EntityId, Entity>;
  /** Party members' entity ids, in party order. */
  party: EntityId[];
  nextEntityId: EntityId;
  /**
   * Each domain's slice, keyed by domain (`state.domains.combat`), built by `initDomains` from
   * the config. Domains keep their run-wide state here, never in new top-level fields.
   */
  domains: DomainStates;
}
