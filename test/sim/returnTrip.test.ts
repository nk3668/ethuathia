/**
 * Return trip (ETH-025): after contracts are complete, the party walks back up through already
 * explored floors along known paths without re-exploring, repopulating each visited floor with
 * higher-level monsters away from the arrival stairs while announcing "The dungeon stirs." only
 * once, and ends as a Victory at the top floor's exit.
 */
import { describe, expect, it } from 'vitest';
import { CONTRACT_RECOVER_RELIC, defineDungeon, DUNGEON_OLD_DELVE, MONSTERS } from '../../src/content';
import { Grid } from '../../src/core';
import {
  buildGoalMap,
  checkInvariants,
  createRun,
  deserialize,
  detectFloorRooms,
  ensureFloor,
  FLAG_CONSTANT_RESPAWN,
  floorDanger,
  floorOpenPathGrid,
  getEntity,
  getFloor,
  getMemory,
  moveEntity,
  pathAlong,
  removeEntity,
  serialize,
  stairsOn,
  stateHash,
  step,
  surgeFloor,
  Terrain,
  UNREACHABLE,
  waitDecide,
} from '../../src/sim';
import type { ActionRequest, Command, Entity, EntityId, FloorId, Rect, RunConfig, RunState, SimEvent } from '../../src/sim';
import { FLOORS_LOG_TEXT } from '../../src/ui/shell/logText/floors';
import { describe as describeEvent } from '../../src/ui/shell/text';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };
const RELIC = CONTRACT_RECOVER_RELIC.id;

// Wide enough corridors so tiles >= 7 steps from the arrival stairs exist for respawns.
const D1 = [
  '##################',
  '#<@.............>#',
  '##################',
];
const D2 = [
  '##################',
  '#<..............>#',
  '##################',
];
const D3 = [
  '##########',
  '#<.......#',
  '##########',
];

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

const monstersOn = (state: RunState, floorId: FloorId): Entity[] =>
  getFloor(state, floorId)
    .entities.map((id) => state.entities[id])
    .filter((e): e is Entity => e?.monster !== undefined && e.actor !== undefined && e.actor.hp > 0);

function stepUntil(state: RunState, done: (events: SimEvent[]) => boolean = () => false, cap = 2000): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < cap && state.domains.run.end === null && !done(events); i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });
const by = (state: RunState, ...commands: Command[]) => step(state, commands, { decide: waitDecide });

