/**
 * The run state and entity model (docs/ARCHITECTURE.md §3.1 and §3.2).
 *
 * `RunState` is one plain-data object (see `findNonPlain` in core): no class instances, `Map`,
 * `Set` or functions. Grids are stored as `GridBuffer`s and wrapped with `Grid.wrap` to use.
 * Content (classes, monsters, features) is referenced by id only, never copied in.
 */
import type { GridBuffer, Pos, RngState } from '../core';
import type { ActionRequest } from './actions';

/** Bumped whenever the shape of `RunState` changes. Saves from other versions need a migration. */
export const STATE_VERSION = 1;

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
export const TERRAIN_IDS: readonly string[] = ['terrain.wall', 'terrain.floor'];

/** Content ids of the entities M0 creates. Their definitions arrive with ETH-015. */
export const DEFS = {
  adventurer: 'actor.adventurer',
  door: 'feature.door',
  stairsUp: 'feature.stairs_up',
  stairsDown: 'feature.stairs_down',
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
}

/** What the sim needs to start a run. Built from the Prepare screen's choices (§6.3). */
export interface RunConfig {
  /** At least one adventurer. */
  party: AdventurerConfig[];
  /**
   * A hand-built first floor as text (see `parseFloorText`). Tests use it for hand-built maps.
   * Leave it out to use the built-in M0 floor, until generation arrives with ETH-006.
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

// ---------------------------------------------------------------------------------------------
// Entities

export type Faction = 'party' | 'monster' | 'neutral';

/** Anything that takes turns: adventurers and monsters. */
export interface ActorPart {
  /** Builds up by `speed` each tick; the actor acts at `ENERGY_THRESHOLD` (§3.3). */
  energy: number;
  speed: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
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
}

/** Something built into a tile: a door or stairs, later altars, graves and fountains. */
export type FeaturePart = { kind: 'door'; open: boolean } | { kind: 'stairs'; dir: 'up' | 'down' };

/**
 * One entity type with optional parts, not a full entity-component system. Systems are
 * functions over `RunState` that look for the parts they need. Later items add parts such as
 * `stats`, `inventory`, `ai` and `item`.
 */
export interface Entity {
  id: EntityId;
  /** Content id of what this is: `actor.adventurer`, `monster.cave_rat`, `feature.door`. */
  def: string;
  floor: FloorId;
  /** Replaced, never mutated in place, so no two entities ever share a position object. */
  pos: Pos;
  actor?: ActorPart;
  adventurer?: AdventurerPart;
  feature?: FeaturePart;
}

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
  entities: Record<EntityId, Entity>;
  /** Party members' entity ids, in party order. */
  party: EntityId[];
  nextEntityId: EntityId;
}
