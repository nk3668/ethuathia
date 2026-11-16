/**
 * Goal maps (docs/ARCHITECTURE.md §2.5): Dijkstra distance maps over a floor.
 *
 * A goal map gives every tile its cost to reach the nearest goal. Stepping "downhill" approaches
 * the goals; stepping downhill on a flee map (`buildFleeMap`) gets away from them without
 * running into a dead end. One tool serves exploring, fleeing, stairs, regrouping and chase.
 *
 * Maps are built over a `PathGrid`: what each tile costs to enter and which tiles are doorways.
 * The step rules match the move action's `stepBlocker` (a test checks every step of several
 * floors against it), so the AI never plans a path it can't walk. Creatures are not obstacles
 * here, as in `stepBlocker`; the caller deals with someone standing in the way.
 */
import { DIRS_8, Grid } from '../core';
import type { Pos } from '../core';
import { getEntity, getFloor } from './entities';
import { getMemory } from './perception';
import { Terrain } from './state';
import type { FloorId, RunState } from './state';

/** The distance of a tile no goal can be reached from. Larger than any real distance. */
export const UNREACHABLE = 0x7fff_ffff;

/** The cost of one step onto an open tile, orthogonal or diagonal (the move action's cost / 100). */
export const STEP_COST = 1;

/** A suggested `closedDoorCost`: one turn to open the door and one to step through it. */
export const OPEN_DOOR_COST = 2;

/**
 * How far a flee map scales the distances it is built from. Below -1, so a tile a little closer
 * to the threat but in open ground beats a dead end slightly further away. The value Brogue's
 * "safety map" made popular.
 */
export const FLEE_FACTOR = -1.2;

// Local copies for the hot loops: imported bindings can cost a getter call per use under some
// module runners (vitest's, for one), which skews benchmarks.
const DIRS = DIRS_8;
const FLOOR = Terrain.Floor;

/**
 * What pathing needs to know about a floor. Indexes are tile indexes (`y * width + x`).
 * Build one with `floorPathGrid` or `memoryPathGrid`, or by hand; callers may raise costs
 * afterwards (for example around a monster) before building a map.
 */
export interface PathGrid {
  readonly width: number;
  readonly height: number;
  /** What it costs to step onto each tile, at least 1, or 0 if the tile can't be entered. */
  readonly cost: Uint16Array;
  /** 1 on doorways (a door, open or closed), which can only be entered or left orthogonally. */
  readonly doorway: Uint8Array;
}

/** The passability rule for building a `PathGrid`. */
export interface Passability {
  /**
   * What it costs to step onto a closed door, which the walker opens on the way, or `null` if
   * closed doors block. Defaults to `null`, as for the move action. `OPEN_DOOR_COST` is the
   * usual choice for an actor that can open doors.
   */
  readonly closedDoorCost?: number | null;
}

/** The cost to put on closed doors in `PathGrid.cost`: 0 (blocked) for `null`. */
function closedDoorCost(passability: Passability): number {
  const cost = passability.closedDoorCost ?? null;
  if (cost === null) return 0;
  if (!Number.isInteger(cost) || cost < 1 || cost > 0xffff) {
    throw new RangeError(`closedDoorCost must be null or a whole number from 1 to 65535, got ${cost}`);
  }
  return cost;
}

/**
 * The floor as it really is, for actors that know it (monsters on their home floor, tests).
 * Adventurers path over what the party knows instead: `memoryPathGrid`.
 */
export function floorPathGrid(state: RunState, floorId: FloorId, passability: Passability = {}): PathGrid {
  const floor = getFloor(state, floorId);
  const { width, height, cells } = floor.terrain;
  const doorCost = closedDoorCost(passability);
  const cost = new Uint16Array(width * height);
  const doorway = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) if (cells[i] === FLOOR) cost[i] = STEP_COST;
  for (const id of floor.entities) {
    const { pos, feature } = getEntity(state, id);
    if (feature?.kind !== 'door') continue;
    const i = pos.y * width + pos.x;
    doorway[i] = 1;
    if (!feature.open && cost[i] !== 0) cost[i] = doorCost;
  }
  return { width, height, cost, doorway };
}

