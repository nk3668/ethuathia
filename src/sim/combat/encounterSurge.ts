/**
 * Return-trip deep surge wave planning, room detection, and ascent-biased placement (ETH-136, ETH-157).
 */
import { clampRange, Grid, Rng, seedState } from '../../core';
import type { Pos } from '../../core';
import { MONSTERS } from '../../content';
import type { DungeonDef, DungeonEcology, MonsterDef, MonsterRole, SquadSlot, SurgeProfile } from '../../content';
import { isStanding, sharesTile } from '../entities';
import { dungeonDepth, floorDanger, runDungeon, stairsOn } from '../floors/dungeon';
import { rectTiles } from '../gen/types';
import type { Rect } from '../gen/types';
import { buildGoalMap, pathAlong, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { Terrain } from '../state';
import { surgeEffect } from '../stats/omenEffects';
import type { FloorId, RunState } from '../state';
import { buildPatrolWaypoints } from './encounterPatrols';
import {
  chebyshev,
  inRoom,
  pickBlueprint,
  pickClusteredTile,
  pickMonsterForSlot,
  recordPlacement,
  sharedTagsAcrossRequiredSlots,
  tileKey,
} from './encounterShared';
import type { FloorLayout, OccupancyTracker } from './encounterShared';
import { floorOpenPathGrid } from './groupAi';
import type { MonsterPatrol } from './groupAi';
import {
  DEFAULT_RESPAWN_STAIRS_DISTANCE,
  monstersForDanger,
  pickWeightedForDanger,
  spawnMonster,
  templateChanceFor,
} from './monsters';
import type { RespawnOptions } from './monsters';
import { rollTemplates } from './overlay';
import { monsterRiskOverlay } from './risk';

/** Fallback return-trip surge profile when `dungeon.encounters.surge` is omitted (ETH-136). */
export const DEFAULT_SURGE_PROFILE: SurgeProfile = {
  dangerWindow: 2,
  templateBonus: 0.15,
  countMul: 1,
};

/** Detects rectangular rooms (`w >= 3, h >= 3`) on a built floor's terrain grid. */
export function detectFloorRooms(terrain: Grid): Rect[] {
  const { width, height } = terrain;
  if (width < 3 || height < 3) return [];
  const core = new Grid(width, height, 'u8');
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let allFloor = true;
      for (let dy = -1; dy <= 1 && allFloor; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (terrain.get(x + dx, y + dy) !== Terrain.Floor) {
            allFloor = false;
            break;
          }
        }
      }
      if (allFloor) core.set(x, y, 1);
    }
  }

  const seen = new Grid(width, height, 'u8');
  const rooms: Rect[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (core.get(x, y) !== 1 || seen.get(x, y) === 1) continue;
      seen.set(x, y, 1);
      const queue: Pos[] = [{ x, y }];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      for (const p of queue) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        for (const [nx, ny] of [
          [p.x + 1, p.y],
          [p.x - 1, p.y],
          [p.x, p.y + 1],
          [p.x, p.y - 1],
        ] as const) {
          if (core.inBounds(nx, ny) && core.get(nx, ny) === 1 && seen.get(nx, ny) === 0) {
            seen.set(nx, ny, 1);
            queue.push({ x: nx, y: ny });
          }
        }
      }
      const bbox: Rect = { x: minX - 1, y: minY - 1, w: maxX - minX + 3, h: maxY - minY + 3 };
      const allOpen = rectTiles(bbox).every((t) => terrain.inBounds(t.x, t.y) && terrain.get(t.x, t.y) === Terrain.Floor);
      rooms.push(allOpen ? bbox : { x: x - 1, y: y - 1, w: 3, h: 3 });
    }
  }
  return rooms;
}

function pickSurgeDangerAndPool(
  dangerMin: number,
  dangerMax: number,
  localDanger: number,
  bottomDanger: number,
  ecology: DungeonEcology | undefined,
  rng: Rng,
): { danger: number; pool: MonsterDef[] } | null {
  const span = Math.max(0, dangerMax - dangerMin);
  const steps = Math.max(0, Math.round(span));
  const at = (idx: number) => (steps === 0 ? dangerMax : dangerMin + (span * idx) / steps);
  const chosenIdx = steps === 0 ? 0 : rng.int(0, steps);

  const candidates: number[] = [at(chosenIdx)];
  for (let offset = 1; offset <= steps; offset++) {
    if (chosenIdx + offset <= steps) candidates.push(at(chosenIdx + offset));
    if (chosenIdx - offset >= 0) candidates.push(at(chosenIdx - offset));
  }
  candidates.push(localDanger);
  for (let d = Math.floor(bottomDanger); d >= 1; d--) candidates.push(d);

  for (const d of candidates) {
    const pool = monstersForDanger(d, ecology);
    if (pool.length > 0) return { danger: d, pool };
  }
  return null;
}

