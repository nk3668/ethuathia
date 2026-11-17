import { describe, expect, it } from 'vitest';
import { checkInvariants, createRun, listInvariants, registerInvariant, step } from '../../src/sim';
import type { EntityId, RunState } from '../../src/sim';

const ROOMS = [
  '##########',
  '#@@.+...>#',
  '#<..#....#',
  '##########',
];
const PARTY = [
  { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
  { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
];

function run(): RunState {
  return createRun({ party: PARTY, floorText: ROOMS }, 1);
}

/** The violations after `corrupt` changes a fresh run. */
function after(corrupt: (state: RunState, a: EntityId, b: EntityId) => void): string[] {
  const state = run();
  const [a, b] = state.party as [EntityId, EntityId];
  corrupt(state, a, b);
  return checkInvariants(state);
}

describe('checkInvariants', () => {
  it('finds nothing wrong with a new run, or one a few turns in', () => {
    const state = run();
    expect(checkInvariants(state)).toEqual([]);
    for (let i = 0; i < 20; i++) step(state, []);
    expect(checkInvariants(state)).toEqual([]);
    expect(checkInvariants(createRun({ party: PARTY }, 7))).toEqual([]);
  });

  it('registers the core checks', () => {
    const names = listInvariants().map((i) => i.name);
    for (const name of ['core.plainData', 'core.run', 'core.entityIds', 'core.floorIndex', 'core.positions', 'core.party', 'core.actors']) {
      expect(names).toContain(name);
    }
  });

  it('catches state that is not plain data', () => {
    expect(after((s, a) => ((s.entities[a] as { actor: { hp: number } }).actor.hp = NaN))).toContainEqual(
      expect.stringMatching(/^\[core\.plainData\] .*hp is NaN/),
    );
  });

  it('catches entity and floor index mismatches', () => {
    expect(after((s) => s.floors.d1?.entities.pop())).toContainEqual(expect.stringMatching(/^\[core\.floorIndex\] entity \d+ is missing/));
    expect(after((s, a) => s.floors.d1?.entities.push(a))).toContainEqual(expect.stringMatching(/listed on "d1" and again/));
    expect(after((s) => s.floors.d1?.entities.push(99))).toContainEqual(expect.stringMatching(/lists entity 99, which does not exist/));
    expect(after((s, a) => ((s.entities[a] as { floor: string }).floor = 'd9'))).toContainEqual(
      expect.stringMatching(/is on unbuilt floor "d9"/),
    );
    expect(after((s) => Reflect.deleteProperty(s.memory, 'd1'))).toContainEqual(expect.stringMatching(/has no party memory/));
    expect(after((s) => (s.nextEntityId = 2))).toContainEqual(expect.stringMatching(/^\[core\.entityIds\]/));
  });

  it('catches bad positions', () => {
    expect(after((s, a) => ((s.entities[a] as { pos: object }).pos = { x: 50, y: 1 }))).toContainEqual(
      expect.stringMatching(/^\[core\.positions\] entity \d+ at \(50, 1\) is outside floor "d1"/),
    );
    expect(after((s, a) => ((s.entities[a] as { pos: object }).pos = { x: 0, y: 0 }))).toContainEqual(
      expect.stringMatching(/inside a wall/),
    );
    expect(after((s, a, b) => ((s.entities[b] as { pos: object }).pos = { ...(s.entities[a] as { pos: object }).pos }))).toContainEqual(
      expect.stringMatching(/^\[core\.positions\] actors \d+ and \d+ share/),
    );
  });

  it('catches a bad party and bad actor numbers', () => {
    expect(after((s, a) => s.party.push(a))).toContainEqual(expect.stringMatching(/^\[core\.party\] party has a repeated id/));
    expect(after((s) => s.party.push(99))).toContainEqual(expect.stringMatching(/party member 99 does not exist/));
    expect(after((s, a) => ((s.entities[a] as { actor: { hp: number } }).actor.hp = 999))).toContainEqual(
      expect.stringMatching(/^\[core\.actors\] actor \d+ has HP 999/),
    );
    expect(
      after((s, a) => {
        const actor = (s.entities[a] as { actor: { hp: number; queued?: object } }).actor;
        actor.hp = 0;
        actor.queued = { id: 'wait' };
      }),
    ).toContainEqual(expect.stringMatching(/dead actor \d+ still has a queued action/));
  });

  it('runs registered domain checks, reports a throwing one, and can remove them', () => {
    const removeFlag = registerInvariant('test.flag', (s) => (s.turn > 3 ? [`turn ${s.turn} is past 3`] : []));
    const removeThrow = registerInvariant('test.throws', () => {
      throw new Error('boom');
    });
    try {
      expect(() => registerInvariant('test.flag', () => [])).toThrow('Duplicate invariant "test.flag"');
      const state = run();
      state.turn = 5;
      expect(checkInvariants(state)).toEqual(['[test.flag] turn 5 is past 3', '[test.throws] check threw: boom']);
    } finally {
      removeFlag();
      removeThrow();
    }
    const state = run();
    state.turn = 5;
    expect(checkInvariants(state)).toEqual([]);
  });
});