/**
 * The floor as the party remembers it (docs/ARCHITECTURE.md §3.7): tiles nobody has seen can't
 * be entered, and doors are open or closed as last seen. This is what adventurers path over, so
 * they never use knowledge they don't have.
 */
export function memoryPathGrid(state: RunState, floorId: FloorId, passability: Passability = {}): PathGrid {
  const memory = getMemory(state, floorId);
  const { width, height, cells } = memory.terrain;
  const doorCost = closedDoorCost(passability);
  const cost = new Uint16Array(width * height);
  const doorway = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) if (cells[i] === FLOOR + 1) cost[i] = STEP_COST;
  for (const [key, { feature }] of Object.entries(memory.features)) {
    if (feature.kind !== 'door') continue;
    const i = Number(key);
    doorway[i] = 1;
    if (!feature.open && cost[i] !== 0) cost[i] = doorCost;
  }
  return { width, height, cost, doorway };
}

/**
 * True if the path grid allows a step from tile `(x, y)` in direction `dir` (one of `DIRS_8`):
 * the target is inside the grid and can be entered, and a diagonal step neither enters nor
 * leaves a doorway. Like `stepBlocker`, it doesn't ask whether the starting tile can be entered.
 */
export function canStep(paths: PathGrid, x: number, y: number, dir: Pos): boolean {
  const nx = x + dir.x;
  const ny = y + dir.y;
  if (nx < 0 || ny < 0 || nx >= paths.width || ny >= paths.height) return false;
  const to = ny * paths.width + nx;
  if (paths.cost[to] === 0) return false;
  return dir.x === 0 || dir.y === 0 || (paths.doorway[to] === 0 && paths.doorway[y * paths.width + x] === 0);
}

// ---------------------------------------------------------------------------------------------
// Building maps

/**
 * The cost from every tile to the nearest of `goals`, as an `i32` grid; `UNREACHABLE` where no
 * goal can be reached, including every tile that can't be entered. Each goal is 0. A goal on a
 * tile that can't be entered is reached by nothing but itself. Throws on a goal outside the grid.
 */
export function buildGoalMap(paths: PathGrid, goals: readonly Pos[]): Grid {
  const map = new Grid(paths.width, paths.height, 'i32', UNREACHABLE);
  for (const { x, y } of goals) map.set(x, y, 0);
  relax(paths, map.cells as Int32Array);
  return map;
}

/**
 * A map for getting away from the goals of `toward`: step downhill on it to flee. Every tile
 * that reaches a goal starts at its distance times `factor` (negative), then the map is relaxed
 * again, so a tile next to open ground beats the far end of a dead end. Plain "uphill" stepping
 * on `toward` corners the walker instead.
 */
export function buildFleeMap(paths: PathGrid, toward: Grid, factor = FLEE_FACTOR): Grid {
  if (toward.width !== paths.width || toward.height !== paths.height) {
    throw new RangeError('buildFleeMap: the goal map and the path grid are different sizes');
  }
  if (!(factor < 0) || !Number.isFinite(factor)) throw new RangeError(`flee factor must be negative, got ${factor}`);
  const map = new Grid(paths.width, paths.height, 'i32', UNREACHABLE);
  const cells = map.cells as Int32Array;
  for (let i = 0; i < cells.length; i++) {
    const d = toward.cells[i] as number;
    if (d !== UNREACHABLE && paths.cost[i] !== 0) cells[i] = Math.round(d * factor);
  }
  relax(paths, cells);
  return map;
}

/**
 * Dijkstra from every tile that already has a value: lowers each tile that can be entered to
 * the cheapest of its own value and (a neighbor's value + the cost of stepping onto that
 * neighbor). The result doesn't depend on the order tiles are taken from the queue.
 */