function surgeTemplateChance(
  dungeon: DungeonDef,
  spawnDanger: number,
  templateBonus: number,
  overrideChance: number | undefined,
  hasDepthShiftOverride: boolean,
): number {
  if (hasDepthShiftOverride && overrideChance !== undefined) {
    return Math.max(0, Math.min(1, overrideChance));
  }
  const base = templateChanceFor(dungeon, spawnDanger, overrideChance ?? 0);
  const effectiveBase = overrideChance !== undefined ? Math.max(overrideChance, base) : base;
  return Math.max(0, Math.min(1, effectiveBase + templateBonus));
}

function minRouteDistance(tiles: readonly Pos[], routeDist: Grid | undefined): number {
  if (routeDist === undefined) return 0;
  let best = UNREACHABLE;
  for (const t of tiles) {
    const d = routeDist.get(t.x, t.y);
    if (d < best) best = d;
  }
  return best;
}

interface SurgeWavePlan {
  dangerMin: number;
  dangerMax: number;
  targetCount: number;
  templateBonus: number;
  hasDepthShift: boolean;
}

interface SurgeFloorContext {
  terrain: Grid;
  width: number;
  rooms: Rect[];
  occ: OccupancyTracker;
  stairsRoomIndices: Set<number>;
  paths: PathGrid;
  routeDist: Grid | undefined;
  corridorTiles: Pos[];
  nonStairsRoomTiles: Pos[];
  allSafeTiles: Pos[];
  orderedRooms: Rect[];
  nextGroupId: number;
}

function resolveSurgeWavePlan(
  state: RunState,
  dungeon: DungeonDef,
  depth: number,
  localDanger: number,
  bottomDanger: number,
  options: RespawnOptions,
  rng: Rng,
): SurgeWavePlan | null {
  const allDefs = MONSTERS.all();
  if (allDefs.length === 0) return null;

  const surge = dungeon.encounters?.surge ?? DEFAULT_SURGE_PROFILE;
  const boost = surgeEffect(state);
  const hasDepthShift = options.depthShift !== undefined;

  let dangerMin: number;
  let dangerMax: number;
  let defaults: { min: number; max: number };

  if (hasDepthShift) {
    const maxDefDanger = allDefs.reduce((m, d) => Math.max(m, d.danger.max), Math.max(localDanger, bottomDanger));
    const shifted = Math.max(1, Math.min(maxDefDanger, localDanger + (options.depthShift as number)));
    dangerMin = shifted;
    dangerMax = shifted;
    const dMin = Math.max(1, Math.round((1 + 0.4 * depth) * 0.4));
    const dMax = Math.max(dMin, Math.round((1 + 0.4 * depth) * 0.7));
    defaults = { min: dMin, max: dMax };
  } else {
    dangerMin = Math.max(1, bottomDanger - surge.dangerWindow);
    dangerMax = Math.max(dangerMin, bottomDanger);
    const baseMin = bottomDanger <= 2 ? 1 : 2;
    const baseMax = bottomDanger <= 2 ? 2 : bottomDanger <= 6 ? 3 : 4;
    const mul = Math.max(0, surge.countMul) * (boost?.countMul ?? 1);
    defaults =
      mul === 0
        ? { min: 0, max: 0 }
        : {
            min: Math.max(1, Math.round(baseMin * mul)),
            max: Math.max(Math.max(1, Math.round(baseMin * mul)), Math.round(baseMax * mul)),
          };
  }

  const { min, max } = clampRange(options, defaults);
  if (max <= 0) return null;
  const targetCount = rng.int(min, max);
  if (targetCount <= 0) return null;

  return { dangerMin, dangerMax, targetCount, templateBonus: surge.templateBonus + (boost?.templateBonus ?? 0), hasDepthShift };
}

