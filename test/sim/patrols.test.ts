/**
 * Deterministic multi-room corridor patrols and stairs-blocker safety (ETH-135 & ETH-113):
 * - Multi-room waypoint loop advancement (`patrol.next`) and deterministic save/load round-trips
 * - Strict exclusion of stairs tiles from patrol waypoints and `act.patrol` never idling on stairs
 * - Generated patrols across Danger 1–4 (1 solo scout) and Danger 5+ (1–2 hunting squads of 2–3)
 * - Invariant checks for `combat.groups` and `combat.patrols`
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core';
import type { Pos } from '../../src/core';
import { DUNGEON_OLD_DELVE, FLOOR_HALLS } from '../../src/content';
import {
  checkInvariants,
  chooseRule,
  createRun,
  deserialize,
  generateFloor,
  getEntity,
  moveEntity,
  serialize,
  spawnMonster,
  stateHash,
  step,
  Terrain,
} from '../../src/sim';
import type { ActorEntity, AiActor, EntityId, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

function setup(floorText: string[], seed = 1, holdHero = true): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText, depth: 1, monsters: false }, seed);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  if (holdHero && hero.ai !== undefined) {
    hero.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];
  }
  return { state, hero };
}

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('generated corridor patrols', () => {
  it('spawns 1 solo scout on Danger 1-4 and 1-2 hunting squads of 2-3 on Danger 5+, with non-stairs reachable loops', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const shallow = generateFloor(FLOOR_HALLS, Rng.seeded(seed, 'patrol-d2'), {
        depth: 2,
        danger: 2,
        dungeon: DUNGEON_OLD_DELVE,
      });
      const shallowPatrols = (shallow.spawns ?? []).filter((s) => s.monster?.patrol !== undefined);
      expect(shallowPatrols).toHaveLength(1);
      expect(shallowPatrols[0]?.monster?.patrol?.waypoints.length).toBeGreaterThanOrEqual(2);

      const deep = generateFloor(FLOOR_HALLS, Rng.seeded(seed, 'patrol-d6'), {
        depth: 6,
        danger: 6,
        dungeon: DUNGEON_OLD_DELVE,
      });
      const deepPatrols = (deep.spawns ?? []).filter((s) => s.monster?.patrol !== undefined);
      const groups = new Set(deepPatrols.map((p) => p.monster?.groupId));
      expect(groups.size).toBeGreaterThanOrEqual(1);
      expect(groups.size).toBeLessThanOrEqual(2);
      expect(deepPatrols.length).toBeGreaterThanOrEqual(2);
      expect(deepPatrols.length).toBeLessThanOrEqual(6);

      const stairs = new Set(
        deep.features.filter((f) => f.feature.kind === 'stairs').map((f) => `${f.pos.x},${f.pos.y}`),
      );
      for (const p of deepPatrols) {
        for (const wp of p.monster?.patrol?.waypoints ?? []) {
          expect(deep.terrain.get(wp.x, wp.y)).toBe(Terrain.Floor);
          expect(stairs.has(`${wp.x},${wp.y}`)).toBe(false);
        }
      }
    }
  });
});

describe('patrol movement & waypoint loop determinism', () => {
  // Hero sits in an isolated alcove on the far left so the patroller walks the whole multi-room loop undisturbed.
  const LOOP_MAP = [
    '###################',
    '#@#...............#',
    '###...##+#####+####',
    '#.....#........#..#',
    '#.....+........+..#',
    '#.....#........#..#',
    '#..<..............#',
    '###################',
  ];

  it('cycles deterministically through multi-room waypoints and matches after save/load', () => {
    const waypoints: Pos[] = [
      { x: 14, y: 1 },
      { x: 16, y: 6 },
      { x: 5, y: 6 },
    ];
    const { state } = setup(LOOP_MAP, 3);
    const patroller = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 6, y: 1 }, undefined, {
      groupId: 1,
      patrol: { waypoints, next: 0 },
    }) as ActorEntity;

    const visitedIndices = new Set<number>([0]);
    for (let i = 0; i < 80; i++) {
      if (i === 20) {
        const twin = deserialize(serialize(state));
        expect(stateHash(twin)).toBe(stateHash(state));
        for (let j = 0; j < 15; j++) {
          expect(step(twin, [])).toEqual(step(state, []));
          expect(stateHash(twin)).toBe(stateHash(state));
        }
        continue;
      }
      step(state, []);
      expect(checkInvariants(state)).toEqual([]);
      const next = patroller.monster?.patrol?.next;
      if (next !== undefined) visitedIndices.add(next);
    }

    expect(visitedIndices).toEqual(new Set([0, 1, 2]));
  });

  it('never idles on stairs tiles and avoids ETH-113 stairs-blocker softlocks on retreat', () => {
    // Narrow corridor with stairs up at (1,1) and hero starting away at (9,1).
    const CORRIDOR = [
      '############',
      '#<........@#',
      '############',
    ];
    const { state, hero } = setup(CORRIDOR, 4, false);
    const scout = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 1, y: 1 }, undefined, {
      groupId: 1,
      patrol: { waypoints: [{ x: 4, y: 1 }, { x: 8, y: 1 }], next: 0 },
    }) as ActorEntity;

    // Even before retreating, choosing a rule while standing on stairs steps off instead of waiting.
    const choice = chooseRule({ state, actor: scout as AiActor });
    expect(choice?.request.id).toBe('move');
    expect(scout.pos).toEqual({ x: 1, y: 1 });

    // Order immediate retreat: hero fights/clears any blocker and exits without stuck storms.
    const events: SimEvent[] = [];
    events.push(...step(state, [{ type: 'retreat' }]));
    for (let i = 0; i < 60 && state.domains.run.end === null; i++) {
      events.push(...step(state, []));
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(state.domains.run.end?.outcome).toBe('retreat');
    expect(ofType(events, 'leftDungeon')).toHaveLength(1);
    expect(ofType(events, 'stuck')).toEqual([]);
    void hero;
  });
});

describe('combat.groups and combat.patrols invariants', () => {
  it('flags invalid groupId, homeRoom, alert, and patrol waypoints or indices', () => {
    const MAP = ['#######', '#<...@#', '#.....#', '#######'];
    const { state } = setup(MAP, 1);

    const m = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 4, y: 2 }, undefined, {
      groupId: 1,
      homeRoom: { x: 1, y: 1, w: 5, h: 2 },
      patrol: { waypoints: [{ x: 2, y: 2 }, { x: 5, y: 2 }], next: 0 },
    }) as ActorEntity;
    expect(checkInvariants(state)).toEqual([]);

    // Bad groupId
    if (m.monster) m.monster.groupId = 0;
    expect(checkInvariants(state).some((p) => p.startsWith('[combat.groups]'))).toBe(true);
    if (m.monster) m.monster.groupId = 1;

    // Out-of-bounds homeRoom
    if (m.monster) m.monster.homeRoom = { x: 1, y: 1, w: 20, h: 2 };
    expect(checkInvariants(state).some((p) => p.startsWith('[combat.groups]'))).toBe(true);
    if (m.monster) m.monster.homeRoom = { x: 1, y: 1, w: 5, h: 2 };

    // Out-of-bounds alert pos
    if (m.monster) m.monster.alert = { pos: { x: 99, y: 1 }, untilTurn: 5 };
    expect(checkInvariants(state).some((p) => p.startsWith('[combat.groups]'))).toBe(true);
    if (m.monster) delete m.monster.alert;

    // Patrol waypoint on stairs tile
    if (m.monster?.patrol) m.monster.patrol.waypoints[0] = { x: 1, y: 1 };
    expect(checkInvariants(state).some((p) => p.startsWith('[combat.patrols]'))).toBe(true);

    // Patrol waypoint on wall tile
    if (m.monster?.patrol) m.monster.patrol.waypoints[0] = { x: 0, y: 0 };
    expect(checkInvariants(state).some((p) => p.startsWith('[combat.patrols]'))).toBe(true);

    // Out-of-range patrol.next
    if (m.monster?.patrol) {
      m.monster.patrol.waypoints[0] = { x: 2, y: 2 };
      m.monster.patrol.next = 5;
    }
    expect(checkInvariants(state).some((p) => p.startsWith('[combat.patrols]'))).toBe(true);

    // Restore valid state and confirm clean
    if (m.monster?.patrol) m.monster.patrol.next = 0;
    moveEntity(state, m.id, 'd1', { x: 4, y: 2 });
    expect(checkInvariants(state)).toEqual([]);
  });
});
