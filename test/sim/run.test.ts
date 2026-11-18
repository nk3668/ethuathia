import { describe, expect, it } from 'vitest';
import { findNonPlain, Rng, seedState } from '../../src/core';
import { FLOOR_TYPES } from '../../src/content';
import {
  createRun,
  DEFS,
  entitiesOnFloor,
  FIRST_FLOOR_TYPE,
  floorRngState,
  floorToText,
  generateFloor,
  getEntity,
  planToText,
  RNG_STREAMS,
  STATE_VERSION,
  statValue,
} from '../../src/sim';
import type { RunConfig } from '../../src/sim';

const ONE: RunConfig = { party: [{ name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' }] };

/** A hand-built floor (the first floor before generation existed). */
const HALL: readonly string[] = [
  '############################################',
  '#........#############......################',
  '#.<.@....+...........+......################',
  '#........######.######......################',
  '#........######.######......######.......###',
  "######.########.######......'.....+......###",
  '######.########.#################........###',
  '######.########.#################.....>..###',
  '######.########...........#######........###',
  '######.###################.######.......####',
  '######.....+.......#######.......#..########',
  '################.......................#####',
  '############################################',
];

describe('createRun', () => {
  it('builds one floor and one adventurer from a config and seed', () => {
    const state = createRun({ ...ONE, floorText: [...HALL] }, 7);
    expect(state.version).toBe(STATE_VERSION);
    expect(state.seed).toBe(7);
    expect(state.turn).toBe(0);
    expect(Object.keys(state.floors)).toEqual(['d1']);
    // A straight line of the default ten floors, of which only the first is built.
    expect(state.dungeon.entry).toBe('d1');
    expect(Object.keys(state.dungeon.nodes)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd10']);
    expect(state.dungeon.nodes.d1).toEqual({ id: 'd1', depth: 1, up: null, down: ['d2'] });
    expect(state.dungeon.nodes.d10).toEqual({ id: 'd10', depth: 10, up: 'd9', down: [] });

    expect(state.party).toHaveLength(1);
    const hero = getEntity(state, state.party[0] as number);
    expect(hero.def).toBe(DEFS.adventurer);
    expect(hero.floor).toBe('d1');
    expect(hero.pos).toEqual({ x: 4, y: 2 }); // the @ in HALL
    expect(hero.adventurer).toEqual({ name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' });
    expect(hero.actor).toMatchObject({ faction: 'party', energy: 0 });
    expect(statValue(state, hero, 'speed')).toBe(100);
  });

  it('holds only plain data: no class instances, Map, Set or functions', () => {
    const state = createRun({ party: [...ONE.party, ...ONE.party] }, 1);
    expect(findNonPlain(state)).toBeNull();
    expect(state.floors.d1?.terrain.cells).toBeInstanceOf(Uint8Array);
  });

  it('seeds one independent RNG stream per system from the seed', () => {
    const state = createRun({ ...ONE, floorText: [...HALL] }, 42); // a hand-built floor draws nothing
    expect(state.rng.dungeon).toEqual(seedState(42, 'dungeon'));
    expect(state.rng.combat).toEqual(seedState(42, 'combat'));
    new Rng(state.rng.combat).nextU32();
    expect(state.rng.combat).not.toEqual(seedState(42, 'combat'));
    expect(state.rng.dungeon).toEqual(seedState(42, 'dungeon'));
  });

  it('creates the floor features as entities', () => {
    const state = createRun({ ...ONE, floorText: [...HALL] }, 1);
    const features = entitiesOnFloor(state, 'd1').filter((e) => e.feature !== undefined);
    expect(features.map((e) => e.def).sort()).toEqual(
      [DEFS.door, DEFS.door, DEFS.door, DEFS.door, DEFS.door, DEFS.stairsDown, DEFS.stairsUp].sort(),
    );
    expect(floorToText(state, 'd1')).toEqual(HALL);
  });

  it('generates the first floor from its own seed-and-floor RNG when there is no floor text', () => {
    // Without monsters, so the printed floor shows only terrain, features and the party.
    const state = createRun({ ...ONE, monsters: false }, 5);
    const expected = generateFloor(FLOOR_TYPES.get(FIRST_FLOOR_TYPE), new Rng(floorRngState(5, 'd1')));
    const hero = getEntity(state, state.party[0] as number);
    const up = expected.features.find((f) => f.feature.kind === 'stairs' && f.feature.dir === 'up');
    expect(hero.pos).toEqual(up?.pos); // no @ marks, so the party starts on the up stairs
    expect(floorToText(state, 'd1')).toEqual(planToText({ ...expected, starts: [hero.pos] }));

    // Generation drew from none of the run's streams, so building floors in any order changes nothing else.
    for (const stream of RNG_STREAMS) expect(state.rng[stream]).toEqual(seedState(5, stream));
  });

  it('copies the config instead of keeping the caller’s objects', () => {
    const config: RunConfig = { party: [{ name: 'A', classId: 'class.vanguard', raceId: 'race.human' }] };
    const state = createRun(config, 1);
    expect(state.config).toEqual(config);
    expect(state.config.party).not.toBe(config.party);
    (config.party[0] as { name: string }).name = 'changed';
    expect(state.config.party[0]?.name).toBe('A');
  });

  it('uses a hand-built floor and starts on the up stairs when there is no @', () => {
    const state = createRun({ ...ONE, floorText: ['#####', '#<.>#', '#####'] }, 1);
    expect(getEntity(state, state.party[0] as number).pos).toEqual({ x: 1, y: 1 });
  });

  it('puts extra party members on the nearest free floor tiles', () => {
    const four = { party: [1, 2, 3, 4].map((n) => ({ name: `A${n}`, classId: 'class.vanguard', raceId: 'race.human' })) };
    const state = createRun({ ...four, floorText: ['#######', '#@.>..#', '#.#####', '#######'] }, 1);
    expect(state.party.map((id) => getEntity(state, id).pos)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 }, // east before south (DIRS_8 order)
      { x: 1, y: 2 },
      { x: 4, y: 1 }, // the stairs at (3, 1) are passed over
    ]);
    expect(floorToText(state, 'd1')).toEqual(['#######', '#@@>@.#', '#@#####', '#######']);
  });

  it('rejects an empty party, a floor with no start, or too little room', () => {
    expect(() => createRun({ party: [] }, 1)).toThrow(/at least one/);
    expect(() => createRun({ ...ONE, floorText: ['###', '#.#', '###'] }, 1)).toThrow(/@ start or up stairs/);
    const two = { party: [...ONE.party, ...ONE.party] };
    expect(() => createRun({ ...two, floorText: ['###', '#@#', '###'] }, 1)).toThrow(/No room/);
    expect(() => createRun(ONE, 1.5)).toThrow(RangeError);
  });
});