function buildSurgeFloorContext(
  state: RunState,
  floorId: FloorId,
  arrivalPos: Pos,
  options: RespawnOptions,
  rng: Rng,
): SurgeFloorContext | null {
  const floor = state.floors[floorId];
  if (floor === undefined) throw new Error(`Unknown floor "${floorId}"`);
  const terrain = Grid.wrap(floor.terrain);
  const width = terrain.width;
  const rooms = detectFloorRooms(terrain);

  const stairs: Pos[] = [];
  const takenFeatures = new Set<number>();
  const occTiles = new Map<number, { count: number; allShare: boolean }>();
  let maxGroupId = 0;

  for (const id of floor.entities) {
    const e = state.entities[id];
    if (e === undefined) continue;
    if (e.feature !== undefined) {
      takenFeatures.add(tileKey(e.pos, width));
      if (e.feature.kind === 'stairs') stairs.push(e.pos);
    }
    if (e.monster?.groupId !== undefined && e.monster.groupId > maxGroupId) {
      maxGroupId = e.monster.groupId;
    }
    if (!isStanding(e)) continue;
    const k = tileKey(e.pos, width);
    const canShare = sharesTile(e);
    const existing = occTiles.get(k);
    if (existing === undefined) occTiles.set(k, { count: 1, allShare: canShare });
    else {
      existing.count += 1;
      existing.allShare = existing.allShare && canShare;
    }
  }

  const avoid: Pos[] = [arrivalPos, ...stairs];
  for (const id of state.party) {
    const member = state.entities[id];
    if (member?.actor !== undefined && member.actor.hp > 0 && member.floor === floorId) avoid.push(member.pos);
  }

  const stairsDistance = Math.max(0, options.stairsDistance ?? DEFAULT_RESPAWN_STAIRS_DISTANCE);
  const occ: OccupancyTracker = { width, takenFeatures, stairs, avoid, stairsDistance, tiles: occTiles };

  const stairsRoomIndices = new Set<number>();
  rooms.forEach((room, idx) => {
    if (avoid.some((a) => inRoom(a, room))) stairsRoomIndices.add(idx);
  });

  const paths = floorOpenPathGrid(state, floorId);
  const exitStairs = stairsOn(state, floorId, 'up')?.pos;
  let routeDist: Grid | undefined;
  if (exitStairs !== undefined) {
    const toExit = buildGoalMap(paths, [exitStairs]);
    const routeTiles =
      toExit.get(arrivalPos.x, arrivalPos.y) === UNREACHABLE
        ? [arrivalPos]
        : [arrivalPos, ...pathAlong(paths, toExit, arrivalPos)];
    routeDist = buildGoalMap(paths, routeTiles);
  }

  const corridorTiles: Pos[] = [];
  const nonStairsRoomTiles: Pos[] = [];
  const allSafeTiles: Pos[] = [];

  for (let y = 0; y < terrain.height; y++) {
    for (let x = 0; x < terrain.width; x++) {
      if (terrain.get(x, y) !== Terrain.Floor) continue;
      const p = { x, y };
      if (takenFeatures.has(tileKey(p, width)) || avoid.some((a) => chebyshev(a, p) < stairsDistance)) continue;
      const roomIdx = rooms.findIndex((r) => inRoom(p, r));
      if (roomIdx === -1) {
        corridorTiles.push(p);
        allSafeTiles.push(p);
      } else if (!stairsRoomIndices.has(roomIdx)) {
        nonStairsRoomTiles.push(p);
        allSafeTiles.push(p);
      }
    }
  }

  if (allSafeTiles.length === 0) {
    // Allow safe non-stairs tiles inside large single-room hand-built test maps when no outside tiles exist.
    for (let y = 0; y < terrain.height; y++) {
      for (let x = 0; x < terrain.width; x++) {
        if (terrain.get(x, y) !== Terrain.Floor) continue;
        const p = { x, y };
        if (takenFeatures.has(tileKey(p, width)) || avoid.some((a) => chebyshev(a, p) < stairsDistance)) continue;
        allSafeTiles.push(p);
      }
    }
  }
  if (allSafeTiles.length === 0) return null;

  const eligibleRoomIndices = rooms
    .map((room, idx) => ({
      idx,
      tiles: rectTiles(room).filter(
        (t) =>
          terrain.get(t.x, t.y) === Terrain.Floor &&
          !takenFeatures.has(tileKey(t, width)) &&
          avoid.every((a) => chebyshev(a, t) >= stairsDistance),
      ),
    }))
    .filter(({ idx, tiles }) => !stairsRoomIndices.has(idx) && tiles.length > 0);

  // Bias room squad order toward the arrival -> stairsUp ascent route.
  eligibleRoomIndices.sort((a, b) => minRouteDistance(a.tiles, routeDist) - minRouteDistance(b.tiles, routeDist) || a.idx - b.idx);
  const split = Math.max(1, Math.ceil(eligibleRoomIndices.length / 2));
  const orderedRooms = [
    ...rng.shuffle(eligibleRoomIndices.slice(0, split)),
    ...rng.shuffle(eligibleRoomIndices.slice(split)),
  ].map(({ idx }) => rooms[idx] as Rect);

  return {
    terrain,
    width,
    rooms,
    occ,
    stairsRoomIndices,
    paths,
    routeDist,
    corridorTiles,
    nonStairsRoomTiles,
    allSafeTiles,
    orderedRooms,
    nextGroupId: maxGroupId + 1,
  };
}

