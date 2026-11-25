/**
 * The dungeon's shape and its floors (docs/ARCHITECTURE.md §3.6): a straight line of floor nodes
 * `d1` … `dN`, each floor built the first time someone reaches it, and the stairs that link them.
 *
 * Each floor's layout comes from its own RNG, derived from the run seed and the floor id
 * (`floorRngState`), never from a shared stream position. So the order in which floors are first
 * visited never changes any floor: `d3` of seed 7 is the same whether the party reaches it on
 * turn 500 or turn 5,000, and whatever was generated before it.
 */
import { clampRange, DIRS_8, Grid, Rng, seedState } from '../../core';
import type { Pos, RngState } from '../../core';
import { DUNGEON_OLD_DELVE, DUNGEONS, FLOOR_HALLS, FLOOR_TYPES } from '../../content';
import type { DungeonDef } from '../../content';
import { actorAt, addFloor, featureAt, getFloor } from '../entities';
import { parseFloorText } from '../floorText';
import type { FloorPlan } from '../floorText';
import { generateFloor } from '../gen/generate';
import type { FloorRisk } from '../gen/types';
import { capFountains, configMaxFountains } from './fountains';
import { FLOOR_PLAN_HOOKS } from '../registries';
import { Terrain } from '../state';
import type { DungeonGraph, Entity, Floor, FloorId, FloorNode, RunConfig, RunState } from '../state';
import { floorRisk } from '../stats/omenEffects';
import { runFlag } from '../stats/runModifiers';

/** How many floors a run's dungeon has when the config doesn't say (CLAUDE.md §2). */
export const DEFAULT_DEPTH = 10;

/** The dungeon variant used when `RunConfig.dungeonId` is omitted. */
export const DEFAULT_DUNGEON_ID = DUNGEON_OLD_DELVE.id;

/** Run-modifier flag (e.g. Cartographer upgrade) revealing rolled dungeon depth from turn 0. */
export const FLAG_REVEAL_DEPTH = 'floors.reveal_depth';

/** The deepest dungeon a config may ask for. */
export const MAX_DEPTH = 99;

/** The floor type every generated floor uses until floor variety arrives (M6). */
export const DEFAULT_FLOOR_TYPE = FLOOR_HALLS.id;

/** Which way a flight of stairs goes. */
export type StairsDir = 'up' | 'down';

/** The id of the floor at `depth` on the main line: `d1`, `d2`, … */
export function floorIdAt(depth: number): FloorId {
  return `d${depth}`;
}

function validateDepthNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_DEPTH) {
    throw new RangeError(`The dungeon ${label} must be a whole number from 1 to ${MAX_DEPTH}, got ${String(value)}`);
  }
  return value;
}

/** The dungeon variant a config points to (`DEFAULT_DUNGEON_ID` when omitted). Throws `RangeError` if unknown. */
export function configDungeon(config: RunConfig): DungeonDef {
  const id = config.dungeonId ?? DEFAULT_DUNGEON_ID;
  if (!DUNGEONS.has(id)) throw new RangeError(`Unknown dungeon id "${id}"`);
  return DUNGEONS.get(id);
}

/**
 * Validated `{ min, max }` floor bounds for a run config, resolving omitted fields against
 * `configDungeon(config).depth` via `clampRange`. Throws `RangeError` on invalid bounds or unknown `dungeonId`.
 */
export function configDepthRange(config: RunConfig): { min: number; max: number } {
  const dungeon = configDungeon(config);
  const { depth } = config;
  if (depth === undefined) return clampRange(undefined, dungeon.depth, 1);
  if (typeof depth === 'number') {
    validateDepthNumber(depth, 'depth');
    return { min: depth, max: depth };
  }
  if (typeof depth !== 'object' || depth === null || Array.isArray(depth)) {
    throw new RangeError(`The dungeon depth must be a whole number or { min?, max? } from 1 to ${MAX_DEPTH}`);
  }
  if (depth.min !== undefined) validateDepthNumber(depth.min, 'depth.min');
  if (depth.max !== undefined) validateDepthNumber(depth.max, 'depth.max');
  if (depth.min !== undefined && depth.max !== undefined && depth.min > depth.max) {
    throw new RangeError(`The dungeon depth min (${depth.min}) must not be above max (${depth.max})`);
  }
  return clampRange(depth, dungeon.depth, 1);
}

/**
 * Deterministic rolled dungeon depth for `config` and `seed`: returns `min` directly when fixed,
 * else draws from `seedState(seed, 'dungeon/depth')` so Rematch (`ETH-084`) reproduces the exact
 * depth without shifting shared RNG streams.
 */