describe('return trip (ETH-025)', () => {
  it('repopulates every visited floor on the climb back, announces "The dungeon stirs." only once, and spawns away from arrival stairs', () => {
    const config: RunConfig = {
      party: [HERO, MIRA],
      depth: 3,
      floorTexts: [D1, D2, D3],
      contracts: [RELIC],
      respawn: { min: 1, max: 1, stairsDistance: 7, depthShift: 2 },
    };
    const state = createRun(config, 7);

    // Wait until the relic is recovered on d3.
    const downEvents = stepUntil(state, (es) => ofType(es, 'contractCompleted').length > 0, 500);
    expect(ofType(downEvents, 'dungeonStirred')).toEqual([]);
    expect(ofType(downEvents, 'floorRespawned')).toEqual([]);

    // Snapshot d1 and d2 terrain cells and memory before climbing back.
    const d1TerrainBefore = Array.from(getFloor(state, 'd1').terrain.cells);
    const d2TerrainBefore = Array.from(getFloor(state, 'd2').terrain.cells);
    const d2MemoryBefore = [...getMemory(state, 'd2').terrain.cells];

    // Step until the first party member climbs back up to d2.
    const toD2 = stepUntil(state, (es) => ofType(es, 'tookStairs').some((e) => e.dir === 'up' && e.to === 'd2'), 300);
    // Floor layout and memory are preserved; the arriving member landed on d2's stairs down.
    const d2StairsDown = stairsOn(state, 'd2', 'down');
    expect(d2StairsDown).toBeDefined();
    expect(ofType(toD2, 'tookStairs').find((e) => e.to === 'd2')?.pos).toEqual(d2StairsDown?.pos);
    expect([...getMemory(state, 'd2').terrain.cells]).toEqual(d2MemoryBefore);
    expect(Array.from(getFloor(state, 'd2').terrain.cells)).toEqual(d2TerrainBefore);

    // First repopulation emitted dungeonStirred once and floorRespawned for d2.
    const stirred = ofType(toD2, 'dungeonStirred');
    expect(stirred).toHaveLength(1);
    expect(FLOORS_LOG_TEXT.dungeonStirred.text(stirred[0] as Extract<SimEvent, { type: 'dungeonStirred' }>, () => '')).toBe(
      'The dungeon stirs.',
    );
    expect(describeEvent(stirred[0] as Extract<SimEvent, { type: 'dungeonStirred' }>, () => '').text).toBe('The dungeon stirs.');
    expect(ofType(toD2, 'floorRespawned')).toMatchObject([{ floor: 'd2', depth: 2, count: 1, wave: 1 }]);

    // The spawned monster on d2 is at least 7 tiles from the arrival stairs and from the shifted depth pool (depth 2 + 2 = 4).
    const d2Monsters = monstersOn(state, 'd2');
    expect(d2Monsters).toHaveLength(1);
    const m = d2Monsters[0];
    if (m === undefined || d2StairsDown === undefined) throw new Error('expected respawned monster and stairs');
    const dist = Math.max(Math.abs(m.pos.x - d2StairsDown.pos.x), Math.abs(m.pos.y - d2StairsDown.pos.y));
    expect(dist).toBeGreaterThanOrEqual(7);
    const def = MONSTERS.get(m.def);
    expect(def.danger.min).toBeLessThanOrEqual(4);
    expect(def.danger.max).toBeGreaterThanOrEqual(4);

    // Let the whole party climb all the way out to Victory.
    const rest = stepUntil(state, () => false, 1000);
    expect(state.domains.run.end?.outcome).toBe('victory');
    expect(Array.from(getFloor(state, 'd1').terrain.cells)).toEqual(d1TerrainBefore);

    // Trailing member entering d2 did NOT trigger a second wave on d2; d1 repopulated once; dungeonStirred never fired again!
    expect(ofType(rest, 'dungeonStirred')).toEqual([]);
    expect(ofType(rest, 'floorRespawned')).toMatchObject([{ floor: 'd1', depth: 1, count: 1, wave: 1 }]);
    expect(state.domains.floors.respawns).toEqual({ d2: 1, d1: 1 });
    expect(state.domains.floors.stirAnnounced).toBe(true);

    // After contracts completed, the baseline never fell back to exploring on the return trip.
    const returnRules = [...toD2, ...rest].filter((e): e is Extract<SimEvent, { type: 'ruleFired' }> => e.type === 'ruleFired');
    expect(returnRules.some((r) => r.action === 'act.explore')).toBe(false);
  });

  it('honors respawn: { max: 0 } even when min is omitted', () => {
    const state = createRun(
      { party: [HERO], depth: 2, floorTexts: [D1, D2], contracts: [RELIC], respawn: { max: 0 } },
      11,
    );
    const events = stepUntil(state, () => false, 500);
    expect(state.domains.run.end?.outcome).toBe('victory');
    expect(ofType(events, 'dungeonStirred')).toEqual([]);
    expect(ofType(events, 'floorRespawned')).toEqual([]);
  });

  it('does not repopulate floors before contracts are complete under default rules', () => {
    const state = createRun({ party: [HERO], depth: 2, floorTexts: [D1, D2], contracts: [RELIC] }, 3);
    const hero = state.party[0] as EntityId;
    // Walk to stairs down on d1 (x=16, y=1), descend to d2, then climb straight back up without the relic.
    const stairs = stairsOn(state, 'd1', 'down');
    if (stairs === undefined) throw new Error('expected stairs down on d1');
    getEntity(state, hero).pos = { x: stairs.pos.x, y: stairs.pos.y };
    by(state, act(hero, { id: 'stairs', dir: 'down' }));
    const up = by(state, act(hero, { id: 'stairs', dir: 'up' }));
    expect(ofType(up, 'dungeonStirred')).toEqual([]);
    expect(ofType(up, 'floorRespawned')).toEqual([]);
    expect(monstersOn(state, 'd1')).toEqual([]);
  });

  it('repopulates floors repeatedly after cooldown when the constant-respawn run flag is active', () => {
    const state = createRun(
      {
        party: [HERO],
        depth: 2,
        floorTexts: [D1, D2],
        respawn: { min: 1, max: 1, stairsDistance: 5, cooldown: 3 },
        runModifiers: [
          {
            key: 'guild.constant_respawn',
            source: { id: 'upgrade.test_respawn', label: 'Constant Respawn' },
            scope: 'party',
            flags: [FLAG_CONSTANT_RESPAWN],
          },
        ],
      },
      9,
    );
    const hero = state.party[0] as EntityId;
    const stairs = stairsOn(state, 'd1', 'down');
    if (stairs === undefined) throw new Error('expected stairs down on d1');
    getEntity(state, hero).pos = { x: stairs.pos.x, y: stairs.pos.y };
    by(state, act(hero, { id: 'stairs', dir: 'down' }));

    // Re-entering d1 immediately (turn delta < cooldown 3) does NOT respawn.
    const tooSoon = by(state, act(hero, { id: 'stairs', dir: 'up' }));
    expect(ofType(tooSoon, 'floorRespawned')).toEqual([]);

    // Go back down, wait past cooldown, then climb up: respawns wave 1 and announces stir once.
    by(state, act(hero, { id: 'stairs', dir: 'down' }));
    for (let i = 0; i < 4; i++) by(state);
    const wave1 = by(state, act(hero, { id: 'stairs', dir: 'up' }));
    expect(ofType(wave1, 'dungeonStirred')).toHaveLength(1);
    expect(ofType(wave1, 'floorRespawned')).toMatchObject([{ floor: 'd1', count: 1, wave: 1 }]);

    // Go back down, wait past cooldown, climb up again: respawns wave 2 without repeating dungeonStirred.
    by(state, act(hero, { id: 'stairs', dir: 'down' }));
    for (let i = 0; i < 4; i++) by(state);
    const wave2 = by(state, act(hero, { id: 'stairs', dir: 'up' }));
    expect(ofType(wave2, 'dungeonStirred')).toEqual([]);
    expect(ofType(wave2, 'floorRespawned')).toMatchObject([{ floor: 'd1', count: 1, wave: 2 }]);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('completes Recover the relic and walks out to Victory in a generated multi-floor dungeon with respawns, deterministically across save/load', () => {
    const config: RunConfig = {
      party: [HERO, MIRA],
      depth: 3,
      contracts: [RELIC],
    };
    const state = createRun(config, 42);
    const toRelic = stepUntil(state, (es) => ofType(es, 'contractCompleted').length > 0, 2500);
    expect(ofType(toRelic, 'contractCompleted')).toHaveLength(1);

    // Save and reload right as the return trip starts: both runs must match identically to Victory.
    const copy = deserialize(serialize(state));
    const tailA = stepUntil(state, () => false, 2000);
    const tailB = stepUntil(copy, () => false, 2000);

    expect(state.domains.run.end?.outcome).toBe('victory');
    expect(stateHash(copy)).toBe(stateHash(state));
    expect(ofType(tailA, 'dungeonStirred')).toHaveLength(1);
    expect(ofType(tailA, 'floorRespawned').map((e) => e.floor)).toEqual(['d2', 'd1']);
    expect(ofType(tailB, 'floorRespawned')).toEqual(ofType(tailA, 'floorRespawned'));
  });
});

function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function inRoom(pos: { x: number; y: number }, room: Rect): boolean {
  return pos.x >= room.x && pos.x < room.x + room.w && pos.y >= room.y && pos.y < room.y + room.h;
}

/** Sets up an explored floor `d1` (cleared of initial monsters) and ascends from `d2` back onto `d1` after completing the relic contract. */
function ascendAfterRelic(config: RunConfig, seed: number): { state: RunState; events: SimEvent[]; surgedMonsters: Entity[] } {
  const state = createRun({ ...config, contracts: [RELIC] }, seed);
  const depth = Object.keys(state.dungeon.nodes).length;
  const bottomId = `d${depth}`;
  const heroId = state.party[0] as EntityId;

  // Clear d1 monsters and prepare d1 + bottom floor cleanly.
  for (const m of monstersOn(state, 'd1')) {
    removeEntity(state, m.id);
  }
  ensureFloor(state, 'd2');
  ensureFloor(state, bottomId);

  // Pick up the relic on the bottom floor so contractsComplete(state) holds, then step onto d2 and climb up to d1.
  const relic = Object.values(state.entities).find((e) => e.floor === bottomId && e.item?.def === 'item.ember_reliquary');
  if (relic === undefined) throw new Error('expected relic on bottom floor');
  moveEntity(state, heroId, bottomId, relic.pos);
  step(state, [act(heroId, { id: 'pickup', item: relic.id })], { decide: waitDecide });

  const d2Down = stairsOn(state, 'd2', 'down');
  const d2Up = stairsOn(state, 'd2', 'up');
  const d1Down = stairsOn(state, 'd1', 'down');
  if (d2Down === undefined || d2Up === undefined || d1Down === undefined) throw new Error('expected stairs on d1 and d2');

  // Move any trailing party members off d1 onto d2Down so heroId can stand on d2Up and ascend onto vacated d1.
  for (const id of state.party) {
    if (id !== heroId) moveEntity(state, id, 'd2', d2Down.pos);
  }
  moveEntity(state, heroId, 'd2', d2Up.pos);
  state.domains.floors.arrived[bottomId] = state.turn;
  state.domains.floors.deepest = depth;
  state.domains.floors.arrived.d2 = state.turn;
  const events = by(state, act(heroId, { id: 'stairs', dir: 'up' }));
  return { state, events, surgedMonsters: monstersOn(state, 'd1') };
}

describe('return-trip deep surge (ETH-136)', () => {
  it('anchors surging waves to [max(1, bottomDanger - dangerWindow), bottomDanger] across 6-floor vs 10-floor runs', () => {
    // 6-floor run -> bottomDanger = 6, window [4, 6]; 10-floor run -> bottomDanger = 10, window [8, 10].
    const shallowDefs: string[] = [];
    const deepDefs: string[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const six = ascendAfterRelic({ party: [HERO, MIRA], depth: 6 }, seed);
      expect(ofType(six.events, 'dungeonStirred')).toMatchObject([{ floor: 'd1', depth: 1, surged: true }]);
      expect(ofType(six.events, 'floorRespawned')).toMatchObject([
        { floor: 'd1', depth: 1, count: six.surgedMonsters.length, wave: 1, surged: true },
      ]);
      expect(six.surgedMonsters.length).toBeGreaterThanOrEqual(2);
      for (const m of six.surgedMonsters) {
        const def = MONSTERS.get(m.def);
        shallowDefs.push(def.id);
        expect(def.danger.min).toBeLessThanOrEqual(6);
        expect(def.danger.max).toBeGreaterThanOrEqual(4);
      }

      const ten = ascendAfterRelic({ party: [HERO, MIRA], depth: 10 }, seed);
      expect(ten.surgedMonsters.length).toBeGreaterThanOrEqual(2);
      for (const m of ten.surgedMonsters) {
        const def = MONSTERS.get(m.def);
        deepDefs.push(def.id);
        // Window [8, 10] strictly excludes shallow Danger 1-7 creatures (gloam rat, mossling, pit badger, etc.).
        expect(def.danger.min).toBeLessThanOrEqual(10);
        expect(def.danger.max).toBeGreaterThanOrEqual(8);
      }
      expect(checkInvariants(six.state)).toEqual([]);
      expect(checkInvariants(ten.state)).toEqual([]);
    }
    // 10-floor surges pull deeper threats than 6-floor surges.
    const meanMin = (ids: string[]) => ids.reduce((s, id) => s + MONSTERS.get(id).danger.min, 0) / ids.length;
    expect(meanMin(deepDefs)).toBeGreaterThan(meanMin(shallowDefs));

    // Custom dungeon with dangerWindow: 0 pins surges strictly to bottomDanger.
    const pinnedDungeon = defineDungeon({
      ...DUNGEON_OLD_DELVE,
      id: 'dungeon.test_surge_pinned',
      encounters: {
        ...DUNGEON_OLD_DELVE.encounters,
        surge: { dangerWindow: 0, templateBonus: 0, countMul: 1 },
      },
    });
    const pinned = ascendAfterRelic({ party: [HERO], dungeonId: pinnedDungeon.id, depth: 10 }, 5);
    for (const m of pinned.surgedMonsters) {
      const def = MONSTERS.get(m.def);
      expect(def.danger.min).toBeLessThanOrEqual(10);
      expect(def.danger.max).toBeGreaterThanOrEqual(10);
    }
  });

  it('elevates template chance by +surge.templateBonus (clamped to [0, 1]) and scales wave size by surge.countMul', () => {
    const noBonusDungeon = defineDungeon({
      ...DUNGEON_OLD_DELVE,
      id: 'dungeon.test_surge_no_bonus',
      encounters: {
        templateRamp: { minDanger: 1, base: 0, perDanger: 0, max: 0 },
        surge: { dangerWindow: 1, templateBonus: 0, countMul: 1 },
      },
    });
    const fullBonusDungeon = defineDungeon({
      ...DUNGEON_OLD_DELVE,
      id: 'dungeon.test_surge_full_bonus',
      encounters: {
        templateRamp: { minDanger: 1, base: 0, perDanger: 0, max: 0 },
        surge: { dangerWindow: 1, templateBonus: 1, countMul: 2 },
      },
    });
    const zeroCountDungeon = defineDungeon({
      ...DUNGEON_OLD_DELVE,
      id: 'dungeon.test_surge_zero_count',
      encounters: {
        surge: { dangerWindow: 2, templateBonus: 0.5, countMul: 0 },
      },
    });

    let baseCount = 0;
    let doubleCount = 0;
    let plainTemplated = 0;
    let boostedTotal = 0;
    let boostedTemplated = 0;

    for (let seed = 1; seed <= 8; seed++) {
      const plain = ascendAfterRelic({ party: [HERO], dungeonId: noBonusDungeon.id, depth: 6 }, seed);
      const boosted = ascendAfterRelic({ party: [HERO], dungeonId: fullBonusDungeon.id, depth: 6 }, seed);
      baseCount += plain.surgedMonsters.length;
      doubleCount += boosted.surgedMonsters.length;
      for (const m of plain.surgedMonsters) {
        if ((m.monster?.overlay?.templates?.length ?? 0) > 0) plainTemplated++;
      }
      for (const m of boosted.surgedMonsters) {
        boostedTotal++;
        if ((m.monster?.overlay?.templates?.length ?? 0) > 0) boostedTemplated++;
      }
    }
    expect(plainTemplated).toBe(0);
    expect(boostedTemplated).toBe(boostedTotal);
    expect(doubleCount).toBeGreaterThanOrEqual(baseCount * 1.8);

    const zero = ascendAfterRelic({ party: [HERO], dungeonId: zeroCountDungeon.id, depth: 6 }, 3);
    expect(zero.surgedMonsters).toEqual([]);
    expect(ofType(zero.events, 'dungeonStirred')).toEqual([]);
    expect(ofType(zero.events, 'floorRespawned')).toEqual([]);
  });

  it('spawns cohesive route-biased squads and hunter patrols while honoring stairsDistance, stairs-room exclusion, and ETH-113 safety', () => {
    let squadMonsters = 0;
    let patrolMonsters = 0;
    let surgedRouteDistSum = 0;
    let surgedSampleCount = 0;
    let allRoomsRouteDistSum = 0;
    let allRoomsCount = 0;

    for (let seed = 1; seed <= 12; seed++) {
      const state = createRun({ party: [HERO, MIRA], depth: 8, contracts: [RELIC] }, seed);
      // Clear d1 so only surged monsters are inspected.
      for (const m of monstersOn(state, 'd1')) removeEntity(state, m.id);
      const d1Up = stairsOn(state, 'd1', 'up')?.pos;
      const d1Down = stairsOn(state, 'd1', 'down')?.pos;
      if (d1Up === undefined || d1Down === undefined) throw new Error('expected stairs on d1');
      const heroId = state.party[0] as EntityId;
      moveEntity(state, heroId, 'd1', d1Down);

      const placed = surgeFloor(state, 'd1', d1Down, 1);
      expect(placed).toBeGreaterThanOrEqual(2);
      expect(checkInvariants(state)).toEqual([]);

      const terrain = Grid.wrap(getFloor(state, 'd1').terrain);
      const rooms = detectFloorRooms(terrain);
      const paths = floorOpenPathGrid(state, 'd1');
      const toExit = buildGoalMap(paths, [d1Up]);
      const routeTiles = [d1Down, ...pathAlong(paths, toExit, d1Down)];
      const routeDist = buildGoalMap(paths, routeTiles);

      for (const room of rooms) {
        if (inRoom(d1Up, room) || inRoom(d1Down, room)) continue;
        let best = UNREACHABLE;
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            const d = routeDist.get(x, y);
            if (d < best) best = d;
          }
        }
        if (best !== UNREACHABLE) {
          allRoomsRouteDistSum += best;
          allRoomsCount++;
        }
      }

      const spawned = monstersOn(state, 'd1');
      expect(spawned).toHaveLength(placed);

      for (const m of spawned) {
        expect(chebyshev(m.pos, d1Up)).toBeGreaterThanOrEqual(7);
        expect(chebyshev(m.pos, d1Down)).toBeGreaterThanOrEqual(7);
        expect(m.monster?.groupId).toBeGreaterThanOrEqual(1);

        if (m.monster?.homeRoom !== undefined) {
          squadMonsters++;
          expect(inRoom(d1Up, m.monster.homeRoom)).toBe(false);
          expect(inRoom(d1Down, m.monster.homeRoom)).toBe(false);
          expect(inRoom(m.pos, m.monster.homeRoom)).toBe(true);
        }
        if (m.monster?.patrol !== undefined) {
          patrolMonsters++;
          expect(m.monster.patrol.waypoints.length).toBeGreaterThanOrEqual(2);
          for (const wp of m.monster.patrol.waypoints) {
            expect(terrain.get(wp.x, wp.y)).toBe(Terrain.Floor);
            expect(wp).not.toEqual(d1Up);
            expect(wp).not.toEqual(d1Down);
          }
        }

        const d = routeDist.get(m.pos.x, m.pos.y);
        if (d !== UNREACHABLE) {
          surgedRouteDistSum += d;
          surgedSampleCount++;
        }
      }
    }

    expect(squadMonsters).toBeGreaterThan(0);
    expect(patrolMonsters).toBeGreaterThan(0);
    // Surged spawns sit closer to the stairs-down -> stairs-up ascent route than the unweighted room mean.
    expect(surgedRouteDistSum / surgedSampleCount).toBeLessThanOrEqual(allRoomsRouteDistSum / allRoomsCount + 1);
  });

  it('keeps voluntary early Retreat un-surged and keeps FLAG_CONSTANT_RESPAWN anchored to local floor Danger', () => {
    // 1. Voluntary retreat BEFORE completing the relic contract on a 6-floor run stays un-surged.
    const retreatRun = createRun({ party: [HERO, MIRA], depth: 6, contracts: [RELIC] }, 14);
    const d1Down = stairsOn(retreatRun, 'd1', 'down');
    const heroId = retreatRun.party[0] as EntityId;
    if (d1Down === undefined) throw new Error('expected stairs down on d1');
    moveEntity(retreatRun, heroId, 'd1', d1Down.pos);
    by(retreatRun, act(heroId, { id: 'stairs', dir: 'down' }));
    const d2Down = stairsOn(retreatRun, 'd2', 'down');
    if (d2Down === undefined) throw new Error('expected stairs down on d2');
    moveEntity(retreatRun, heroId, 'd2', d2Down.pos);
    by(retreatRun, act(heroId, { id: 'stairs', dir: 'down' }));
    // Move trailing member to d3 too so d1 and d2 are vacated, then immediately order voluntary retreat before recovering the relic.
    const d3Up = stairsOn(retreatRun, 'd3', 'up');
    if (d3Up === undefined) throw new Error('expected stairs up on d3');
    moveEntity(retreatRun, retreatRun.party[1] as EntityId, 'd3', d3Up.pos);
    const orderEvents = step(retreatRun, [{ type: 'retreat' }]);
    const restEvents = stepUntil(retreatRun, () => false, 800);
    const allRetreat = [...orderEvents, ...restEvents];
    expect(retreatRun.domains.run.end?.outcome).toBe('retreat');
    expect(ofType(allRetreat, 'contractCompleted')).toEqual([]);
    expect(ofType(allRetreat, 'floorRespawned')).toEqual([]);
    expect(ofType(allRetreat, 'dungeonStirred')).toEqual([]);

    // 2. FLAG_CONSTANT_RESPAWN on a 6-floor run stays anchored to local floorDanger + depthShift (Danger 2 on d1), even if contracts complete.
    const constRun = createRun(
      {
        party: [HERO],
        depth: 6,
        contracts: [RELIC],
        respawn: { min: 2, max: 2, cooldown: 2, stairsDistance: 7 },
        runModifiers: [
          {
            key: 'guild.constant_respawn',
            source: { id: 'upgrade.test_respawn', label: 'Constant Respawn' },
            scope: 'party',
            flags: [FLAG_CONSTANT_RESPAWN],
          },
        ],
      },
      19,
    );
    const cHero = constRun.party[0] as EntityId;
    for (const m of monstersOn(constRun, 'd1')) removeEntity(constRun, m.id);
    ensureFloor(constRun, 'd2');
    ensureFloor(constRun, 'd6');
    const relic = Object.values(constRun.entities).find((e) => e.floor === 'd6' && e.item?.def === 'item.ember_reliquary');
    if (relic === undefined) throw new Error('expected relic on d6');
    moveEntity(constRun, cHero, 'd6', relic.pos);
    step(constRun, [act(cHero, { id: 'pickup', item: relic.id })], { decide: waitDecide });
    const cUp = stairsOn(constRun, 'd2', 'up');
    if (cUp === undefined) throw new Error('expected stairs up on d2');
    moveEntity(constRun, cHero, 'd2', cUp.pos);
    constRun.domains.floors.arrived.d6 = constRun.turn;
    constRun.domains.floors.deepest = 6;
    constRun.domains.floors.arrived.d2 = constRun.turn;
    constRun.domains.floors.lastVacated.d1 = constRun.turn;
    for (let i = 0; i < 4; i++) by(constRun);
    const waveEvents = by(constRun, act(cHero, { id: 'stairs', dir: 'up' }));

    const respawned = ofType(waveEvents, 'floorRespawned');
    expect(respawned).toHaveLength(1);
    expect(respawned[0]?.surged).toBeUndefined();
    for (const m of monstersOn(constRun, 'd1')) {
      const def = MONSTERS.get(m.def);
      const targetDanger = floorDanger(constRun, 1) + 1; // local d1 danger (1) + default depthShift (1) = 2
      expect(def.danger.min).toBeLessThanOrEqual(targetDanger);
      expect(def.danger.max).toBeGreaterThanOrEqual(targetDanger);
    }
  });

  it('reproduces surged ascents deterministically across save/load mid-ascent in a 6-floor generated dungeon', () => {
    const state = createRun({ party: [HERO, MIRA], depth: 6, contracts: [RELIC] }, 1);
    const toRelic = stepUntil(state, (es) => ofType(es, 'contractCompleted').length > 0, 3000);
    expect(ofType(toRelic, 'contractCompleted')).toHaveLength(1);

    // Step until the first surged floor (d5) spawns, then save/load mid-ascent and continue identically.
    const toD5 = stepUntil(state, (es) => ofType(es, 'floorRespawned').length > 0, 800);
    expect(ofType(toD5, 'dungeonStirred')).toMatchObject([{ floor: 'd5', depth: 5, surged: true }]);
    expect(ofType(toD5, 'floorRespawned')).toMatchObject([{ floor: 'd5', depth: 5, wave: 1, surged: true }]);

    const copy = deserialize(serialize(state));
    expect(stateHash(copy)).toBe(stateHash(state));

    const tailA = stepUntil(state, () => false, 1500);
    const tailB = stepUntil(copy, () => false, 1500);
    expect(tailB).toEqual(tailA);
    expect(stateHash(copy)).toBe(stateHash(state));
    expect(ofType(tailA, 'stuck')).toEqual([]);
  });
});