/**
 * Spawns a deterministic post-contract return-trip deep surge on `floorId` (ETH-136):
 * - Anchors Danger to `[max(1, bottomDanger - surge.dangerWindow), bottomDanger]` unless an
 *   explicit `options.depthShift` override is passed.
 * - Raises template probability by `+surge.templateBonus` over `templateChanceFor(dungeon, danger)`.
 * - Scales wave size by `surge.countMul` (honoring `options.min` / `options.max` overrides).
 * - Biases cohesive room squads (`groupId`, `homeRoom`) and hunter patrols (`groupId`, `patrol`)
 *   toward the `arrivalPos -> stairsUp` ascent route while strictly honoring `stairsDistance`
 *   from arrival stairs, exit stairs, and living party members, and excluding stairs rooms.
 */
export function surgeFloor(
  state: RunState,
  floorId: FloorId,
  arrivalPos: Pos,
  wave: number,
  options: RespawnOptions = {},
): number {
  const floor = state.floors[floorId];
  if (floor === undefined) throw new Error(`Unknown floor "${floorId}"`);
  const dungeon = runDungeon(state);
  const ecology = dungeon.ecology;
  const localDanger = floorDanger(state, floor.depth);
  const bottomDanger = floorDanger(state, dungeonDepth(state));
  const rng = new Rng(seedState(state.seed, `respawn/${floorId}/${wave}`));

  const plan = resolveSurgeWavePlan(state, dungeon, floor.depth, localDanger, bottomDanger, options, rng);
  if (plan === null) return 0;

  const ctx = buildSurgeFloorContext(state, floorId, arrivalPos, options, rng);
  if (ctx === null) return 0;

  const { dangerMin, dangerMax, targetCount, templateBonus, hasDepthShift } = plan;
  const layout: FloorLayout = { terrain: ctx.terrain, rooms: ctx.rooms };
  const probeWaypoints = buildPatrolWaypoints(layout, ctx.occ, ctx.stairsRoomIndices, ctx.paths, rng, ctx.routeDist);
  const canPatrol = probeWaypoints.length >= 2;

  let patrolTarget = 0;
  let squadTarget = targetCount;
  if (!(hasDepthShift && targetCount === 1)) {
    if (ctx.orderedRooms.length === 0) {
      patrolTarget = canPatrol ? targetCount : 0;
      squadTarget = canPatrol ? 0 : targetCount;
    } else if (targetCount === 1) {
      patrolTarget = canPatrol && rng.chance(0.5) ? 1 : 0;
      squadTarget = 1 - patrolTarget;
    } else if (canPatrol) {
      patrolTarget = targetCount >= 8 ? Math.min(4, Math.floor(targetCount / 3)) : targetCount >= 4 ? rng.int(1, 2) : 1;
      squadTarget = targetCount - patrolTarget;
    }
  }

  // Deep Surge (ETH-186) sends more hunting patrols.
  const extraPatrols = surgeEffect(state)?.patrols ?? 0;
  let minPatrolGroups = 0;
  if (extraPatrols > 0 && canPatrol && !(hasDepthShift && targetCount === 1)) {
    const baseGroups = patrolTarget > 0 ? 1 : 0;
    minPatrolGroups = Math.min(targetCount, baseGroups + extraPatrols);
    patrolTarget = Math.min(targetCount, Math.max(patrolTarget + extraPatrols * 2, minPatrolGroups));
    squadTarget = targetCount - patrolTarget;
  }

  let nextGroupId = ctx.nextGroupId;
  let placed = 0;

  const placeMonster = (
    def: MonsterDef,
    pos: Pos,
    spawnDanger: number,
    monsterOptions: { groupId: number; homeRoom?: Rect; patrol?: MonsterPatrol },
  ): void => {
    const tChance = surgeTemplateChance(dungeon, spawnDanger, templateBonus, options.templateChance, hasDepthShift);
    const templates = rollTemplates(def, rng, tChance);
    const overlay = monsterRiskOverlay(state, def, templates.length === 0 ? undefined : { templates }, rng, floor.depth, 'surge');
    spawnMonster(state, def.id, floorId, pos, overlay, monsterOptions);
    recordPlacement(ctx.occ, def, pos);
    placed++;
  };

  // 1. Place cohesive room squads in route-biased non-stairs rooms.
  let squadLeft = squadTarget;
  let roomCursor = 0;
  while (squadLeft > 0 && ctx.orderedRooms.length > 0 && roomCursor < ctx.orderedRooms.length * 2) {
    const room = ctx.orderedRooms[roomCursor % ctx.orderedRooms.length] as Rect;
    roomCursor++;
    const roomTiles = rectTiles(room);
    const groupPick = pickSurgeDangerAndPool(dangerMin, dangerMax, localDanger, bottomDanger, ecology, rng);
    if (groupPick === null) break;

    const groupId = nextGroupId++;
    const homeRoom: Rect = { x: room.x, y: room.y, w: room.w, h: room.h };
    const wantCount = squadLeft <= 3 ? squadLeft : rng.int(2, Math.min(4, squadLeft));
    const bp = pickBlueprint(groupPick.danger, groupPick.pool, wantCount >= 2 ? 10 : 1, rng);

    let preferTags: string[] | undefined = bp.preferSameTag === true ? sharedTagsAcrossRequiredSlots(bp, groupPick.pool) : undefined;
    let anchorPos: Pos | undefined;
    let squadPlaced = 0;

    for (let sIdx = 0; sIdx < bp.slots.length && squadPlaced < wantCount; sIdx++) {
      const slot = bp.slots[sIdx] as SquadSlot;
      const reserve = bp.slots.slice(sIdx + 1).reduce((sum, s) => sum + s.min, 0);
      const slotMax = Math.max(slot.min, wantCount - squadPlaced - reserve);
      const slotTarget = Math.min(slotMax, Math.max(1, rng.int(slot.min, slot.max)));
      for (let k = 0; k < slotTarget && squadPlaced < wantCount; k++) {
        const picked =
          squadPlaced === 0
            ? groupPick
            : (pickSurgeDangerAndPool(dangerMin, dangerMax, localDanger, bottomDanger, ecology, rng) ?? groupPick);
        const def = pickMonsterForSlot(slot.roles, picked.pool, picked.danger, rng, ecology, preferTags);
        if (def === undefined) continue;
        const pos = pickClusteredTile(ctx.terrain, ctx.occ, def, roomTiles, anchorPos, rng);
        if (pos === undefined) break;
        if (anchorPos === undefined) anchorPos = pos;
        if (bp.preferSameTag === true && (preferTags === undefined || preferTags.length === 0)) {
          preferTags = [...def.tags];
        }
        placeMonster(def, pos, picked.danger, { groupId, homeRoom: { ...homeRoom } });
        squadPlaced++;
        squadLeft--;
      }
    }
  }

  // 2. Place hunter patrol(s) biased toward the ascent route corridors.
  let patrolLeft = patrolTarget;
  const spawnedPatrolStarts: Pos[] = [];
  const basePatrolPool =
    ctx.corridorTiles.length > 0 ? ctx.corridorTiles : ctx.nonStairsRoomTiles.length > 0 ? ctx.nonStairsRoomTiles : ctx.allSafeTiles;

  while (patrolLeft > 0) {
    const waypoints =
      spawnedPatrolStarts.length === 0
        ? probeWaypoints
        : buildPatrolWaypoints(layout, ctx.occ, ctx.stairsRoomIndices, ctx.paths, rng, ctx.routeDist);
    if (waypoints.length < 2) break;

    const groupsLeft = Math.max(1, minPatrolGroups - spawnedPatrolStarts.length);
    const maxForThis = Math.max(1, patrolLeft - (groupsLeft - 1));
    const patrolSize =
      minPatrolGroups === 0 || groupsLeft <= 1
        ? patrolLeft >= 4
          ? rng.int(2, 3)
          : patrolLeft
        : Math.min(maxForThis, maxForThis >= 3 ? rng.int(2, 3) : maxForThis);
    const reach = buildGoalMap(ctx.paths, [waypoints[0] as Pos]);
    const reachablePool = basePatrolPool.filter((t) => reach.get(t.x, t.y) !== UNREACHABLE);
    if (reachablePool.length === 0) break;

    const freeStarts = reachablePool.filter((t) => !ctx.occ.tiles.has(tileKey(t, ctx.width)));
    const startPool = freeStarts.length > 0 ? freeStarts : reachablePool;
    const routeSorted =
      ctx.routeDist === undefined
        ? startPool
        : [...startPool].sort((a, b) => (ctx.routeDist as Grid).get(a.x, a.y) - (ctx.routeDist as Grid).get(b.x, b.y));
    const anchorCandidates =
      spawnedPatrolStarts.length === 0
        ? routeSorted.slice(0, Math.max(1, Math.ceil(routeSorted.length / 2)))
        : [...startPool].sort((a, b) => {
            const minA = Math.min(...spawnedPatrolStarts.map((s) => chebyshev(s, a)));
            const minB = Math.min(...spawnedPatrolStarts.map((s) => chebyshev(s, b)));
            return minB - minA;
          });
    const anchor =
      spawnedPatrolStarts.length === 0
        ? rng.pick(anchorCandidates)
        : rng.pick(anchorCandidates.slice(0, Math.min(8, anchorCandidates.length)));
    spawnedPatrolStarts.push(anchor);

    const nearbyTiles = [...reachablePool].sort((a, b) => chebyshev(a, anchor) - chebyshev(b, anchor));
    const groupId = nextGroupId++;
    const patrol: MonsterPatrol = { waypoints: waypoints.map((w) => ({ x: w.x, y: w.y })), next: 0 };

    let placedInPatrol = 0;
    for (let m = 0; m < patrolSize; m++) {
      const picked = pickSurgeDangerAndPool(dangerMin, dangerMax, localDanger, bottomDanger, ecology, rng);
      if (picked === null) break;
      const patrolRoles: readonly MonsterRole[] = picked.danger < 5 ? ['skirmisher', 'brute'] : ['skirmisher'];
      const def = pickMonsterForSlot(patrolRoles, picked.pool, picked.danger, rng, ecology);
      if (def === undefined) break;
      const pos = pickClusteredTile(ctx.terrain, ctx.occ, def, nearbyTiles, m === 0 ? undefined : anchor, rng);
      if (pos === undefined) break;
      placeMonster(def, pos, picked.danger, {
        groupId,
        patrol: { waypoints: patrol.waypoints.map((w) => ({ x: w.x, y: w.y })), next: 0 },
      });
      placedInPatrol++;
      patrolLeft--;
    }
    if (placedInPatrol === 0) break;
  }

  // 3. Fallback if roomless/tiny layouts still have remaining count to place on safe tiles.
  if (placed < targetCount) {
    const sortedFallback =
      ctx.routeDist === undefined
        ? rng.shuffle([...ctx.allSafeTiles])
        : [...ctx.allSafeTiles].sort((a, b) => (ctx.routeDist as Grid).get(a.x, a.y) - (ctx.routeDist as Grid).get(b.x, b.y));
    const fallbackGroupId = nextGroupId;
    let anchor: Pos | undefined;
    while (placed < targetCount) {
      const picked = pickSurgeDangerAndPool(dangerMin, dangerMax, localDanger, bottomDanger, ecology, rng);
      if (picked === null) break;
      const def = pickWeightedForDanger(picked.pool, picked.danger, rng, ecology);
      const pos = pickClusteredTile(ctx.terrain, ctx.occ, def, sortedFallback, anchor, rng);
      if (pos === undefined) break;
      if (anchor === undefined) anchor = pos;
      placeMonster(def, pos, picked.danger, { groupId: fallbackGroupId });
    }
  }

  return placed;
}
