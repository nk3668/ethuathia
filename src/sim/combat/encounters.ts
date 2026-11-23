/**
 * Danger-scaled, threat-budget room encounters and deterministic corridor patrols (ETH-135).
 *
 * - Room encounters pick role/tag `SquadBlueprint`s eligible at the floor's Danger, allocate a
 *   Danger-scaled threat budget across non-arrival rooms, deduct each monster's threat (scaled by
 *   template `threatMul`), assign a shared `groupId` and `homeRoom`, and cluster packmates.
 * - Patrol encounters place deterministic solo scouts (Danger 1–4) or 2–3 monster hunting squads
 *   (Danger 5+) in corridors/non-arrival areas on multi-room waypoint loops excluding stairs tiles.
 */
import { clampRange, Grid, Rng, seedState } from '../../core';
import type { Pos } from '../../core';
import { MONSTERS, SQUAD_BLUEPRINTS, templateDefs } from '../../content';
import type { DungeonDef, DungeonEcology, MonsterDef, MonsterRole, SquadBlueprint, SquadSlot, SurgeProfile } from '../../content';
import { isStanding, sharesTile } from '../entities';
import { dungeonDepth, floorDanger, runDungeon, stairsOn } from '../floors/dungeon';
import { rectTiles } from '../gen/types';
import type { FloorDraft, Rect } from '../gen/types';
import { buildGoalMap, OPEN_DOOR_COST, pathAlong, STEP_COST, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { Terrain } from '../state';
import type { FloorId, RunState } from '../state';
import {
  DEFAULT_RESPAWN_STAIRS_DISTANCE,
  monstersForDanger,
  monsterWeightAt,
  newMonster,
  pickWeightedForDanger,
  rollOodDanger,
  spawnMonster,
  templateChanceFor,
} from './monsters';
import type { RespawnOptions } from './monsters';
import { floorOpenPathGrid } from './groupAi';
import type { MonsterPatrol } from './groupAi';
import { rollTemplates } from './overlay';

/** Fallback return-trip surge profile when `dungeon.encounters.surge` is omitted (ETH-136). */
export const DEFAULT_SURGE_PROFILE: SurgeProfile = {
  dangerWindow: 2,
  templateBonus: 0.15,
  countMul: 1,
};

/** Parameters passed from `GEN_MONSTERS` into `populateEncounters`. */
export interface EncounterGenParams {
  base: number;
  perDepth: number;
  stairsDistance: number;
  templateChance: number;
}

/** Anchor points mapping floor Danger to baseline floor room threat budget (before `budgetMul`). */
const BUDGET_ANCHORS: readonly [number, number][] = [
  [1, 7],
  [2, 9],
  [3, 18],
  [4, 26],
  [5, 34],
  [6, 54],
  [7, 74],
  [8, 102],
  [9, 155],
  [10, 190],
];

/** Smooth, monotonic Danger-to-threat-budget curve scaled by optional `budgetMul` (default `1`). */
export function floorThreatBudget(danger: number, budgetMul = 1): number {
  if (danger <= 0 || budgetMul <= 0) return 0;
  let base: number;
  if (danger < 1) {
    base = 7 * danger;
  } else if (danger >= 10) {
    base = 190 + (danger - 10) * 35;
  } else {
    base = 190;
    for (let i = 0; i < BUDGET_ANCHORS.length - 1; i++) {
      const [d0, b0] = BUDGET_ANCHORS[i] as [number, number];
      const [d1, b1] = BUDGET_ANCHORS[i + 1] as [number, number];
      if (danger <= d1) {
        const t = (danger - d0) / (d1 - d0);
        base = b0 + t * (b1 - b0);
        break;
      }
    }
  }
  return Math.max(0, Math.round(base * budgetMul));
}

function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function tileKey(pos: Pos, width: number): number {
  return pos.y * width + pos.x;
}

function inRoom(pos: Pos, room: Rect): boolean {
  return pos.x >= room.x && pos.x < room.x + room.w && pos.y >= room.y && pos.y < room.y + room.h;
}

function roomCenter(r: Rect): Pos {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function slotHasCandidate(roles: readonly MonsterRole[], pool: readonly MonsterDef[]): boolean {
  return pool.some((m) => roles.includes(m.role));
}

/**
 * Picks a monster from `pool` matching `roles` using Danger/ecology peak weighting, preferring
 * `preferTags` when given, and falling back gracefully to any monster in `pool` when a registry or
 * ecology lacks a requested role.
 */
export function pickMonsterForSlot(
  roles: readonly MonsterRole[],
  pool: readonly MonsterDef[],
  danger: number,
  rng: Rng,
  ecology?: DungeonEcology,
  preferTags?: readonly string[],
): MonsterDef | undefined {
  if (pool.length === 0) return undefined;
  const roleMatches = pool.filter((m) => roles.includes(m.role));
  const candidates = roleMatches.length > 0 ? roleMatches : pool;
  if (preferTags !== undefined && preferTags.length > 0) {
    const tagMatches = candidates.filter((m) => m.tags.some((t) => preferTags.includes(t)));
    if (tagMatches.length > 0) return pickWeightedForDanger(tagMatches, danger, rng, ecology);
  }
  return pickWeightedForDanger(candidates, danger, rng, ecology);
}

function minSlotThreat(roles: readonly MonsterRole[], pool: readonly MonsterDef[]): number {
  const roleMatches = pool.filter((m) => roles.includes(m.role));
  const list = roleMatches.length > 0 ? roleMatches : pool;
  let min = Infinity;
  for (const m of list) if (m.threat < min) min = m.threat;
  return Number.isFinite(min) ? min : 1;
}

function sharedTagsAcrossRequiredSlots(bp: SquadBlueprint, pool: readonly MonsterDef[]): string[] {
  const required = bp.slots.filter((s) => s.min > 0);
  if (required.length <= 1) return [];
  const perSlot: Set<string>[] = [];
  for (const slot of required) {
    const roleMatches = pool.filter((m) => slot.roles.includes(m.role));
    if (roleMatches.length === 0) return [];
    const slotTags = new Set<string>();
    for (const m of roleMatches) for (const t of m.tags) slotTags.add(t);
    perSlot.push(slotTags);
  }
  const [first, ...rest] = perSlot;
  if (first === undefined) return [];
  return [...first].filter((t) => rest.every((s) => s.has(t)));
}

function pickBlueprint(
  danger: number,
  pool: readonly MonsterDef[],
  roomBudget: number,
  rng: Rng,
): SquadBlueprint {
  const eligible = SQUAD_BLUEPRINTS.filter((bp) => bp.minDanger <= danger);
  const fullSupport = eligible.filter((bp) => bp.slots.every((s) => s.min === 0 || slotHasCandidate(s.roles, pool)));
  const partialSupport = eligible.filter((bp) => bp.slots.some((s) => slotHasCandidate(s.roles, pool)));
  const candidates = fullSupport.length > 0 ? fullSupport : partialSupport.length > 0 ? partialSupport : eligible;

  // Prefer multi-monster squads once room budgets grow, while keeping solo scouts for lean rooms.
  const multiOnly = candidates.filter((bp) => bp.slots.reduce((n, s) => n + s.min, 0) >= 2);
  const weightedPool =
    roomBudget >= 6 && multiOnly.length > 0
      ? multiOnly
      : roomBudget <= 1
        ? candidates.filter((bp) => bp.slots.reduce((n, s) => n + s.min, 0) === 1).length > 0
          ? candidates.filter((bp) => bp.slots.reduce((n, s) => n + s.min, 0) === 1)
          : candidates
        : candidates;

  const total = weightedPool.reduce((sum, bp) => sum + bp.weight, 0);
  let roll = rng.int(1, total);
  for (const bp of weightedPool) {
    roll -= bp.weight;
    if (roll <= 0) return bp;
  }
  return weightedPool[weightedPool.length - 1] as SquadBlueprint;
}

interface FloorLayout {
  terrain: Grid;
  rooms: readonly Rect[];
}

interface OccupancyTracker {
  width: number;
  takenFeatures: Set<number>;
  stairs: Pos[];
  avoid: Pos[];
  stairsDistance: number;
  tiles: Map<number, { count: number; allShare: boolean }>;
}

function canPlaceOnTile(terrain: Grid, occ: OccupancyTracker, def: MonsterDef, pos: Pos): boolean {
  if (!terrain.inBounds(pos.x, pos.y) || terrain.get(pos.x, pos.y) !== Terrain.Floor) return false;
  const k = tileKey(pos, occ.width);
  if (occ.takenFeatures.has(k)) return false;
  if (occ.avoid.some((a) => chebyshev(a, pos) < occ.stairsDistance)) return false;
  const existing = occ.tiles.get(k);
  if (existing === undefined) return true;
  return def.sharesTile === true && existing.allShare;
}

function recordPlacement(occ: OccupancyTracker, def: MonsterDef, pos: Pos): void {
  const k = tileKey(pos, occ.width);
  const existing = occ.tiles.get(k);
  const canShare = def.sharesTile === true;
  if (existing === undefined) {
    occ.tiles.set(k, { count: 1, allShare: canShare });
  } else {
    existing.count += 1;
    existing.allShare = existing.allShare && canShare;
  }
}

function pickClusteredTile(
  terrain: Grid,
  occ: OccupancyTracker,
  def: MonsterDef,
  candidates: readonly Pos[],
  anchor: Pos | undefined,
  rng: Rng,
): Pos | undefined {
  const valid = candidates.filter((p) => canPlaceOnTile(terrain, occ, def, p));
  if (valid.length === 0) return undefined;
  const empty = valid.filter((p) => !occ.tiles.has(tileKey(p, occ.width)));
  const pool = empty.length > 0 ? empty : valid;
  if (anchor === undefined) return rng.pick(pool);

  const ranked = pool
    .map((p) => ({ pos: p, dist: chebyshev(p, anchor) }))
    .sort((a, b) => a.dist - b.dist || a.pos.y - b.pos.y || a.pos.x - b.pos.x);
  const minDist = (ranked[0] as { dist: number }).dist;
  const near = ranked.filter((r) => r.dist <= minDist + 1);
  return rng.pick(near).pos;
}

function computeThreatCost(def: MonsterDef, templates: readonly string[]): number {
  const mul = templateDefs(templates).reduce((acc, t) => acc * t.threatMul, 1);
  return Math.max(1, Math.round(def.threat * mul));
}

function poolForOodRoll(
  baseDanger: number,
  basePool: readonly MonsterDef[],
  oodRoll: { danger: number; ood: boolean },
  ecology: DungeonEcology | undefined,
): readonly MonsterDef[] {
  if (!oodRoll.ood && oodRoll.danger === baseDanger) return basePool;
  const elevatedPool = monstersForDanger(oodRoll.danger, ecology);
  if (oodRoll.ood) {
    const strictlyDeeper = elevatedPool.filter((m) => m.danger.min > baseDanger);
    if (strictlyDeeper.length > 0) return strictlyDeeper;
  }
  return elevatedPool.length > 0 ? elevatedPool : basePool;
}

function pickSpawnWithBudget(
  draft: FloorDraft,
  baseDanger: number,
  basePool: readonly MonsterDef[],
  ecology: DungeonEcology | undefined,
  slot: SquadSlot,
  roomBudgetLeft: number,
  floorBudgetLeft: number,
  isFirstInRoom: boolean,
  preferTags: readonly string[] | undefined,
  templateFallback: number,
  rng: Rng,
): { def: MonsterDef; templates: string[]; cost: number; ood?: true } | null {
  const oodRoll = rollOodDanger(draft.dungeon, baseDanger, rng);
  const spawnDanger = oodRoll.danger;
  const activePool = poolForOodRoll(baseDanger, basePool, oodRoll, ecology);

  let def = pickMonsterForSlot(slot.roles, activePool, spawnDanger, rng, ecology, preferTags);
  if (def === undefined) return null;

  const tChance = templateChanceFor(draft.dungeon, baseDanger, templateFallback);
  let templates = rollTemplates(def, rng, tChance);
  let cost = computeThreatCost(def, templates);
  const oodTag = (d: MonsterDef): { ood?: true } => (oodRoll.ood && d.danger.min > baseDanger ? { ood: true as const } : {});

  const budgetLimit = isFirstInRoom ? Math.max(roomBudgetLeft, Math.min(floorBudgetLeft, def.threat)) : roomBudgetLeft;
  if (cost <= budgetLimit) return { def, templates, cost, ...oodTag(def) };

  // Try a cheaper eligible fit first while preserving rolled templates when templateChance >= 1.
  const cheaperRole = activePool.filter((m) => slot.roles.includes(m.role) && m.threat <= budgetLimit);
  const cheaperAny = cheaperRole.length > 0 ? cheaperRole : activePool.filter((m) => m.threat <= budgetLimit);
  if (cheaperAny.length > 0) {
    def = pickWeightedForDanger(cheaperAny, spawnDanger, rng, ecology);
    templates = rollTemplates(def, rng, tChance);
    cost = computeThreatCost(def, templates);
    if (cost <= budgetLimit) return { def, templates, cost, ...oodTag(def) };
    if (tChance < 1 && def.threat <= budgetLimit) return { def, templates: [], cost: Math.max(1, def.threat), ...oodTag(def) };
  }

  // When templates are optional (tChance < 1), an untemplated def may fit within budget.
  if (tChance < 1 && templates.length > 0 && def.threat <= budgetLimit) {
    return { def, templates: [], cost: Math.max(1, def.threat), ...oodTag(def) };
  }

  // Allow the first monster of a room if the floor still has at least half its cost in budget.
  if (isFirstInRoom && floorBudgetLeft >= Math.ceil(def.threat / 2)) {
    return tChance >= 1 ? { def, templates, cost, ...oodTag(def) } : { def, templates: [], cost: Math.max(1, def.threat), ...oodTag(def) };
  }
  return null;
}

function targetOccupiedRoomCount(danger: number, eligibleCount: number, budgetMul: number, rng: Rng): number {
  if (eligibleCount === 0 || budgetMul <= 0) return 0;
  let base: number;
  if (danger < 2.5) base = rng.int(4, 5);
  else if (danger < 5.5) base = rng.int(6, 8);
  else if (danger < 8.5) base = rng.int(8, 9);
  else base = rng.int(9, 10);

  if (budgetMul < 1) return Math.min(eligibleCount, Math.max(1, Math.round(base * budgetMul)));
  if (budgetMul > 1) return Math.min(eligibleCount, Math.round(base * Math.min(2, budgetMul)));
  return Math.min(eligibleCount, base);
}

function populateRoomSquad(
  draft: FloorDraft,
  occ: OccupancyTracker,
  room: Rect,
  groupId: number,
  bp: SquadBlueprint,
  baseDanger: number,
  basePool: readonly MonsterDef[],
  ecology: DungeonEcology | undefined,
  roomBudget: number,
  floorBudgetLeft: number,
  templateFallback: number,
  rng: Rng,
): number {
  const tiles = rectTiles(room);
  const homeRoom: Rect = { x: room.x, y: room.y, w: room.w, h: room.h };
  const counts = bp.slots.map((s) => rng.int(s.min, s.max));
  const minSlotCosts = bp.slots.map((s) => (s.min > 0 ? minSlotThreat(s.roles, basePool) * s.min : 0));

  let preferTags: string[] | undefined = bp.preferSameTag === true ? sharedTagsAcrossRequiredSlots(bp, basePool) : undefined;
  let anchorPos: Pos | undefined;
  let placed = 0;
  let spent = 0;

  for (let sIdx = 0; sIdx < bp.slots.length; sIdx++) {
    const slot = bp.slots[sIdx] as SquadSlot;
    const targetCount = counts[sIdx] as number;
    const reserve = minSlotCosts.slice(sIdx + 1).reduce((sum, c) => sum + c, 0);

    for (let k = 0; k < targetCount; k++) {
      const isFirst = placed === 0;
      const effectiveRoomLeft = Math.max(0, roomBudget - spent - reserve);
      const effectiveFloorLeft = Math.max(0, floorBudgetLeft - spent);
      const picked = pickSpawnWithBudget(
        draft,
        baseDanger,
        basePool,
        ecology,
        slot,
        effectiveRoomLeft,
        effectiveFloorLeft,
        isFirst,
        preferTags,
        templateFallback,
        rng,
      );
      if (picked === null) break;

      const pos = pickClusteredTile(draft.terrain, occ, picked.def, tiles, anchorPos, rng);
      if (pos === undefined) break;

      if (anchorPos === undefined) anchorPos = pos;
      if (bp.preferSameTag === true && (preferTags === undefined || preferTags.length === 0)) {
        preferTags = [...picked.def.tags];
      }

      const overlay = picked.templates.length === 0 ? undefined : { templates: picked.templates };
      draft.spawns.push(
        newMonster(picked.def, pos, overlay, {
          ...(picked.ood === true ? { ood: true as const } : {}),
          groupId,
          homeRoom: { x: homeRoom.x, y: homeRoom.y, w: homeRoom.w, h: homeRoom.h },
        }),
      );
      recordPlacement(occ, picked.def, pos);
      placed += 1;
      spent += picked.cost;
    }
  }
  return spent;
}

function buildDraftPathGrid(draft: FloorDraft): PathGrid {
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

function buildPatrolWaypoints(
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

function patrolCountFor(danger: number, patrolMul: number, rng: Rng): number {
  if (patrolMul <= 0) return 0;
  const base = danger < 5 ? 1 : rng.int(1, 2);
  if (patrolMul === 1) return base;
  const scaled = base * patrolMul;
  const whole = Math.floor(scaled);
  const frac = scaled - whole;
  return frac > 0 && rng.chance(frac) ? whole + 1 : whole;
}

function populatePatrols(
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
      const oodRoll = rollOodDanger(draft.dungeon, baseDanger, rng);
      const spawnDanger = oodRoll.danger;
      const activePool = poolForOodRoll(baseDanger, basePool, oodRoll, ecology);
      const def = pickMonsterForSlot(patrolRoles, activePool, spawnDanger, rng, ecology);
      if (def === undefined) break;

      const pos = pickClusteredTile(draft.terrain, occ, def, nearbyTiles, m === 0 ? undefined : anchor, rng);
      if (pos === undefined) break;

      const tChance = templateChanceFor(draft.dungeon, baseDanger, templateFallback);
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

/**
 * Stocks a generated floor with Danger-scaled, threat-budget room squads and corridor patrols.
 * Excludes the arrival stairs room from initial room spawns and enforces `params.stairsDistance`
 * on every placed monster.
 */
export function populateEncounters(draft: FloorDraft, params: EncounterGenParams, rng: Rng): void {
  const ecology = draft.dungeon?.ecology;
  const baseDanger = Math.max(1, draft.danger);
  const basePool = monstersForDanger(baseDanger, ecology);
  if (basePool.length === 0) return;

  const stairs = draft.features.filter((f) => f.feature.kind === 'stairs').map((f) => f.pos);
  const upStairs = draft.features.find((f) => f.feature.kind === 'stairs' && f.feature.dir === 'up')?.pos;
  const arrivalAnchor = upStairs ?? draft.starts[0];
  const arrivalRoomIndex =
    arrivalAnchor === undefined ? -1 : draft.rooms.findIndex((r) => inRoom(arrivalAnchor, r));

  const occ: OccupancyTracker = {
    width: draft.terrain.width,
    takenFeatures: new Set(draft.features.map((f) => tileKey(f.pos, draft.terrain.width))),
    stairs,
    avoid: stairs,
    stairsDistance: params.stairsDistance,
    tiles: new Map(),
  };

  const budgetMul = draft.dungeon?.encounters?.budgetMul ?? 1;
  const patrolMul = draft.dungeon?.encounters?.patrolMul ?? 1;

  const eligibleRooms = draft.rooms.filter((room, idx) => {
    if (idx === arrivalRoomIndex) return false;
    return rectTiles(room).some(
      (t) =>
        draft.terrain.get(t.x, t.y) === Terrain.Floor &&
        !occ.takenFeatures.has(tileKey(t, occ.width)) &&
        occ.stairs.every((s) => chebyshev(s, t) >= occ.stairsDistance),
    );
  });

  const totalBudget = floorThreatBudget(baseDanger, budgetMul);
  let remainingBudget = totalBudget;
  let nextGroupId = 1;

  if (eligibleRooms.length > 0 && remainingBudget > 0) {
    const targetRooms = targetOccupiedRoomCount(baseDanger, eligibleRooms.length, budgetMul, rng);
    const shuffledRooms = rng.shuffle([...eligibleRooms]);
    const chosenRooms = shuffledRooms.slice(0, targetRooms);
    const spareRooms = shuffledRooms.slice(targetRooms);

    for (let i = 0; i < chosenRooms.length && remainingBudget > 0; i++) {
      const room = chosenRooms[i] as Rect;
      const roomsLeft = chosenRooms.length - i;
      const share = remainingBudget / roomsLeft;
      const low = Math.max(1, Math.floor(share * 0.75));
      const high = Math.max(low, Math.min(remainingBudget, Math.ceil(share * 1.25)));
      const roomBudget = roomsLeft === 1 ? remainingBudget : rng.int(low, high);
      const bp = pickBlueprint(baseDanger, basePool, roomBudget, rng);
      const groupId = nextGroupId++;
      const spent = populateRoomSquad(
        draft,
        occ,
        room,
        groupId,
        bp,
        baseDanger,
        basePool,
        ecology,
        roomBudget,
        remainingBudget,
        params.templateChance,
        rng,
      );
      remainingBudget = Math.max(0, remainingBudget - spent);
    }

    // Spend significant remaining budget (e.g. high budgetMul) into spare eligible rooms first.
    for (const room of spareRooms) {
      if (remainingBudget < 2) break;
      const bp = pickBlueprint(baseDanger, basePool, remainingBudget, rng);
      const groupId = nextGroupId++;
      const spent = populateRoomSquad(
        draft,
        occ,
        room,
        groupId,
        bp,
        baseDanger,
        basePool,
        ecology,
        remainingBudget,
        remainingBudget,
        params.templateChance,
        rng,
      );
      if (spent === 0) break;
      remainingBudget = Math.max(0, remainingBudget - spent);
    }

    // If budgetMul > 1 still has budget and every room already has a squad, reinforce rooms.
    if (budgetMul > 1 && remainingBudget >= 2) {
      for (const room of chosenRooms) {
        if (remainingBudget < 2) break;
        const bp = pickBlueprint(baseDanger, basePool, remainingBudget, rng);
        const groupId = nextGroupId++;
        const spent = populateRoomSquad(
          draft,
          occ,
          room,
          groupId,
          bp,
          baseDanger,
          basePool,
          ecology,
          Math.min(remainingBudget, Math.max(2, Math.ceil(totalBudget / chosenRooms.length))),
          remainingBudget,
          params.templateChance,
          rng,
        );
        remainingBudget = Math.max(0, remainingBudget - spent);
      }
    }
  }

  populatePatrols(
    draft,
    occ,
    arrivalRoomIndex,
    baseDanger,
    basePool,
    ecology,
    patrolMul,
    params.templateChance,
    nextGroupId,
    rng,
  );
}

// ---------------------------------------------------------------------------------------------
// Return-trip deep surge (ETH-136)

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
    const mul = Math.max(0, surge.countMul);
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

  return { dangerMin, dangerMax, targetCount, templateBonus: surge.templateBonus, hasDepthShift };
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

  const plan = resolveSurgeWavePlan(dungeon, floor.depth, localDanger, bottomDanger, options, rng);
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
    const overlay = templates.length === 0 ? undefined : { templates };
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

    const patrolSize = patrolLeft >= 4 ? rng.int(2, 3) : patrolLeft;
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

// Re-export monsterWeightAt so content/sim tests importing from encounters can inspect weights if needed.
export { monsterWeightAt, MONSTERS };
