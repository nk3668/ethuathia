/**
 * Danger-scaled, threat-budget room encounters and deterministic corridor patrols (ETH-135).
 *
 * - Room encounters pick role/tag `SquadBlueprint`s eligible at the floor's Danger, allocate a
 *   Danger-scaled threat budget across non-arrival rooms, deduct each monster's threat (scaled by
 *   template `threatMul`), assign a shared `groupId` and `homeRoom`, and cluster packmates.
 * - Patrol placement lives in `encounterPatrols.ts`, return-trip deep surge in `encounterSurge.ts`,
 *   and shared geometry/occupancy/slot helpers in `encounterShared.ts`.
 */
import type { Pos, Rng } from '../../core';
import type { DungeonEcology, MonsterDef, SquadBlueprint, SquadSlot } from '../../content';
import { rectTiles } from '../gen/types';
import type { FloorDraft, Rect } from '../gen/types';
import { Terrain } from '../state';
import { populatePatrols } from './encounterPatrols';
import {
  chebyshev,
  computeThreatCost,
  inRoom,
  minSlotThreat,
  pickBlueprint,
  pickClusteredTile,
  pickMonsterForSlot,
  poolForOodRoll,
  recordPlacement,
  sharedTagsAcrossRequiredSlots,
  tileKey,
} from './encounterShared';
import type { OccupancyTracker } from './encounterShared';
import {
  monstersForDanger,
  newMonster,
  pickWeightedForDanger,
  rollOodDanger,
  templateChanceFor,
} from './monsters';
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
  [5, 31],
  [6, 44],
  [7, 65],
  [8, 86],
  [9, 128],
  [10, 155],
];

/**
 * How much the floor threat budget grows for each adventurer after the first (ETH-145, Principle 1
 * of `docs/DIFFICULTY_PHILOSOPHY.md`): at 0.1 a party of 4 meets 30% more monsters than a lone
 * adventurer. It adds headcount and packs only. Monster stats and templates never change with
 * party size.
 *
 * Shipped at 0 (the mechanism is live and tested, the value is off): at 60 seeds 0.03 and above
 * broke the 1 < 2 < 3 < 4 win-rate ordering on at least one preset, because a party of 4 still
 * loses members one at a time and has no slack for extra monsters. ETH-080 tunes this upward
 * (toward about 0.1) as parties get sturdier, for as long as `npm run sim -- --party-sweep` keeps
 * the ordering.
 *
 * ETH-080 re-tested 0.03 (200 seeds, after the recovery and surge retune): party 4 won 33.0% on
 * the fresh preset (below party 3 at 34.5%) and 39.5% on the progressed one, so the ordering and
 * the 2x-solo ratio both failed. It stays 0.
 */
export const PARTY_SIZE_BUDGET_STEP = 0;

/**
 * The multiplier on a floor's threat budget for a party of `size`: 1 for one adventurer and
 * `1 + step` more for each extra member. `step` defaults to `PARTY_SIZE_BUDGET_STEP`.
 */
export function partySizeBudgetMul(size: number, step = PARTY_SIZE_BUDGET_STEP): number {
  return 1 + step * Math.max(0, Math.floor(size) - 1);
}

/** Smooth, monotonic Danger-to-threat-budget curve scaled by optional `budgetMul` (default `1`). */
export function floorThreatBudget(danger: number, budgetMul = 1): number {
  if (danger <= 0 || budgetMul <= 0) return 0;
  let base: number;
  if (danger < 1) {
    base = 7 * danger;
  } else if (danger >= 10) {
    base = 155 + (danger - 10) * 32;
  } else {
    base = 155;
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

  const partyMul = partySizeBudgetMul(draft.partySize, draft.partyBudgetStep);
  const totalBudget = Math.round(floorThreatBudget(baseDanger, budgetMul) * partyMul);
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
    if (budgetMul * partyMul > 1 && remainingBudget >= 2) {
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

// Re-export the public API split into sibling modules so callers and tests keep importing from `./encounters`.
export { pickMonsterForSlot } from './encounterShared';
export { DEFAULT_SURGE_PROFILE, detectFloorRooms, surgeFloor } from './encounterSurge';
// Re-export monsterWeightAt so content/sim tests importing from encounters can inspect weights if needed.
export { monsterWeightAt } from './monsters';
export { MONSTERS } from '../../content';
