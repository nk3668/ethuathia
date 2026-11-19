/**
 * Item properties (ETH-118): a test-only property with a modifier bundle reaches `getStat` (a part
 * credited to the item), `compareGear`, value, name and stacking; `origin` keeps an item apart and
 * survives pickup, drop and equip; the `items.properties` invariant; save and load.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  canStack,
  checkInvariants,
  compareGear,
  createRun,
  deserialize,
  getEntity,
  getStat,
  gearBundles,
  ITEM_PROPERTIES,
  itemName,
  itemValue,
  placeItem,
  registerItemProperty,
  serialize,
  step,
  unitValue,
  waitDecide,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, Command, EntityId, ItemInstance, ItemPropertyKind, RunState, SimEvent } from '../../src/sim';

// The test-only fields, the way a real property adds its field to `ItemInstance`.
declare module '../../src/sim/items/instance' {
  interface ItemInstance {
    testEdge?: number;
    testVeiled?: boolean;
  }
}

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const HATCHET = 'item.iron_hatchet';
const SWORD = 'item.arming_sword';
const POTION = 'item.mending_draught';
const ROOM = ['#########', '#@......#', '#.......#', '#########'];

/** A sharpened edge: Damage +n while worn, 10 worth per point, "+n" before the name, hidden until known. */
const PROP_EDGE: ItemPropertyKind<number> = {
  id: 'prop.test_edge',
  field: 'testEdge',
  schema: z.number().int().min(1).max(5),
  bundles: (_ctx, n) => [{ modifiers: [{ stat: 'damage', op: 'add', value: n }] }],
  value: (_ctx, n, base) => base + 10 * n,
  name: (n) => ({ prefix: `+${n}` }),
  hidden: (_n, known) => !known,
  stacks: 'equal',
};

/** Makes an item unknown to its viewer while set, and adds a suffix that is never hidden. */
const PROP_VEILED: ItemPropertyKind<boolean> = {
  id: 'prop.test_veiled',
  field: 'testVeiled',
  schema: z.boolean(),
  name: () => ({ suffix: 'of Mist' }),
  known: (_ctx, v) => v !== true,
  stacks: 'never',
};

const removers: (() => void)[] = [];
beforeAll(() => {
  removers.push(registerItemProperty(PROP_EDGE), registerItemProperty(PROP_VEILED));
});
afterAll(() => {
  for (const remove of removers) remove();
});

function setup(seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 1, floorText: ROOM, monsters: false }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });
const by = (state: RunState, ...commands: Command[]) => step(state, commands, { decide: waitDecide });
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe('the property registry', () => {
  it('lists origin first, then registered kinds in order, and refuses a taken field', () => {
    expect(ITEM_PROPERTIES.map((k) => k.id)).toEqual(['prop.origin', 'prop.test_edge', 'prop.test_veiled']);
    expect(() => registerItemProperty({ ...PROP_EDGE, id: 'prop.other' })).toThrow(/taken/);
    expect(() => registerItemProperty(PROP_EDGE)).toThrow(/Duplicate/);
  });
});