export function resolveRunDepth(config: RunConfig, seed: number): number {
  const { min, max } = configDepthRange(config);
  return min === max ? min : new Rng(seedState(seed, 'dungeon/depth')).int(min, max);
}

/** The maximum dungeon depth a config validates to (`configDepthRange(config).max`). */
export function configDepth(config: RunConfig): number {
  return configDepthRange(config).max;
}

/** The `DungeonDef` for an active run (`RunState`). */
export function runDungeon(state: RunState): DungeonDef {
  return configDungeon(state.config);
}

/** Effective Danger on floor `depth` (`1`-indexed) from the run's dungeon Danger curve. */
export function floorDanger(state: RunState, depth: number): number {
  const { start, perFloor } = runDungeon(state).danger;
  return start + (depth - 1) * perFloor;
}

/** True once the party has reached the bottom floor or carries `FLAG_REVEAL_DEPTH`. */
export function depthRevealed(state: RunState): boolean {
  return state.domains.floors.deepest >= dungeonDepth(state) || runFlag(state, FLAG_REVEAL_DEPTH);
}

/**
 * The dungeon graph for a run: a straight line of `depth` floors, `d1` at the top. Every node
 * exists from the start; only the floors themselves are built lazily (`ensureFloor`).
 */
export function buildDungeon(depth: number): DungeonGraph {
  const nodes: Record<FloorId, FloorNode> = {};
  for (let d = 1; d <= depth; d++) {
    const id = floorIdAt(d);
    nodes[id] = { id, depth: d, up: d === 1 ? null : floorIdAt(d - 1), down: d === depth ? [] : [floorIdAt(d + 1)] };
  }
  return { entry: floorIdAt(1), nodes };
}

/** The node of `floorId`. Throws if the dungeon has no such floor. */
export function floorNode(state: RunState, floorId: FloorId): FloorNode {
  const node = state.dungeon.nodes[floorId];
  if (node === undefined) throw new Error(`Floor "${floorId}" is not in the dungeon graph`);
  return node;
}

/** How many floors the dungeon has on its main line. */
export function dungeonDepth(state: RunState): number {
  return Object.keys(state.dungeon.nodes).length;
}

/** True if `floorId` has no stairs down: the bottom of the dungeon. */
export function isBottomFloor(state: RunState, floorId: FloorId): boolean {
  return floorNode(state, floorId).down.length === 0;
}

/**
 * The floor the stairs on `floorId` going `dir` lead to, or `null` for the up stairs of the first
 * floor, which lead out of the dungeon.
 */
export function stairsTarget(state: RunState, floorId: FloorId, dir: StairsDir): FloorId | null {
  const node = floorNode(state, floorId);
  return dir === 'up' ? node.up : (node.down[0] ?? null);
}

/**
 * The RNG state floor `floorId` is generated from: derived from the run seed and the floor id
 * alone, so a floor never depends on which floors were built before it.
 */
export function floorRngState(seed: number, floorId: FloorId): RngState {
  return seedState(seed, `dungeon/${floorId}`);
}

/** The config's hand-built text for the floor at `depth`, if it has one. */
function floorTextAt(state: RunState, depth: number): string[] | undefined {
  const { config } = state;
  return depth === 1 && config.floorText !== undefined ? config.floorText : config.floorTexts?.[depth - 1];
}

/**
 * The floor type (content id, `floor.halls`) floor `floorId` is generated from, or `null` for a
 * hand-built floor from the config's text. Changes nothing in `state`.
 */
export function floorTypeOf(state: RunState, floorId: FloorId): string | null {
  return floorTextAt(state, floorNode(state, floorId).depth) === undefined ? DEFAULT_FLOOR_TYPE : null;
}

/**
 * The RNG state the items placed on floor `floorId` are drawn from (ETH-061): like
 * `floorRngState`, from the seed and floor id alone, and separate from it, so loot changes never
 * move a wall.
 */
export function lootRngState(seed: number, floorId: FloorId): RngState {
  return seedState(seed, `loot/${floorId}`);
}

/** `{ risk }` for `generateFloor` when an Omen changes how floors are built (ETH-186), else nothing. */
function riskOption(state: RunState): { risk?: FloorRisk } {
  const risk = floorRisk(state);
  return risk === undefined ? {} : { risk };
}

