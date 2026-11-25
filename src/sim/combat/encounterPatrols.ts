/**
 * Corridor patrol waypoint planning and deterministic patrol squad placement (ETH-135, ETH-157).
 */
import type { Grid, Pos, Rng } from '../../core';
import type { DungeonEcology, MonsterDef, MonsterRole } from '../../content';
import { rectTiles } from '../gen/types';
import type { FloorDraft, Rect } from '../gen/types';
import { buildGoalMap, OPEN_DOOR_COST, STEP_COST, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { Terrain } from '../state';
import {
  chebyshev,
  inRoom,
  pickClusteredTile,
  pickMonsterForSlot,
  poolForOodRoll,
  recordPlacement,
  roomCenter,
  tileKey,
} from './encounterShared';
import type { FloorLayout, OccupancyTracker } from './encounterShared';
import type { MonsterPatrol } from './groupAi';
import { newMonster, rollOodDanger, templateChanceFor } from './monsters';
import { rollTemplates } from './overlay';

/** Builds a `PathGrid` from a `FloorDraft` treating closed doors as passable with `OPEN_DOOR_COST`. */
export function buildDraftPathGrid(draft: FloorDraft): PathGrid {
  const { width, height, cells } = draft.terrain;
  const cost = new Uint16Array(width * height);
  const doorway = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) if (cells[i] === Terrain.Floor) cost[i] = STEP_COST;
  for (const f of draft.features) {
    if (f.feature.kind !== 'door') continue;
    const i = f.pos.y * width + f.pos.x;
    doorway[i] = 1;
    if (!f.feature.open && cost[i] !== 0) cost[i] = OPEN_DOOR_COST;
  }
  return { width, height, cost, doorway };
}

/** Picks a deterministic reachable multi-room (or roomless fallback) waypoint loop excluding stairs. */
export function buildPatrolWaypoints(
  layout: FloorLayout,
  occ: OccupancyTracker,
  excludedRooms: ReadonlySet<number>,
  paths: PathGrid,
  rng: Rng,
  routeDist?: Grid,
): Pos[] {
  const stairsKeys = new Set(occ.stairs.map((s) => tileKey(s, occ.width)));
  const safeRoomTile = (room: Rect): Pos | undefined => {
    const c = roomCenter(room);
    const valid = rectTiles(room).filter(
      (t) =>
        layout.terrain.get(t.x, t.y) === Terrain.Floor &&
        !stairsKeys.has(tileKey(t, occ.width)) &&
        !occ.takenFeatures.has(tileKey(t, occ.width)),
    );
    if (valid.length === 0) return undefined;
    valid.sort((a, b) => {
      const aClear = occ.stairs.every((s) => chebyshev(s, a) >= 2) ? 0 : 1;
      const bClear = occ.stairs.every((s) => chebyshev(s, b) >= 2) ? 0 : 1;
      if (aClear !== bClear) return aClear - bClear;
      return chebyshev(a, c) - chebyshev(b, c) || a.y - b.y || a.x - b.x;
    });
    return valid[0];
  };

  const nonExcluded = layout.rooms
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !excludedRooms.has(i))
    .map(({ r }) => safeRoomTile(r))
    .filter((p): p is Pos => p !== undefined);

  const pool =
    nonExcluded.length >= 2
      ? nonExcluded
      : layout.rooms.map(safeRoomTile).filter((p): p is Pos => p !== undefined);

  let chosen: Pos[];
  if (pool.length >= 2) {
    if (routeDist !== undefined) {
      const byRoute = [...pool].sort((a, b) => routeDist.get(a.x, a.y) - routeDist.get(b.x, b.y));
      const nearPool = byRoute.slice(0, Math.max(1, Math.ceil(byRoute.length / 2)));
      const nearPick = rng.shuffle([...nearPool]).slice(0, Math.min(2, nearPool.length));
      const nearKeys = new Set(nearPick.map((p) => tileKey(p, occ.width)));
      const restPick = rng.shuffle(pool.filter((p) => !nearKeys.has(tileKey(p, occ.width))));
      chosen = [...nearPick, ...restPick].slice(0, Math.min(4, pool.length));
    } else {
      const shuffled = rng.shuffle([...pool]);
      chosen = shuffled.slice(0, Math.min(4, shuffled.length));
    }
  } else {
    // Fallback for roomless or 1-room custom layouts: pick distant reachable floor tiles excluding stairs.
    const allFloor: Pos[] = [];
    for (let y = 0; y < layout.terrain.height; y++) {
      for (let x = 0; x < layout.terrain.width; x++) {
        if (layout.terrain.get(x, y) !== Terrain.Floor) continue;
        const p = { x, y };
        if (!stairsKeys.has(tileKey(p, occ.width)) && !occ.takenFeatures.has(tileKey(p, occ.width))) allFloor.push(p);
      }
    }
    if (allFloor.length < 2) return [];
    const first =
      routeDist === undefined
        ? rng.pick(allFloor)
        : rng.pick(
            [...allFloor]
              .sort((a, b) => routeDist.get(a.x, a.y) - routeDist.get(b.x, b.y))
              .slice(0, Math.max(1, Math.ceil(allFloor.length / 2))),
          );
    const reachFromFirst = buildGoalMap(paths, [first]);
    const reachable = allFloor.filter((p) => reachFromFirst.get(p.x, p.y) !== UNREACHABLE);
    if (reachable.length < 2) return [];
    const farthest = [...reachable].sort((a, b) => chebyshev(b, first) - chebyshev(a, first))[0] as Pos;
    if (chebyshev(first, farthest) < 2) return [];
    chosen = [first, farthest];
  }

  // Order waypoints smoothly around their centroid to form a clean loop.
  const cx = chosen.reduce((s, p) => s + p.x, 0) / chosen.length;
  const cy = chosen.reduce((s, p) => s + p.y, 0) / chosen.length;
  chosen.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  // Verify reachability from chosen[0].
  const reachMap = buildGoalMap(paths, [chosen[0] as Pos]);
  return chosen.filter((p) => reachMap.get(p.x, p.y) !== UNREACHABLE);
}