describe('a property with a bundle', () => {
  const edged: ItemInstance = { def: HATCHET, qty: 1, testEdge: 1 };

  it('adds its bundle after the def’s, and getStat credits a part per bundle to the item', () => {
    const { state, hero } = setup();
    expect(gearBundles(state, hero, edged)).toHaveLength(2);
    hero.inventory = { items: [], equipped: { mainHand: edged } };
    const damage = getStat(state, hero, 'damage');
    const parts = damage.parts.filter((p) => p.source.id === HATCHET);
    expect(parts.map((p) => p.value)).toEqual([2, 1]);
    expect(parts.every((p) => p.source.label === 'Iron hatchet')).toBe(true);
    hero.inventory = { items: [], equipped: { mainHand: { def: HATCHET, qty: 1 } } };
    expect(getStat(state, hero, 'damage').value).toBe(damage.value - 1);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('changes the gear comparison', () => {
    const { state, hero } = setup();
    expect(compareGear(state, hero, edged, { def: HATCHET, qty: 1 })).toBe('better');
    // Plain, the sword beats the hatchet; edged, the hatchet trades accuracy for damage.
    expect(compareGear(state, hero, { def: SWORD, qty: 1 }, { def: HATCHET, qty: 1 })).toBe('better');
    expect(compareGear(state, hero, { def: SWORD, qty: 1 }, edged)).toBe('mixed');
  });

  it('changes the value and the name, hiding its part from a viewer who doesn’t know the item', () => {
    const { state, hero } = setup();
    expect(unitValue(state, edged)).toBe(unitValue(state, { def: HATCHET, qty: 1 }) + 10);
    expect(itemValue(state, { def: POTION, qty: 3, testEdge: 2 })).toBe(3 * (unitValue(state, { def: POTION, qty: 1 }) + 20));
    expect(itemName(state, edged, hero)).toBe('+1 Iron hatchet');
    const veiled: ItemInstance = { ...edged, testVeiled: true };
    expect(itemName(state, veiled, hero)).toBe('Iron hatchet of Mist');
    expect(itemName(state, veiled)).toBe('+1 Iron hatchet of Mist');
  });

  it('stacks only with an equal value', () => {
    expect(canStack({ def: POTION, qty: 1, testEdge: 1 }, { def: POTION, qty: 2, testEdge: 1 })).toBe(true);
    expect(canStack({ def: POTION, qty: 1, testEdge: 1 }, { def: POTION, qty: 1, testEdge: 2 })).toBe(false);
    expect(canStack({ def: POTION, qty: 1, testEdge: 1 }, { def: POTION, qty: 1 })).toBe(false);
    expect(canStack({ def: POTION, qty: 1, testVeiled: true }, { def: POTION, qty: 1, testVeiled: true })).toBe(false);
  });

  it('names the item in events and the snapshot, and survives save and load', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [{ ...edged }] };
    const events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'equipped')[0]).toMatchObject({ item: HATCHET, name: '+1 Iron hatchet' });
    const damage = getStat(state, hero, 'damage').value;
    const loaded = deserialize(serialize(state));
    const again = getEntity(loaded, hero.id) as ActorEntity;
    expect(again.inventory?.equipped?.mainHand).toEqual(edged);
    expect(getStat(loaded, again, 'damage').value).toBe(damage);
    expect(checkInvariants(loaded)).toEqual([]);
  });
});

describe('origin', () => {
  const origin = { by: 'adv.test', run: 3, note: 'Carried down twice.' };

  it('never stacks, not even with the same origin', () => {
    expect(canStack({ def: POTION, qty: 1, origin }, { def: POTION, qty: 1 })).toBe(false);
    expect(canStack({ def: POTION, qty: 1, origin }, { def: POTION, qty: 1, origin: { ...origin } })).toBe(false);
  });

  it('keeps its origin through pickup, drop and equip, apart from plain items', () => {
    const { state, hero } = setup();
    const pos = { x: hero.pos.x, y: hero.pos.y };
    placeItem(state, hero.floor, pos, { def: HATCHET, qty: 1, origin });
    placeItem(state, hero.floor, pos, { def: POTION, qty: 1, origin });
    hero.inventory = { items: [{ def: POTION, qty: 1 }] };
    by(state, act(hero.id, { id: 'pickup' }));
    by(state, act(hero.id, { id: 'pickup' }));
    expect(hero.inventory.items).toEqual([
      { def: POTION, qty: 1 },
      { def: POTION, qty: 1, origin },
      { def: HATCHET, qty: 1, origin },
    ]);
    by(state, act(hero.id, { id: 'drop', index: 1 }));
    by(state, act(hero.id, { id: 'pickup' }));
    expect(hero.inventory.items[2]).toEqual({ def: POTION, qty: 1, origin });
    by(state, act(hero.id, { id: 'equip', index: 1 }));
    expect(hero.inventory.equipped?.mainHand).toEqual({ def: HATCHET, qty: 1, origin });
    // No name part, no bundle, no worth: only identity.
    expect(itemName(state, { def: HATCHET, qty: 1, origin }, hero)).toBe('Iron hatchet');
    expect(unitValue(state, { def: HATCHET, qty: 1, origin })).toBe(unitValue(state, { def: HATCHET, qty: 1 }));
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('the items.properties invariant', () => {
  it('flags unknown fields and values their kind rejects', () => {
    const { state, hero } = setup();
    hero.inventory = {
      items: [
        { def: POTION, qty: 1, origin: { run: -1 } },
        { def: POTION, qty: 1, testEdge: 9 },
        { def: POTION, qty: 1, mystery: 1 } as ItemInstance,
      ],
    };
    const problems = checkInvariants(state).join('\n');
    expect(problems).toContain('bad origin');
    expect(problems).toContain('bad testEdge');
    expect(problems).toContain('unknown field "mystery"');
  });
});
