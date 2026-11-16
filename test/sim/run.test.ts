import { describe, expect, it } from 'vitest';
import { DIRS_8, findNonPlain, Grid, Rng, seedState } from '../../src/core';
import { createRun, DEFS, entitiesOnFloor, floorToText, getEntity, M0_FLOOR, STATE_VERSION, Terrain } from '../../src/sim';
import type { RunConfig } from '../../src/sim';

const ONE: RunConfig = { party: [{ name: 'Brannoc', classId: 'class.test', raceId: 'race.test' }] };

describe('createRun', () => {
  it('builds one floor and one adventurer from a config and seed', () => {
    const state = createRun(ONE, 7);
    expect(state.version).toBe(STATE_VERSION);
    expect(state.seed).toBe(7);
    expect(state.turn).toBe(0);
    expect(Object.keys(state.floors)).toEqual(['d1']);
    expect(state.dungeon).toEqual({ entry: 'd1', nodes: { d1: { id: 'd1', depth: 1, up: null, down: [] } } });

    expect(state.party).toHaveLength(1);
    const hero = getEntity(state, state.party[0] as number);
    expect(hero.def).toBe(DEFS.adventurer);
    expect(hero.floor).toBe('d1');
    expect(hero.pos).toEqual({ x: 4, y: 2 }); // the @ in M0_FLOOR
    expect(hero.adventurer).toEqual({ name: 'Brannoc', classId: 'class.test', raceId: 'race.test' });
    expect(hero.actor).toMatchObject({ faction: 'party', energy: 0, speed: 100 });
  });

  it('holds only plain data: no class instances, Map, Set or functions', () => {
    const state = createRun({ party: [...ONE.party, ...ONE.party] }, 1);
    expect(findNonPlain(state)).toBeNull();
    expect(state.floors.d1?.terrain.cells).toBeInstanceOf(Uint8Array);
  });

  it('seeds one independent RNG stream per system from the seed', () => {
    const state = createRun(ONE, 42);
    expect(state.rng.dungeon).toEqual(seedState(42, 'dungeon'));
    expect(state.rng.combat).toEqual(seedState(42, 'combat'));
    new Rng(state.rng.combat).nextU32();
    expect(state.rng.combat).not.toEqual(seedState(42, 'combat'));
    expect(state.rng.dungeon).toEqual(seedState(42, 'dungeon'));
  });

  it('creates the floor features as entities', () => {
    const state = createRun(ONE, 1);
    const features = entitiesOnFloor(state, 'd1').filter((e) => e.feature !== undefined);
    expect(features.map((e) => e.def).sort()).toEqual(
      [DEFS.door, DEFS.door, DEFS.door, DEFS.door, DEFS.door, DEFS.stairsDown, DEFS.stairsUp].sort(),
    );
    expect(floorToText(state, 'd1')).toEqual(M0_FLOOR);
  });

  it('copies the config instead of keeping the caller’s objects', () => {
    const config: RunConfig = { party: [{ name: 'A', classId: 'c', raceId: 'r' }] };
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
    const four = { party: [1, 2, 3, 4].map((n) => ({ name: `A${n}`, classId: 'c', raceId: 'r' })) };
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

  it('the M0 floor is fully connected from the start', () => {
    const state = createRun(ONE, 1);
    const terrain = Grid.wrap(state.floors.d1?.terrain ?? new Grid(1, 1, 'u8').toBuffer());
    const seen = new Grid(terrain.width, terrain.height, 'u8');
    const queue = [{ x: 4, y: 2 }];
    seen.set(4, 2, 1);
    // for-of also visits the tiles pushed during the loop.
    for (const p of queue) {
      terrain.forEachNeighbor(
        p.x,
        p.y,
        (x, y) => {
          if (seen.get(x, y) || terrain.get(x, y) !== Terrain.Floor) return;
          seen.set(x, y, 1);
          queue.push({ x, y });
        },
        DIRS_8,
      );
    }
    const floorTiles = terrain.cells.filter((c) => c === Terrain.Floor).length;
    expect(queue.length).toBe(floorTiles);
  });
});
