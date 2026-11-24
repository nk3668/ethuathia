/**
 * The starter classes and races (ETH-160): each class starts with the attributes and kit its
 * backlog row says, each race's adjustments and speed reach the sim, and the harness fields them.
 */
import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_IDS, CLASSES, expectedGrowth, ITEMS, RACES } from '../../src/content';
import type { AttributeId } from '../../src/content';
import { checkInvariants, createRun, getAttribute, getEntity, getStat } from '../../src/sim';
import type { ActorEntity, EntityId } from '../../src/sim';
import { buildHeadlessConfig, headlessParty, parseSimArgs } from '../../tools/headless';
import { availableClasses, availableRaces, masteryClasses, newProfile } from '../../src/meta';

const ROOM = ['#########', '#@......#', '#.......#', '#########'];

function start(classId: string, raceId: string) {
  const state = createRun({ party: [{ name: 'Mira', classId, raceId }], depth: 1, floorText: ROOM, monsters: false }, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

type Row = readonly [brawn: number, finesse: number, wits: number, grit: number];

/** Each class's starting attributes and average growth per level, as in the backlog item (with ETH-160's balance changes). */
const CLASS_TABLE: Record<string, { attrs: Row; growth: Row; kit: string[] }> = {
  'class.vanguard': { attrs: [11, 9, 4, 13], growth: [1, 0.5, 0.25, 1.5], kit: ['item.oak_cudgel', 'item.round_shield'] },
  'class.outrider': { attrs: [8, 14, 7, 8], growth: [0.75, 1.5, 0.5, 0.5], kit: ['item.skinning_knife', 'item.soft_boots'] },
  'class.lorekeeper': { attrs: [5, 8, 12, 8], growth: [0.5, 0.5, 1.5, 0.75], kit: ['item.ashwood_staff', 'item.quilted_jerkin'] },
  'class.reaver': { attrs: [11, 9, 4, 9], growth: [1.5, 0.5, 0.25, 1], kit: ['item.iron_hatchet', 'item.iron_cap'] },
};

const RACE_TABLE: Record<string, { attrs: Row; speed: number }> = {
  'race.human': { attrs: [1, 1, 1, 1], speed: 100 },
  'race.stonekin': { attrs: [3, 1, 0, 4], speed: 90 },
  'race.fenling': { attrs: [-2, 2, 2, -1], speed: 110 },
};

describe('the starter classes', () => {
  it('has a row for every class and race', () => {
    expect(CLASSES.all().map((c) => c.id).sort()).toEqual(Object.keys(CLASS_TABLE).sort());
    expect(RACES.all().map((r) => r.id).sort()).toEqual(Object.keys(RACE_TABLE).sort());
  });

  for (const [id, row] of Object.entries(CLASS_TABLE)) {
    it(`${id} starts with its row's attributes, growth and kit`, () => {
      const def = CLASSES.get(id);
      expect(ATTRIBUTE_IDS.map((a) => def.attributes[a])).toEqual([...row.attrs]);
      const avg = ATTRIBUTE_IDS.map((a) => {
        const roll = def.growth[a];
        return roll === undefined ? 0 : expectedGrowth(roll);
      });
      expect(avg).toEqual([...row.growth]);
      expect(def.kit).toEqual(row.kit);

      const { state, hero } = start(id, 'race.human');
      for (const a of ATTRIBUTE_IDS) expect(getAttribute(hero, a).value).toBe(def.attributes[a] + 1);
      const worn = Object.values(hero.inventory?.equipped ?? {}).map((i) => i.def);
      expect(worn.sort()).toEqual([...row.kit].sort());
      expect(checkInvariants(state)).toEqual([]);
    });
  }

  it('gives each non-Vanguard class its own strongest attribute', () => {
    const top = (id: string): AttributeId => [...ATTRIBUTE_IDS].sort((a, b) => CLASSES.get(id).attributes[b] - CLASSES.get(id).attributes[a])[0] as AttributeId;
    expect(top('class.outrider')).toBe('finesse');
    expect(top('class.lorekeeper')).toBe('wits');
    expect(top('class.reaver')).toBe('brawn');
    expect(top('class.vanguard')).toBe('grit');
  });

  it('wields each kit weapon with the attribute its type scales with', () => {
    expect(ITEMS.get('item.skinning_knife').gear?.type).toBe('dagger');
    expect(ITEMS.get('item.ashwood_staff').gear?.type).toBe('staff');
    expect(ITEMS.get('item.iron_hatchet').gear?.type).toBe('axe');
  });
});

describe('the starter races', () => {
  for (const [id, row] of Object.entries(RACE_TABLE)) {
    it(`${id} adjusts attributes and sets the speed the sim uses`, () => {
      const def = RACES.get(id);
      expect(ATTRIBUTE_IDS.map((a) => def.attributes[a] ?? 0)).toEqual([...row.attrs]);
      expect(def.speed).toBe(row.speed);
      const { state, hero } = start('class.vanguard', id);
      expect(getStat(state, hero, 'speed').value).toBe(row.speed);
      for (const [i, a] of ATTRIBUTE_IDS.entries()) {
        expect(getAttribute(hero, a).value).toBe(CLASSES.get('class.vanguard').attributes[a] + (row.attrs[i] as number));
      }
    });
  }
});

describe('opening the starter content', () => {
  it('leaves every class and race available until ETH-036 gates them', () => {
    const profile = newProfile();
    expect(availableClasses(profile).map((c) => c.id)).toEqual(CLASSES.all().map((c) => c.id));
    expect(availableRaces(profile).map((r) => r.id)).toEqual(RACES.all().map((r) => r.id));
    expect(masteryClasses(profile).map((c) => c.id)).toEqual(CLASSES.all().map((c) => c.id));
  });
});

describe('the headless harness', () => {
  it('fields a solo adventurer of the --class and --race it is given', () => {
    const args = parseSimArgs(['--class', 'outrider', '--race', 'race.fenling']);
    expect(args.classId).toBe('class.outrider');
    expect(args.raceId).toBe('race.fenling');
    const party = headlessParty(args.party, args.classId ?? undefined, args.raceId ?? undefined);
    expect(party).toHaveLength(1);
    expect(party[0]).toMatchObject({ classId: 'class.outrider', raceId: 'race.fenling' });
    expect(buildHeadlessConfig({ party }).party[0]).toMatchObject({ classId: 'class.outrider' });
  });

  it('leaves the Vanguard and Human as the default', () => {
    const args = parseSimArgs([]);
    expect(args.classId).toBeNull();
    expect(args.raceId).toBeNull();
    expect(headlessParty(1)[0]).toMatchObject({ classId: 'class.vanguard', raceId: 'race.human' });
  });

  it('rejects an unknown class or race with the choices', () => {
    expect(() => parseSimArgs(['--class', 'bard'])).toThrow(/--class "bard" is not a class\. Available: class\.vanguard, class\.outrider/);
    expect(() => parseSimArgs(['--race', 'race.elf'])).toThrow(/--race "race\.elf" is not a race\. Available: race\.human/);
  });
});