function relax(paths: PathGrid, dist: Int32Array): void {
  const { width, height, cost, doorway } = paths;
  const queue = new TileQueue(dist.length);
  dist.forEach((d, i) => {
    if (d !== UNREACHABLE) queue.push(d, i);
  });
  for (;;) {
    const b = queue.pop();
    if (b === -1) break;
    const db = dist[b] as number;
    if (queue.key !== db) continue; // a stale entry: b was lowered after this was queued
    const stepOn = cost[b] as number;
    if (stepOn === 0) continue; // nothing can step onto b
    const bx = b % width;
    const by = (b - bx) / width;
    const bDoor = doorway[b] === 1;
    // Each `a` is a tile that steps onto `b` by `-d`.
    for (const d of DIRS) {
      const ax = bx + d.x;
      const ay = by + d.y;
      if (ax < 0 || ay < 0 || ax >= width || ay >= height) continue;
      const a = ay * width + ax;
      if (cost[a] === 0) continue;
      if (d.x !== 0 && d.y !== 0 && (bDoor || doorway[a] === 1)) continue;
      const da = db + stepOn;
      if (da < (dist[a] as number)) {
        dist[a] = da;
        queue.push(da, a);
      }
    }
  }
}

/**
 * A binary min-heap of tiles keyed by distance, ties broken by tile index. Entries are never
 * removed early; `relax` skips the stale ones.
 */
class TileQueue {
  private keys: Float64Array;
  private size = 0;
  /** The key of the tile `pop` last returned. */
  key = 0;
  private readonly tiles: number;

  constructor(tiles: number) {
    this.tiles = tiles;
    this.keys = new Float64Array(Math.max(16, tiles));
  }

  /** Distances and indexes pack into one number, exact while |distance| * tiles < 2^53. */
  push(distance: number, tile: number): void {
    if (this.size === this.keys.length) {
      const grown = new Float64Array(this.size * 2);
      grown.set(this.keys);
      this.keys = grown;
    }
    const k = distance * this.tiles + tile;
    const keys = this.keys;
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const pk = keys[parent] as number;
      if (pk <= k) break;
      keys[i] = pk;
      i = parent;
    }
    keys[i] = k;
  }

  /** The tile with the smallest key (setting `key`), or -1 if the queue is empty. */
  pop(): number {
    if (this.size === 0) return -1;
    const keys = this.keys;
    const top = keys[0] as number;
    const last = keys[--this.size] as number;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      if (left >= this.size) break;
      const right = left + 1;
      const child = right < this.size && (keys[right] as number) < (keys[left] as number) ? right : left;
      if ((keys[child] as number) >= last) break;
      keys[i] = keys[child] as number;
      i = child;
    }
    keys[i] = last;
    const tile = ((top % this.tiles) + this.tiles) % this.tiles;
    this.key = (top - tile) / this.tiles;
    return tile;
  }
}

// ---------------------------------------------------------------------------------------------
// Following maps

/**
 * The step (one of `DIRS_8`) to take from `from` to follow `map` downhill, or `null` if there is
 * none: `from` is a goal, can't reach one, or is out of the grid.
 *
 * The step chosen is on a cheapest route: it minimizes the neighbor's value plus the cost of
 * stepping onto it, and the neighbor is always lower than `from`. Ties go to the first step in
 * `DIRS_8` order, so straight steps beat diagonal ones and the choice is deterministic.
 */
export function stepToward(paths: PathGrid, map: Grid, from: Pos): Pos | null {
  if (!map.inBounds(from.x, from.y)) return null;
  const { width, cost } = paths;
  const here = map.cells[from.y * width + from.x] as number;
  if (here === UNREACHABLE) return null;
  let best: Pos | null = null;
  let bestTotal = UNREACHABLE;
  for (const d of DIRS) {
    if (!canStep(paths, from.x, from.y, d)) continue;
    const n = (from.y + d.y) * width + from.x + d.x;
    const value = map.cells[n] as number;
    if (value === UNREACHABLE || value >= here) continue;
    const total = value + (cost[n] as number);
    if (total < bestTotal) {
      bestTotal = total;
      best = d;
    }
  }
  return best === null ? null : { x: best.x, y: best.y };
}

/**
 * The tiles visited by following `map` downhill from `from` with `stepToward`, not including
 * `from`, for at most `maxSteps` steps. Empty if no step can be taken. For previews and tests;
 * the AI takes one step per turn and looks again.
 */
export function pathAlong(paths: PathGrid, map: Grid, from: Pos, maxSteps = paths.width * paths.height): Pos[] {
  const path: Pos[] = [];
  let at = from;
  while (path.length < maxSteps) {
    const d = stepToward(paths, map, at);
    if (d === null) break;
    at = { x: at.x + d.x, y: at.y + d.y };
    path.push(at);
  }
  return path;
}
