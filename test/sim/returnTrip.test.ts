/**
 * Return trip (ETH-025): after contracts are complete, the party walks back up through already
 * explored floors along known paths without re-exploring, repopulating each visited floor with
 * higher-level monsters away from the arrival stairs while announcing "The dungeon stirs." only
 * once, and ends as a Victory at the top floor's exit.
 */
import { describe, expect, it } from 'vitest';
import { CONTRACT_RECOVER_RELIC, MONSTERS } from '../../src/content';
import {
  checkInvariants,
  createRun,
  deserialize,
  FLAG_CONSTANT_RESPAWN,
  getEntity,
  getFloor,
  getMemory,
  serialize,
  stairsOn,
  stateHash,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActionRequest, Command, EntityId, FloorId, RunConfig, RunState, SimEvent } from '../../src/sim';
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

const monstersOn = (state: RunState, floorId: FloorId) =>
  getFloor(state, floorId)
    .entities.map((id) => state.entities[id])
    .filter((e) => e?.monster !== undefined && e.actor !== undefined && e.actor.hp > 0);

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
    expect(def.depth.min).toBeLessThanOrEqual(4);
    expect(def.depth.max).toBeGreaterThanOrEqual(4);

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
