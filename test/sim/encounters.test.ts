/**
 * Threat-budget room encounters, squad blueprints, and Danger-scaled floor density (ETH-135).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core';
import {
  defineDungeon,
  DUNGEON_OLD_DELVE,
  FLOOR_HALLS,
  MONSTERS,
  SQUAD_BLUEPRINTS,
  squadBlueprintProblems,
  squadBlueprintSchema,
  squadsForDanger,
  validateSquadBlueprints,
} from '../../src/content';
import type { MonsterDef, SquadBlueprint } from '../../src/content';
import {
  checkInvariants,
  createRun,
  ensureFloor,
  floorThreatBudget,
  generateFloor,
  getEntity,
  monstersForDanger,
  pickMonsterForSlot,
  PARTY_SIZE_BUDGET_STEP,
  partySizeBudgetMul,
  planFloor,
  Terrain,
} from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function inRoom(pos: { x: number; y: number }, room: { x: number; y: number; w: number; h: number }): boolean {
  return pos.x >= room.x && pos.x < room.x + room.w && pos.y >= room.y && pos.y < room.y + room.h;
}

describe('SQUAD_BLUEPRINTS content validation', () => {
  it('validates all shipped blueprints with zero hardcoded monster IDs', () => {
    expect(squadBlueprintProblems()).toEqual([]);
    expect(() => validateSquadBlueprints()).not.toThrow();

    const ids = SQUAD_BLUEPRINTS.map((b) => b.id);
    expect(ids).toEqual([
      'squad.solo_scout',
      'squad.swarm_pack',
      'squad.kin_and_tender',
      'squad.shield_and_bolt',
      'squad.hunting_pack',
      'squad.deep_warband',
    ]);

    for (const bp of SQUAD_BLUEPRINTS) {
      expect(squadBlueprintSchema.safeParse(bp).success).toBe(true);
      expect(JSON.stringify(bp)).not.toContain('monster.');
    }

    expect(squadsForDanger(1).map((b) => b.id)).toEqual(['squad.solo_scout', 'squad.swarm_pack']);
    expect(squadsForDanger(3).map((b) => b.id)).toContain('squad.kin_and_tender');
    expect(squadsForDanger(5, { patrolOnly: true }).map((b) => b.id)).toEqual(['squad.hunting_pack']);
    expect(squadsForDanger(7).map((b) => b.id)).toContain('squad.deep_warband');
  });

  it('rejects malformed or duplicate squad blueprints', () => {
    const valid = SQUAD_BLUEPRINTS[0] as SquadBlueprint;
    expect(squadBlueprintProblems([])).toContain('SQUAD_BLUEPRINTS must not be empty');
    expect(squadBlueprintProblems([valid, valid])).toContain(`duplicate squad blueprint id "${valid.id}"`);
    expect(
      squadBlueprintProblems([
        {
          ...valid,
          id: 'monster.bad_prefix',
          slots: [{ roles: ['brute'], min: 3, max: 1 }],
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must look like "squad.some_name"'),
        expect.stringContaining('min must not exceed max'),
      ]),
    );
    expect(
      squadBlueprintProblems([
        {
          ...valid,
          slots: [{ roles: [], min: 0, max: 1 }],
        },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('needs at least one role'),
        expect.stringContaining('total minimum monsters across slots must be at least 1'),
      ]),
    );
  });

  it('selects monsters dynamically and falls back gracefully when a pool lacks a requested role', () => {
    const rng = Rng.seeded(11, 'slot-fallback');
    const pool = monstersForDanger(1);
    const onlySwarms = pool.filter((m) => m.role === 'swarm');
    expect(onlySwarms.length).toBeGreaterThan(0);

    // Asking for a support when only swarms exist falls back cleanly to an eligible monster in the pool.
    const picked = pickMonsterForSlot(['support'], onlySwarms, 1, rng);
    expect(picked).toBeDefined();
    expect(onlySwarms.map((m) => m.id)).toContain(picked?.id);
    expect(pickMonsterForSlot(['brute'], [], 1, rng)).toBeUndefined();

    // preferTags narrows within the role pool when matching tags exist.
    const smallSupport = monstersForDanger(3).filter((m) => m.role === 'swarm' || m.role === 'brute');
    const kin = pickMonsterForSlot(['swarm', 'brute'], smallSupport, 3, rng, undefined, ['small_folk']);
    expect(kin?.tags).toContain('small_folk');
  });
});

describe('Danger-scaled threat-budget encounters', () => {
  it('scales floor monster counts smoothly across Danger bands (6-10 at D1-2 up to 22-35+ at D9+)', () => {
    const meanCounts = (danger: number, seeds = 20): number => {
      let total = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const plan = generateFloor(FLOOR_HALLS, Rng.seeded(seed, `d-${danger}`), {
          depth: danger,
          danger,
          dungeon: DUNGEON_OLD_DELVE,
        });
        total += plan.spawns?.length ?? 0;
      }
      return total / seeds;
    };

    const d1 = meanCounts(1);
    const d2 = meanCounts(2);
    const d4 = meanCounts(4);
    const d7 = meanCounts(7);
    const d9 = meanCounts(9);
    const d10 = meanCounts(10);

    expect(d1).toBeGreaterThanOrEqual(6);
    expect(d1).toBeLessThanOrEqual(11);
    expect(d2).toBeGreaterThanOrEqual(6);
    expect(d2).toBeLessThanOrEqual(11);

    expect(d4).toBeGreaterThanOrEqual(11);
    expect(d4).toBeLessThanOrEqual(19);

    expect(d7).toBeGreaterThanOrEqual(18);
    expect(d7).toBeLessThanOrEqual(27);

    expect(d9).toBeGreaterThanOrEqual(22);
    expect(d10).toBeGreaterThanOrEqual(22);
    expect(d9).toBeGreaterThan(d4);
    expect(d4).toBeGreaterThan(d1);
  });

  it('excludes the arrival stairs room from initial room spawns and enforces stairsDistance on every spawn', () => {
    for (let seed = 1; seed <= 15; seed++) {
      for (const danger of [1, 4, 8]) {
        const plan = generateFloor(FLOOR_HALLS, Rng.seeded(seed, `stairs-check-${danger}`), {
          depth: danger,
          danger,
          dungeon: DUNGEON_OLD_DELVE,
        });
        const stairs = plan.features.filter((f) => f.feature.kind === 'stairs').map((f) => f.pos);
        const up = plan.features.find((f) => f.feature.kind === 'stairs' && f.feature.dir === 'up')?.pos;
        expect(up).toBeDefined();

        const spawns = plan.spawns ?? [];
        expect(spawns.length).toBeGreaterThan(0);

        for (const s of spawns) {
          expect(plan.terrain.get(s.pos.x, s.pos.y)).toBe(Terrain.Floor);
          for (const st of stairs) {
            expect(chebyshev(s.pos, st)).toBeGreaterThanOrEqual(7);
          }
          if (s.monster?.homeRoom !== undefined && up !== undefined) {
            expect(inRoom(up, s.monster.homeRoom)).toBe(false);
            expect(inRoom(s.pos, s.monster.homeRoom)).toBe(true);
          }
        }
      }
    }
  });

  it('clusters packmates with shared groupId & homeRoom and respects sharesTile occupancy', () => {
    const state = createRun({ party: [HERO], depth: 5 }, 14);
    ensureFloor(state, 'd4');
    expect(checkInvariants(state)).toEqual([]);

    const monsters = Object.values(state.entities).filter((e) => e.floor === 'd4' && e.monster !== undefined);
    expect(monsters.length).toBeGreaterThanOrEqual(12);

    const byGroup = new Map<number, typeof monsters>();
    for (const m of monsters) {
      const gid = m.monster?.groupId;
      expect(gid).toBeTypeOf('number');
      if (gid !== undefined) byGroup.set(gid, [...(byGroup.get(gid) ?? []), m]);
    }
    expect(byGroup.size).toBeGreaterThanOrEqual(3);

    for (const [, pack] of byGroup) {
      const rooms = new Set(pack.map((m) => (m.monster?.homeRoom === undefined ? 'none' : JSON.stringify(m.monster.homeRoom))));
      expect(rooms.size).toBe(1);
    }

    // Room encounters align kin & tender by tag when Danger >= 3.
    const plan3 = generateFloor(FLOOR_HALLS, Rng.seeded(7, 'kin-tag'), {
      depth: 3,
      danger: 3,
      dungeon: DUNGEON_OLD_DELVE,
    });
    const groups3 = new Map<number, MonsterDef[]>();
    for (const s of plan3.spawns ?? []) {
      const gid = s.monster?.groupId;
      if (gid !== undefined && s.monster?.homeRoom !== undefined) {
        groups3.set(gid, [...(groups3.get(gid) ?? []), MONSTERS.get(s.def)]);
      }
    }
    for (const [, defs] of groups3) {
      const hasSupport = defs.some((d) => d.role === 'support');
      if (hasSupport && defs.length >= 2) {
        const shared = defs[0]?.tags.some((t) => defs.every((d) => d.tags.includes(t)));
        expect(shared).toBe(true);
      }
    }
  });

  it('scales room budget and patrols via dungeon.encounters budgetMul and patrolMul', () => {
    const leanDungeon = defineDungeon({
      id: 'dungeon.test_lean_encounters',
      name: 'Lean Delve',
      description: 'Test dungeon with halved budget and zero patrols.',
      hint: 'Test dungeon.',
      tags: ['dungeon'],
      depth: { min: 4, max: 4 },
      danger: { start: 4, perFloor: 1 },
      floorType: 'floor.halls',
      encounters: { budgetMul: 0.4, patrolMul: 0 },
    });
    const denseDungeon = defineDungeon({
      id: 'dungeon.test_dense_encounters',
      name: 'Dense Delve',
      description: 'Test dungeon with doubled budget and doubled patrols.',
      hint: 'Test dungeon.',
      tags: ['dungeon'],
      depth: { min: 4, max: 4 },
      danger: { start: 4, perFloor: 1 },
      floorType: 'floor.halls',
      encounters: { budgetMul: 2.0, patrolMul: 2 },
    });

    expect(floorThreatBudget(4, 2)).toBe(floorThreatBudget(4, 1) * 2);
    expect(floorThreatBudget(4, 0)).toBe(0);

    let leanTotal = 0;
    let denseTotal = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const leanPlan = generateFloor(FLOOR_HALLS, Rng.seeded(seed, 'mul-check'), {
        depth: 1,
        danger: 4,
        dungeon: leanDungeon,
      });
      const densePlan = generateFloor(FLOOR_HALLS, Rng.seeded(seed, 'mul-check'), {
        depth: 1,
        danger: 4,
        dungeon: denseDungeon,
      });
      const leanPatrols = (leanPlan.spawns ?? []).filter((s) => s.monster?.patrol !== undefined);
      const densePatrols = (densePlan.spawns ?? []).filter((s) => s.monster?.patrol !== undefined);
      expect(leanPatrols).toHaveLength(0);
      expect(densePatrols.length).toBeGreaterThanOrEqual(2);
      leanTotal += leanPlan.spawns?.length ?? 0;
      denseTotal += densePlan.spawns?.length ?? 0;
    }
    expect(denseTotal).toBeGreaterThan(leanTotal * 1.8);
  });

  it('grows the floor budget by about 10% per adventurer after the first, as headcount only (ETH-145)', () => {
    // The shipped step is a small tunable (0 while the ordering can't afford it); the mechanism is
    // tested with an explicit 10% step.
    expect(PARTY_SIZE_BUDGET_STEP).toBeGreaterThanOrEqual(0);
    expect(PARTY_SIZE_BUDGET_STEP).toBeLessThanOrEqual(0.1);
    expect(partySizeBudgetMul(1)).toBe(1);
    expect(partySizeBudgetMul(4, 0.1)).toBeCloseTo(1.3);
    expect(partySizeBudgetMul(4)).toBeCloseTo(1 + 3 * PARTY_SIZE_BUDGET_STEP);

    const spawnsFor = (partySize: number, danger: number, partyBudgetStep = 0.1) => {
      let count = 0;
      let threat = 0;
      const templated = new Set<string>();
      for (let seed = 1; seed <= 12; seed++) {
        const plan = generateFloor(FLOOR_HALLS, Rng.seeded(seed, 'party-size'), { depth: danger, danger, dungeon: DUNGEON_OLD_DELVE, partySize, partyBudgetStep });
        for (const s of plan.spawns ?? []) {
          count++;
          threat += MONSTERS.get(s.def).threat;
          if (s.monster?.overlay !== undefined) templated.add(s.def);
        }
      }
      return { count, threat, templated };
    };
    const solo = spawnsFor(1, 6);
    const four = spawnsFor(4, 6);
    expect(four.count).toBeGreaterThan(solo.count);
    expect(four.threat).toBeGreaterThan(solo.threat);
    // Monster stats never scale: the same defs, unchanged, only more of them.
    expect(spawnsFor(1, 6)).toEqual(solo);

    // With no step set a party of 4 gets exactly the solo floor, so a shipped step of 0 changes nothing.
    expect(spawnsFor(4, 6, 0)).toEqual(spawnsFor(1, 6, 0));
  });

  it('produces identical RunState plans across repeated planFloor calls with valid invariants', () => {
    const state = createRun({ party: [HERO], depth: 6 }, 21);
    const p1 = planFloor(state, 'd3');
    const p2 = planFloor(state, 'd3');
    expect(p1.spawns).toEqual(p2.spawns);
    ensureFloor(state, 'd3');
    const roomMonsters = Object.values(state.entities).filter((e) => e.floor === 'd3' && e.monster?.homeRoom !== undefined);
    expect(roomMonsters.length).toBeGreaterThan(0);
    for (const m of roomMonsters) {
      expect(getEntity(state, m.id).monster?.groupId).toBeGreaterThanOrEqual(1);
    }
    expect(checkInvariants(state)).toEqual([]);
  });
});
