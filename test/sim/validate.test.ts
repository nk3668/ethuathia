import { describe, expect, it } from 'vitest';
import { Registry } from '../../src/core';
import { checkKinds, FLOOR_TYPE_KIND } from '../../src/content';
import type { FloorTypeDef } from '../../src/content';
import { adventurerActor, checkFloorParams, checkGame, createRun, GEN_STEPS, getEntity, statValue, validateGame } from '../../src/sim';

const floor = (steps: FloorTypeDef['steps']): FloorTypeDef => ({
  id: 'floor.broken',
  name: 'Broken',
  description: 'A floor type made to fail validation.',
  tags: [],
  size: { w: 20, h: 10 },
  steps,
});

describe('validateGame', () => {
  it('passes on the shipped content', () => {
    expect(checkGame()).toEqual([]);
    expect(() => validateGame()).not.toThrow();
  });

  it("names a floor type that refers to a generation step that doesn't exist", () => {
    const registry = new Registry<FloorTypeDef>('floor type');
    registry.register(floor([{ step: 'gen.rooms' }, { step: 'gen.labyrinth' }]));
    expect(checkKinds([{ ...FLOOR_TYPE_KIND, registry }], [GEN_STEPS])).toEqual([
      'floor type "floor.broken": steps[1].step refers to unknown generation step "gen.labyrinth"',
    ]);
  });

  it("names a floor type whose step parameters the step doesn't accept", () => {
    const problems = checkFloorParams([floor([{ step: 'gen.rooms', params: { maxRooms: -1 } }])]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^Floor type "floor\.broken" step 1 \("gen\.rooms"\): .*maxRooms/);
  });

  it('leaves unknown steps to the reference check', () => {
    expect(checkFloorParams([floor([{ step: 'gen.labyrinth', params: { nonsense: true } }])])).toEqual([]);
  });
});

describe('adventurers from class and race', () => {
  it('start as a party actor whose HP and MP createRun fills from the stats', () => {
    expect(adventurerActor({ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' })).toEqual({
      energy: 0,
      hp: 1,
      mp: 0,
      faction: 'party',
    });
  });

  it('are created by createRun with HP and MP from their attributes and speed from the race', () => {
    // Vanguard + Human: Brawn 12, Wits 5, Grit 14 -> max HP 14 + 12 x 0.5 = 20, MP 5.
    const state = createRun({ party: [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }] }, 1);
    const hero = getEntity(state, state.party[0] as number);
    expect(hero.actor).toMatchObject({ hp: 20, mp: 5 });
    expect([statValue(state, hero, 'hp'), statValue(state, hero, 'mp'), statValue(state, hero, 'speed')]).toEqual([20, 5, 100]);
  });

  it('fail on an unknown class or race, naming the adventurer', () => {
    expect(() => createRun({ party: [{ name: 'Mira', classId: 'class.jester', raceId: 'race.human' }] }, 1)).toThrow(
      'Adventurer "Mira" has unknown class id "class.jester"',
    );
    expect(() => adventurerActor({ name: 'Oren', classId: 'class.vanguard', raceId: 'race.giant' })).toThrow(
      'Adventurer "Oren" has unknown race id "race.giant"',
    );
  });
});