/**
 * The plan for floor `floorId`, before it is built: the config's hand-built text for that depth
 * (`floorText` for the first floor, else `floorTexts[depth - 1]`), or a generated
 * `DEFAULT_FLOOR_TYPE` floor. The bottom floor never has stairs down, and fountains beyond
 * `RunConfig.maxFountains` are left out (`capFountains`), then every `FLOOR_PLAN_HOOKS` hook runs.
 * Changes nothing in `state`.
 */
export function planFloor(state: RunState, floorId: FloorId): FloorPlan {
  const node = floorNode(state, floorId);
  const text = floorTextAt(state, node.depth);
  const plan =
    text !== undefined
      ? parseFloorText(text)
      : generateFloor(FLOOR_TYPES.get(DEFAULT_FLOOR_TYPE), new Rng(floorRngState(state.seed, floorId)), {
          depth: node.depth,
          danger: floorDanger(state, node.depth),
          dungeon: runDungeon(state),
          ...riskOption(state),
          partySize: state.config.party.length,
          loot: new Rng(lootRngState(state.seed, floorId)),
        });
  if (node.down.length === 0) {
    plan.features = plan.features.filter((f) => !(f.feature.kind === 'stairs' && f.feature.dir === 'down'));
  }
  const { config } = state;
  capFountains(plan, configMaxFountains(config.maxFountains));
  // `RunConfig.monsters: false` (the combat domain's config) builds floors without creatures.
  if (config.monsters === false) delete plan.spawns;
  // Other domains' changes (ETH-024: a contract's relic on the bottom floor), in domain order.
  for (const hook of FLOOR_PLAN_HOOKS) hook.apply(state, floorId, plan);
  return plan;
}

/**
 * Floor `floorId`, building it first if nobody has been there yet. Building is deterministic
 * from the seed and the floor id (`planFloor`), so the result never depends on when or in which
 * order floors are reached. The party's memory of a new floor starts empty.
 */
export function ensureFloor(state: RunState, floorId: FloorId): Floor {
  return state.floors[floorId] ?? addFloor(state, floorId, planFloor(state, floorId));
}

/** The stairs feature on a built floor going `dir`, if it has one (the first, in arrival order). */
export function stairsOn(state: RunState, floorId: FloorId, dir: StairsDir): Entity | undefined {
  for (const id of getFloor(state, floorId).entities) {
    const e = state.entities[id];
    if (e?.feature?.kind === 'stairs' && e.feature.dir === dir) return e;
  }
  return undefined;
}

/**
 * Where someone arriving on a built floor at or near `pos` is put: `pos` itself if no actor
 * stands there, else the nearest floor tile (breadth-first, `DIRS_8` order) with no actor and no
 * feature on it. `null` if the floor is full.
 */
export function arrivalTile(state: RunState, floorId: FloorId, pos: Pos): Pos | null {
  const terrain = Grid.wrap(getFloor(state, floorId).terrain);
  if (terrain.get(pos.x, pos.y) === Terrain.Floor && actorAt(state, floorId, pos) === undefined) return { x: pos.x, y: pos.y };
  const seen = new Grid(terrain.width, terrain.height, 'u8');
  seen.set(pos.x, pos.y, 1);
  const queue: Pos[] = [pos];
  // A for-of over an array also visits what is pushed during the loop.
  for (const p of queue) {
    for (const d of DIRS_8) {
      const x = p.x + d.x;
      const y = p.y + d.y;
      if (!terrain.inBounds(x, y) || seen.get(x, y) === 1 || terrain.get(x, y) !== Terrain.Floor) continue;
      seen.set(x, y, 1);
      const tile = { x, y };
      if (actorAt(state, floorId, tile) === undefined && featureAt(state, floorId, tile) === undefined) return tile;
      queue.push(tile);
    }
  }
  return null;
}

/**
 * The tile someone taking the stairs `dir` arrives on, on floor `to`: the linked stairs (the up
 * stairs when going down, the down stairs when going up), or for a hand-built floor without them
 * its first floor tile in row order. Builds `to` first if needed.
 */
export function arrivalStairs(state: RunState, to: FloorId, dir: StairsDir): Pos {
  ensureFloor(state, to);
  const linked = stairsOn(state, to, dir === 'down' ? 'up' : 'down');
  if (linked !== undefined) return linked.pos;
  const terrain = Grid.wrap(getFloor(state, to).terrain);
  for (let y = 0; y < terrain.height; y++) {
    for (let x = 0; x < terrain.width; x++) if (terrain.get(x, y) === Terrain.Floor) return { x, y };
  }
  throw new Error(`Floor "${to}" has no floor tile to arrive on`);
}
