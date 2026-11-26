/**
 * The items domain (ETH-061): item instances and stacking, the pickup / drop / use actions, the
 * loot generation step, the party's item memory, and the baseline picking up, dropping when
 * overloaded and quaffing healing. Fixed seeds and hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { FLOOR_HALLS, ITEM_GOLD, ITEMS } from '../../src/content';
import {
  addToStacks,
  canStack,
  carryLimit,
  carryWeight,
  checkInvariants,
  createRun,
  deserialize,
  generateFloor,
  getEntity,
  itemsAt,
  itemValue,
  lootTable,
  placeItem,
  serialize,
  snapshot,
  statValue,
  step,
  waitDecide,
  wantsItem,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, Command, EntityId, ItemInstance, RunState, SimEvent } from '../../src/sim';
import { Rng } from '../../src/core';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const POTION = 'item.mending_draught';
const HATCHET = 'item.iron_hatchet';
const JERKIN = 'item.quilted_jerkin';
const NAIL = 'item.bent_nail';
const BISCUIT = 'item.trail_biscuit';

/** A closed room: the hero sees all of it from the start, so nothing is left to explore. */
const ROOM = ['#########', '#@......#', '#.......#', '#########'];

function setup(floorText = ROOM, seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 1, floorText }, seed);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  // Start bare-handed: the Vanguard's class kit (ETH-176) is covered by classKit.test.ts.
  Reflect.deleteProperty(hero, 'inventory');
  return { state, hero };
}

const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });
const by = (state: RunState, ...commands: Command[]) => step(state, commands, { decide: waitDecide });
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