/** Deterministic patrol count for `danger` scaled by `patrolMul`. */
export function patrolCountFor(danger: number, patrolMul: number, rng: Rng): number {
  if (patrolMul <= 0) return 0;
  const base = danger < 5 ? 1 : rng.int(1, 2);
  if (patrolMul === 1) return base;
  const scaled = base * patrolMul;
  const whole = Math.floor(scaled);
  const frac = scaled - whole;
  return frac > 0 && rng.chance(frac) ? whole + 1 : whole;
}

/** Places corridor patrols (or non-arrival room fallbacks) on deterministic multi-room waypoint loops. */
export function populatePatrols(
  draft: FloorDraft,
  occ: OccupancyTracker,
  arrivalRoomIndex: number,
  baseDanger: number,
  basePool: readonly MonsterDef[],
  ecology: DungeonEcology | undefined,
  patrolMul: number,
  templateFallback: number,
  nextGroupIdStart: number,
  rng: Rng,
): void {
  const count = patrolCountFor(baseDanger, patrolMul, rng);
  if (count === 0) return;

  const paths = buildDraftPathGrid(draft);
  const corridorTiles: Pos[] = [];
  const roomFallbackTiles: Pos[] = [];

  for (let y = 0; y < draft.terrain.height; y++) {
    for (let x = 0; x < draft.terrain.width; x++) {
      if (draft.terrain.get(x, y) !== Terrain.Floor) continue;
      const p = { x, y };
      const k = tileKey(p, occ.width);
      if (occ.takenFeatures.has(k) || occ.stairs.some((s) => chebyshev(s, p) < occ.stairsDistance)) continue;
      const roomIdx = draft.rooms.findIndex((r) => inRoom(p, r));
      if (roomIdx === -1) corridorTiles.push(p);
      else if (roomIdx !== arrivalRoomIndex) roomFallbackTiles.push(p);
    }
  }

  let nextGroupId = nextGroupIdStart;
  const patrolRoles: readonly MonsterRole[] = baseDanger < 5 ? ['skirmisher', 'brute'] : ['skirmisher'];
  const spawnedStarts: Pos[] = [];

  const excludedRooms = arrivalRoomIndex === -1 ? new Set<number>() : new Set<number>([arrivalRoomIndex]);
  for (let pIdx = 0; pIdx < count; pIdx++) {
    const waypoints = buildPatrolWaypoints(draft, occ, excludedRooms, paths, rng);
    if (waypoints.length < 2) continue;

    const squadSize = baseDanger < 5 ? 1 : rng.int(2, 3);
    const groupId = nextGroupId++;
    const reach = buildGoalMap(paths, [waypoints[0] as Pos]);

    const candidatePool = (corridorTiles.length > 0 ? corridorTiles : roomFallbackTiles).filter(
      (t) => reach.get(t.x, t.y) !== UNREACHABLE,
    );
    if (candidatePool.length === 0) continue;

    // Pick a patrol start away from earlier patrol spawns when possible.
    const freeCandidates = candidatePool.filter((t) => !occ.tiles.has(tileKey(t, occ.width)));
    const startPool = freeCandidates.length > 0 ? freeCandidates : candidatePool;
    const sortedStarts =
      spawnedStarts.length === 0
        ? startPool
        : [...startPool].sort((a, b) => {
            const minA = Math.min(...spawnedStarts.map((s) => chebyshev(s, a)));
            const minB = Math.min(...spawnedStarts.map((s) => chebyshev(s, b)));
            return minB - minA;
          });
    const anchor = spawnedStarts.length === 0 ? rng.pick(sortedStarts) : rng.pick(sortedStarts.slice(0, Math.min(8, sortedStarts.length)));
    spawnedStarts.push(anchor);

    const nearbyTiles = [...candidatePool].sort((a, b) => chebyshev(a, anchor) - chebyshev(b, anchor));
    const patrol: MonsterPatrol = {
      waypoints: waypoints.map((w) => ({ x: w.x, y: w.y })),
      next: 0,
    };

    for (let m = 0; m < squadSize; m++) {
      const oodRoll = rollOodDanger(draft.dungeon, baseDanger, rng, draft.risk);
      const spawnDanger = oodRoll.danger;
      const activePool = poolForOodRoll(baseDanger, basePool, oodRoll, ecology);
      const def = pickMonsterForSlot(patrolRoles, activePool, spawnDanger, rng, ecology);
      if (def === undefined) break;

      const pos = pickClusteredTile(draft.terrain, occ, def, nearbyTiles, m === 0 ? undefined : anchor, rng);
      if (pos === undefined) break;

      const tChance = templateChanceFor(draft.dungeon, baseDanger, templateFallback, draft.risk);
      const templates = rollTemplates(def, rng, tChance);
      const overlay = templates.length === 0 ? undefined : { templates };
      const ood = oodRoll.ood && def.danger.min > baseDanger ? (true as const) : undefined;
      draft.spawns.push(
        newMonster(def, pos, overlay, {
          ...(ood === true ? { ood } : {}),
          groupId,
          patrol: { waypoints: patrol.waypoints.map((w) => ({ x: w.x, y: w.y })), next: patrol.next },
        }),
      );
      recordPlacement(occ, def, pos);
    }
  }
}
