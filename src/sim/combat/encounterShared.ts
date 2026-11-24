/**
 * Shared geometry, tile occupancy, squad slot/blueprint selection, and OOD pool helpers used across
 * encounter generation, corridor patrols, and return-trip surge modules (ETH-135, ETH-136, ETH-157).
 */
import type { Grid, Pos, Rng } from '../../core';
import { SQUAD_BLUEPRINTS, templateDefs } from '../../content';
import type { DungeonEcology, MonsterDef, MonsterRole, SquadBlueprint } from '../../content';
import type { Rect } from '../gen/types';
import { Terrain } from '../state';
import { monstersForDanger, pickWeightedForDanger } from './monsters';

/** Floor terrain grid and room rectangles shared by encounter and patrol placement helpers. */
export interface FloorLayout {
  terrain: Grid;
  rooms: readonly Rect[];
}

/** Tracks placed monster occupancy, static features, and stairs-avoidance constraints on a floor. */
export interface OccupancyTracker {
  width: number;
  takenFeatures: Set<number>;
  stairs: Pos[];
  avoid: Pos[];
  stairsDistance: number;
  tiles: Map<number, { count: number; allShare: boolean }>;
}

/** Chebyshev (8-way grid) distance between `a` and `b`. */
export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Linear tile key for `pos` in a grid of `width`. */
export function tileKey(pos: Pos, width: number): number {
  return pos.y * width + pos.x;
}

/** True when `pos` lies inside `room`. */
export function inRoom(pos: Pos, room: Rect): boolean {
  return pos.x >= room.x && pos.x < room.x + room.w && pos.y >= room.y && pos.y < room.y + room.h;
}

/** Integer center tile of `r`. */
export function roomCenter(r: Rect): Pos {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

/** True when at least one monster in `pool` matches any role in `roles`. */
export function slotHasCandidate(roles: readonly MonsterRole[], pool: readonly MonsterDef[]): boolean {
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

/** Lowest base `threat` among monsters matching `roles` (falling back to any monster in `pool`). */
export function minSlotThreat(roles: readonly MonsterRole[], pool: readonly MonsterDef[]): number {
  const roleMatches = pool.filter((m) => roles.includes(m.role));
  const list = roleMatches.length > 0 ? roleMatches : pool;
  let min = Infinity;
  for (const m of list) if (m.threat < min) min = m.threat;
  return Number.isFinite(min) ? min : 1;
}

/** Tags shared by at least one eligible candidate in every required (`min > 0`) slot of `bp`. */
export function sharedTagsAcrossRequiredSlots(bp: SquadBlueprint, pool: readonly MonsterDef[]): string[] {
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

/** Weighted random `SquadBlueprint` eligible at `danger` and tuned for `roomBudget`. */
export function pickBlueprint(
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

/** True when `def` can be placed at `pos` respecting floor bounds, features, avoidance, and tile sharing. */
export function canPlaceOnTile(terrain: Grid, occ: OccupancyTracker, def: MonsterDef, pos: Pos): boolean {
  if (!terrain.inBounds(pos.x, pos.y) || terrain.get(pos.x, pos.y) !== Terrain.Floor) return false;
  const k = tileKey(pos, occ.width);
  if (occ.takenFeatures.has(k)) return false;
  if (occ.avoid.some((a) => chebyshev(a, pos) < occ.stairsDistance)) return false;
  const existing = occ.tiles.get(k);
  if (existing === undefined) return true;
  return def.sharesTile === true && existing.allShare;
}

/** Marks `pos` as occupied by `def` in `occ`. */
export function recordPlacement(occ: OccupancyTracker, def: MonsterDef, pos: Pos): void {
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

/** Picks a valid tile in `candidates`, preferring unoccupied tiles clustered near `anchor` when given. */
export function pickClusteredTile(
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

/** Effective threat budget cost of `def` layered with `templates`. */
export function computeThreatCost(def: MonsterDef, templates: readonly string[]): number {
  const mul = templateDefs(templates).reduce((acc, t) => acc * t.threatMul, 1);
  return Math.max(1, Math.round(def.threat * mul));
}

/** Resolves the candidate monster pool for an out-of-depth roll over `baseDanger`. */
export function poolForOodRoll(
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