function run(state: RunState, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('item content', () => {
  it('has starter items of every kind the baseline cares about, including a healing potion', () => {
    const categories = new Set(ITEMS.all().map((d) => d.category));
    for (const c of ['potion', 'scroll', 'food', 'weapon', 'armor', 'gold', 'junk']) expect(categories).toContain(c);
    expect(ITEMS.get(POTION).bundle?.effects).toEqual([{ kind: 'heal', amount: 12 }]);
  });

  it('draws loot only from items allowed at the depth', () => {
    expect(lootTable(1).map((d) => d.id)).not.toContain('item.quickstep_tonic');
    expect(lootTable(2).map((d) => d.id)).toContain('item.quickstep_tonic');
  });
});

describe('item instances', () => {
  it('stack only with equal fields, up to the stack size', () => {
    const stacks: ItemInstance[] = [];
    addToStacks(stacks, { def: POTION, qty: 4 });
    addToStacks(stacks, { def: POTION, qty: 3 });
    expect(stacks).toEqual([{ def: POTION, qty: 5 }, { def: POTION, qty: 2 }]);
    addToStacks(stacks, { def: HATCHET, qty: 1 });
    addToStacks(stacks, { def: HATCHET, qty: 1 });
    expect(stacks.filter((s) => s.def === HATCHET)).toHaveLength(2);
    // A field a later item adds (an enchantment) keeps otherwise equal items apart.
    expect(canStack({ def: POTION, qty: 1 }, { def: POTION, qty: 2 })).toBe(true);
    expect(canStack({ def: POTION, qty: 1 }, { def: POTION, qty: 1, enchant: 1 } as ItemInstance)).toBe(false);
  });

  it('are valued by one function: the def value times the quantity', () => {
    const { state } = setup();
    expect(itemValue(state, { def: POTION, qty: 3 })).toBe(90);
  });
});

describe('the item actions', () => {
  it('pick up, drop and use, with events, and survive a save', () => {
    const { state, hero } = setup();
    placeItem(state, 'd1', hero.pos, { def: POTION, qty: 2 });
    let events = by(state, act(hero.id, { id: 'pickup' }));
    expect(ofType(events, 'pickedUp')).toMatchObject([{ actor: hero.id, item: POTION, qty: 2, value: 60, floor: 'd1' }]);
    expect(hero.inventory?.items).toEqual([{ def: POTION, qty: 2 }]);
    expect(itemsAt(state, 'd1', hero.pos)).toEqual([]);

    hero.actor.hp = 5;
    events = by(state, act(hero.id, { id: 'use', index: 0 }));
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['used', 'healed']));
    // 5 + 12 from the potion, plus any natural recovery (ETH-060) at the end of the turn.
    const recovered = ofType(events, 'recovered').reduce((n, e) => n + e.amount, 0);
    expect(hero.actor.hp).toBe(Math.min(17 + recovered, statValue(state, hero, 'hp')));
    expect(hero.inventory?.items).toEqual([{ def: POTION, qty: 1 }]);

    events = by(state, act(hero.id, { id: 'drop', index: 0 }));
    expect(ofType(events, 'dropped')).toMatchObject([{ item: POTION, qty: 1 }]);
    expect(hero.inventory?.items).toEqual([]);
    expect(itemsAt(state, 'd1', hero.pos).map((e) => e.item)).toEqual([{ def: POTION, qty: 1 }]);

    const copy = deserialize(serialize(state));
    expect(copy).toEqual(state);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('put gold in the purse, not the pack', () => {
    const { state, hero } = setup();
    placeItem(state, 'd1', hero.pos, { def: ITEM_GOLD.id, qty: 14 });
    const events = by(state, act(hero.id, { id: 'pickup' }));
    expect(ofType(events, 'goldPickedUp')).toMatchObject([{ amount: 14 }]);
    expect(state.domains.items.gold).toBe(14);
    expect(hero.inventory).toBeUndefined();
    expect(snapshot(state).domains.items.gold).toBe(14);
  });

  it('refuse what can’t be done', () => {
    const { state, hero } = setup();
    let events = by(state, act(hero.id, { id: 'pickup' }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toBe('There is nothing here to pick up');
    placeItem(state, 'd1', hero.pos, { def: HATCHET, qty: 1 });
    by(state, act(hero.id, { id: 'pickup' }));
    events = by(state, act(hero.id, { id: 'use', index: 0 }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toBe("Iron hatchet can't be used");
    events = by(state, act(hero.id, { id: 'drop', index: 3 }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toBe('There is no such item in the pack');
  });
});

describe('loot generation', () => {
  it('places items on free floor tiles from the loot RNG alone, never moving the layout', () => {
    const type = FLOOR_HALLS;
    const a = generateFloor(type, new Rng([1, 2, 3, 4]), { depth: 3, loot: new Rng([5, 6, 7, 8]) });
    const b = generateFloor(type, new Rng([1, 2, 3, 4]), { depth: 3, loot: new Rng([9, 9, 9, 9]) });
    expect(Array.from(a.terrain.cells)).toEqual(Array.from(b.terrain.cells));
    expect(a.features).toEqual(b.features);
    expect(a.items?.length).toBeGreaterThanOrEqual(5);
    expect(a.items?.length).toBeLessThanOrEqual(8);
    const taken = new Set(a.features.map((f) => `${f.pos.x},${f.pos.y}`));
    for (const { pos, item } of a.items ?? []) {
      expect(a.terrain.get(pos.x, pos.y)).toBe(1);
      expect(taken.has(`${pos.x},${pos.y}`)).toBe(false);
      expect(ITEMS.has(item.def)).toBe(true);
    }
  });

  it('fills generated floors, and the same seed gives the same loot', () => {
    const a = createRun({ party: [HERO] }, 3);
    const b = createRun({ party: [HERO] }, 3);
    const loot = (s: RunState) => Object.values(s.entities).flatMap((e) => (e.item ? [[e.pos, e.item]] : []));
    expect(loot(a).length).toBeGreaterThan(0);
    expect(loot(a)).toEqual(loot(b));
  });
});

describe('the baseline with items', () => {
  it('walks to a wanted item it has seen and picks it up, but leaves junk', () => {
    const { state, hero } = setup();
    placeItem(state, 'd1', { x: 6, y: 2 }, { def: POTION, qty: 1 });
    placeItem(state, 'd1', { x: 3, y: 2 }, { def: NAIL, qty: 1 });
    const events = run(state, 10);
    expect(ofType(events, 'itemSighted').map((e) => e.item).sort()).toEqual([NAIL, POTION].sort());
    expect(ofType(events, 'pickedUp').map((e) => e.item)).toEqual([POTION]);
    expect(hero.inventory?.items).toEqual([{ def: POTION, qty: 1 }]);
    expect(itemsAt(state, 'd1', { x: 3, y: 2 })).toHaveLength(1);
    expect(ofType(events, 'ruleFired').some((e) => e.action === 'act.pick_up' && e.detail.includes('Mending draught'))).toBe(true);
  });

  it('leaves items further than the detour', () => {
    const LONG = ['##############################', '#@...........................#', '##############################'];
    const { state, hero } = setup(LONG);
    placeItem(state, 'd1', { x: 25, y: 1 }, { def: POTION, qty: 1 });
    run(state, 3);
    expect(hero.inventory).toBeUndefined();
  });

  it('drops the least valuable thing when overloaded, and does not pick it up again', () => {
    const { state, hero } = setup();
    const carry = carryLimit(state, hero);
    // Fill the pack to just under the limit with jerkins, then offer a hatchet worth more. The hero
    // already wears both (ETH-043), so neither is an upgrade to put on.
    hero.inventory = { items: [], equipped: { body: { def: JERKIN, qty: 1 }, mainHand: { def: HATCHET, qty: 1 } } };
    while (carryWeight(state, hero) + 10 <= carry) hero.inventory.items.push({ def: JERKIN, qty: 1 });
    hero.inventory.items.push({ def: BISCUIT, qty: 1 });
    const spare = carry - carryWeight(state, hero);
    expect(spare).toBeLessThan(6);
    placeItem(state, 'd1', hero.pos, { def: HATCHET, qty: 1 });
    expect(wantsItem(state, hero, { def: HATCHET, qty: 1 })).toBe(true);

    const events = run(state, 12);
    // The biscuit goes first, then a jerkin; with the jerkin gone the biscuit fits again.
    expect(ofType(events, 'pickedUp').map((e) => e.item)).toEqual([HATCHET, BISCUIT]);
    expect(ofType(events, 'dropped').map((e) => e.item)).toEqual([BISCUIT, JERKIN]);
    expect(carryWeight(state, hero)).toBeLessThanOrEqual(carry);
    expect(hero.inventory.items.some((i) => i.def === HATCHET)).toBe(true);
    expect(ofType(events, 'stuck')).toEqual([]);
    // Settled: the dropped jerkin is not wanted back.
    const later = run(state, 10);
    expect([...ofType(later, 'pickedUp'), ...ofType(later, 'dropped')]).toEqual([]);
  });

  it('quaffs healing at low HP, and only then', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [{ def: POTION, qty: 2 }] };
    let events = run(state, 2);
    expect(ofType(events, 'used')).toEqual([]);
    const max = statValue(state, hero, 'hp');
    hero.actor.hp = Math.floor(max * 0.2);
    events = run(state, 1);
    expect(ofType(events, 'used')).toMatchObject([{ actor: hero.id, item: POTION }]);
    expect(ofType(events, 'ruleFired')[0]).toMatchObject({ action: 'act.quaff_healing', condition: 'cond.needs_healing' });
    expect(hero.inventory.items).toEqual([{ def: POTION, qty: 1 }]);
  });
});

describe('the snapshot', () => {
  it('shows each member’s pack and the items on the shown floor, remembered ones too', () => {
    const { state, hero } = setup(['###########', '#@..+.....#', '###########']);
    hero.inventory = { items: [{ def: POTION, qty: 2 }] };
    placeItem(state, 'd1', { x: 2, y: 1 }, { def: BISCUIT, qty: 1 });
    placeItem(state, 'd1', { x: 8, y: 1 }, { def: HATCHET, qty: 1 });
    const snap = snapshot(state);
    expect(snap.domains.items.members[hero.id]).toMatchObject({
      items: [{ def: POTION, qty: 2, weight: 2, value: 60, usable: true }],
      weight: 2,
      carry: carryLimit(state, hero),
    });
    // Behind the closed door: never seen, so not shown.
    expect(snap.domains.items.floor).toEqual([{ pos: { x: 2, y: 1 }, def: BISCUIT, qty: 1, visible: true }]);
  });
});
