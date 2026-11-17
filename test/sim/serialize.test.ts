import { describe, expect, it } from 'vitest';
import { Grid, Rng } from '../../src/core';
import { addEntity, createRun, deserialize, moveEntity, serialize, STATE_VERSION, Terrain } from '../../src/sim';
import type { RunState } from '../../src/sim';

/** A run that has been changed in a few ways after creation, so the round trip covers more. */
function playedRun(): RunState {
  const state = createRun({ party: [{ name: 'A', classId: 'class.vanguard', raceId: 'race.human' }, { name: 'B', classId: 'class.vanguard', raceId: 'race.human' }] }, 99);
  new Rng(state.rng.combat).int(1, 20);
  new Rng(state.rng.ai).float();
  state.turn = 17;
  Grid.wrap(state.floors.d1?.terrain as never).set(10, 10, Terrain.Floor);
  addEntity(state, {
    def: 'monster.test_rat',
    floor: 'd1',
    pos: { x: 3, y: 3 },
    actor: { energy: 40, speed: 120, hp: 2, maxHp: 3, mp: 0, maxMp: 0, faction: 'monster' },
  });
  moveEntity(state, state.party[1] as number, 'd1', { x: 6, y: 3 });
  return state;
}

describe('serialize and deserialize', () => {
  it('round-trip to a deep-equal state, including grids and RNG state', () => {
    const state = playedRun();
    const back = deserialize(serialize(state));
    expect(back).toStrictEqual(state);
    expect(back.floors.d1?.terrain.cells).toBeInstanceOf(Uint8Array);
    expect(back.rng).toEqual(state.rng);
  });

  it('a loaded run draws the same random numbers as the original', () => {
    const state = playedRun();
    const back = deserialize(serialize(state));
    const draws = (s: RunState) => Array.from({ length: 5 }, () => new Rng(s.rng.combat).nextU32());
    expect(draws(back)).toEqual(draws(state));
  });

  it('writes grids run-length encoded, not as typed array objects', () => {
    const json = JSON.parse(serialize(createRun({ party: [{ name: 'A', classId: 'class.vanguard', raceId: 'race.human' }] }, 1))) as {
      floors: { d1: { terrain: unknown } };
    };
    expect(json.floors.d1.terrain).toMatchObject({ $grid: { width: 64, height: 32, kind: 'u8' } }); // the generated first floor
  });

  it('serializing twice gives the same text', () => {
    const state = playedRun();
    expect(serialize(deserialize(serialize(state)))).toBe(serialize(state));
  });

  it('survives structured clone as well, for worker transfer', () => {
    const state = playedRun();
    expect(structuredClone(state)).toStrictEqual(state);
  });

  it('refuses to serialize a state that is not plain data', () => {
    const shared = playedRun();
    const [a, b] = shared.party.map((id) => shared.entities[id]);
    if (a && b) b.pos = a.pos;
    expect(() => serialize(shared)).toThrow(/is an object that also appears earlier/);

    const withMap = playedRun() as unknown as Record<string, unknown>;
    withMap.extra = new Map();
    expect(() => serialize(withMap as unknown as RunState)).toThrow(/\$\.extra is a Map instance/);

    const loose = playedRun() as unknown as Record<string, unknown>;
    loose.extra = new Int16Array(2);
    expect(() => serialize(loose as unknown as RunState)).toThrow(/typed array outside a grid/);

    const tagged = playedRun() as unknown as Record<string, unknown>;
    tagged.extra = { $grid: 1 };
    expect(() => serialize(tagged as unknown as RunState)).toThrow(/reserved for grids/);
  });

  it('refuses malformed text, another version, bad RNG state or a corrupt grid', () => {
    const text = serialize(playedRun());
    const edit = (fn: (raw: Record<string, unknown>) => void) => {
      const raw = JSON.parse(text) as Record<string, unknown>;
      fn(raw);
      return JSON.stringify(raw);
    };
    expect(() => deserialize('{')).toThrow(SyntaxError);
    expect(() => deserialize('[]')).toThrow(/does not hold an object/);
    expect(() => deserialize(edit((r) => (r.version = STATE_VERSION + 1)))).toThrow(/version/);
    expect(() => deserialize(edit((r) => ((r.rng as Record<string, unknown>).loot = [1, 2])))).toThrow(/"loot" RNG/);
    expect(() =>
      deserialize(
        edit((r) => {
          const floors = r.floors as { d1: { terrain: { $grid: { runs: number[] } } } };
          floors.d1.terrain.$grid.runs = [0, 3];
        }),
      ),
    ).toThrow(/runs cover 3 cells/);
  });
});
