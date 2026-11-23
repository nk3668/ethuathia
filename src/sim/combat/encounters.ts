/**
 * Danger-scaled, threat-budget room encounters and deterministic corridor patrols (ETH-135).
 *
 * - Room encounters pick role/tag `SquadBlueprint`s eligible at the floor's Danger, allocate a
 *   Danger-scaled threat budget across non-arrival rooms, deduct each monster's threat (scaled by
 *   template `threatMul`), assign a shared `groupId` and `homeRoom`, and cluster packmates.
 * - Patrol encounters place deterministic solo scouts (Danger 1–4) or 2–3 monster hunting squads
 *   (Danger 5+) in corridors/non-arrival areas on multi-room waypoint loops excluding stairs tiles.
 */
import type { Pos, Rng } from '../../core';
import { MONSTERS, SQUAD_BLUEPRINTS, templateDefs } from '../../content';
import type { DungeonEcology, MonsterDef, MonsterRole, SquadBlueprint, SquadSlot } from '../../content';
import { rectTiles } from '../gen/types';
import type { FloorDraft, Rect } from '../gen/types';
import { buildGoalMap, OPEN_DOOR_COST, STEP_COST, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { Terrain } from '../state';
import {
  monstersForDanger,
  monsterWeightAt,
  newMonster,
  pickWeightedForDanger,
  rollOodDanger,
  templateChanceFor,
} from './monsters';
import type { MonsterPatrol } from './groupAi';
import { rollTemplates } from './overlay';

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

interface OccupancyTracker {
  width: number;
  takenFeatures: Set<number>;
  stairs: Pos[];
  stairsDistance: number;
  tiles: Map<number, { count: number; allShare: boolean }>;
}

function canPlaceOnTile(draft: FloorDraft, occ: OccupancyTracker, def: MonsterDef, pos: Pos): boolean {
  if (!draft.terrain.inBounds(pos.x, pos.y) || draft.terrain.get(pos.x, pos.y) !== Terrain.Floor) return false;
  const k = tileKey(pos, occ.width);
  if (occ.takenFeatures.has(k)) return false;
  if (occ.stairs.some((s) => chebyshev(s, pos) < occ.stairsDistance)) return false;
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
  draft: FloorDraft,
  occ: OccupancyTracker,
  def: MonsterDef,
  candidates: readonly Pos[],
  anchor: Pos | undefined,
  rng: Rng,
): Pos | undefined {
  const valid = candidates.filter((p) => canPlaceOnTile(draft, occ, def, p));
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

      const pos = pickClusteredTile(draft, occ, picked.def, tiles, anchorPos, rng);
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
  draft: FloorDraft,
  occ: OccupancyTracker,
  arrivalRoomIndex: number,
  paths: PathGrid,
  rng: Rng,
): Pos[] {
  const stairsKeys = new Set(occ.stairs.map((s) => tileKey(s, occ.width)));
  const safeRoomTile = (room: Rect): Pos | undefined => {
    const c = roomCenter(room);
    const valid = rectTiles(room).filter(
      (t) =>
        draft.terrain.get(t.x, t.y) === Terrain.Floor &&
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

  const nonArrival = draft.rooms
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => i !== arrivalRoomIndex)
    .map(({ r }) => safeRoomTile(r))
    .filter((p): p is Pos => p !== undefined);

  const pool =
    nonArrival.length >= 2
      ? nonArrival
      : draft.rooms.map(safeRoomTile).filter((p): p is Pos => p !== undefined);

  let chosen: Pos[];
  if (pool.length >= 2) {
    const shuffled = rng.shuffle([...pool]);
    chosen = shuffled.slice(0, Math.min(4, shuffled.length));
  } else {
    // Fallback for roomless or 1-room custom layouts: pick distant floor tiles excluding stairs.
    const allFloor: Pos[] = [];
    for (let y = 0; y < draft.terrain.height; y++) {
      for (let x = 0; x < draft.terrain.width; x++) {
        if (draft.terrain.get(x, y) !== Terrain.Floor) continue;
        const p = { x, y };
        if (!stairsKeys.has(tileKey(p, occ.width)) && !occ.takenFeatures.has(tileKey(p, occ.width))) allFloor.push(p);
      }
    }
    if (allFloor.length < 2) return [];
    const first = rng.pick(allFloor);
    const farthest = [...allFloor].sort((a, b) => chebyshev(b, first) - chebyshev(a, first))[0] as Pos;
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

  for (let pIdx = 0; pIdx < count; pIdx++) {
    const waypoints = buildPatrolWaypoints(draft, occ, arrivalRoomIndex, paths, rng);
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

      const pos = pickClusteredTile(draft, occ, def, nearbyTiles, m === 0 ? undefined : anchor, rng);
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

// Re-export monsterWeightAt so content/sim tests importing from encounters can inspect weights if needed.
export { monsterWeightAt, MONSTERS };
