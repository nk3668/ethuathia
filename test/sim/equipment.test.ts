/**
 * Equipment (ETH-043): gear defs and their validation, equipping and unequipping through the
 * actions, worn gear as a bundle source, the clear-upgrade comparison and the baseline putting on
 * clear upgrades (with a trace line). Fixed seeds and hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { EQUIP_SLOTS, GEAR_TYPE_INFO, gearSlot, ITEM_KIND, ITEMS } from '../../src/content';
import {
  bestUpgrade,
  checkInvariants,
  compareGear,
  createRun,
  deserialize,
  discoveriesOf,
  getEntity,
  getStat,
  modifierText,
  parseRequest,
  placeItem,
  serialize,
  snapshot,
  statValue,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, Command, EntityId, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const HATCHET = 'item.iron_hatchet';
const SWORD = 'item.arming_sword';
const MACE = 'item.flanged_mace';
const CUDGEL = 'item.oak_cudgel';
const JERKIN = 'item.quilted_jerkin';
const MAIL = 'item.riveted_mail';
const CAP = 'item.iron_cap';
const POTION = 'item.mending_draught';

const ROOM = ['#########', '#@......#', '#.......#', '#########'];

function setup(floorText = ROOM, seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 1, floorText, monsters: false }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });
const by = (state: RunState, ...commands: Command[]) => step(state, commands, { decide: waitDecide });
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const one = (def: string) => ({ def, qty: 1 });

function run(state: RunState, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('gear content', () => {
  it('gives every weapon and armor a gear type whose slot and category fit', () => {
    const gear = ITEMS.all().filter((d) => d.category === 'weapon' || d.category === 'armor');
    expect(gear.length).toBeGreaterThanOrEqual(8);
    for (const def of gear) {
      expect(def.gear, def.id).toBeDefined();
      const type = GEAR_TYPE_INFO[def.gear?.type ?? 'sword'];
      expect(type.category).toBe(def.category);
      expect(EQUIP_SLOTS).toContain(gearSlot(def));
      expect(def.bundle?.modifiers?.length ?? 0, def.id).toBeGreaterThan(0);
    }
    for (const def of ITEMS.all().filter((d) => d.gear === undefined)) expect(gearSlot(def)).toBeNull();
    // ETH-082 fills `scalesWith`; until then no type claims one.
    expect(Object.values(GEAR_TYPE_INFO).every((t) => t.scalesWith === undefined)).toBe(true);
  });

  it('rejects gear that is malformed', () => {
    const base = { ...ITEMS.get(HATCHET) };
    const parse = (def: object) => ITEM_KIND.schema.safeParse(def).success;
    expect(parse(base)).toBe(true);
    expect(parse({ ...base, gear: undefined })).toBe(false);
    expect(parse({ ...base, gear: { type: 'helm' } })).toBe(false);
    expect(parse({ ...base, gear: { type: 'wand' } })).toBe(false);
    expect(parse({ ...base, stack: 3 })).toBe(false);
    expect(parse({ ...base, bundle: { effects: [{ kind: 'heal', amount: 2 }] } })).toBe(false);
    expect(parse({ ...ITEMS.get(POTION), gear: { type: 'axe' } })).toBe(false);
  });
});

describe('equipping', () => {
  it('applies the item’s modifiers while worn, credited to it, and removes them when taken off', () => {
    const { state, hero } = setup();
    const before = statValue(state, hero, 'damage');
    hero.inventory = { items: [one(HATCHET), one(POTION)] };

    let events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'equipped')).toMatchObject([{ actor: hero.id, item: HATCHET, slot: 'mainHand', replaced: null }]);
    expect(hero.inventory.items).toEqual([one(POTION)]);
    expect(hero.inventory.equipped).toEqual({ mainHand: one(HATCHET) });
    expect(statValue(state, hero, 'damage')).toBe(before + 2);
    expect(getStat(state, hero, 'damage').parts).toContainEqual({ op: 'add', value: 2, source: { id: HATCHET, label: 'Iron hatchet' } });

    events = by(state, act(hero.id, { id: 'unequip', slot: 'mainHand' }));
    expect(ofType(events, 'unequipped')).toMatchObject([{ item: HATCHET, slot: 'mainHand' }]);
    expect(hero.inventory.equipped).toBeUndefined();
    expect(hero.inventory.items).toEqual([one(POTION), one(HATCHET)]);
    expect(statValue(state, hero, 'damage')).toBe(before);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('swaps what was worn back into the pack, leaves worn weight out of the pack, and survives a save', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(JERKIN), one(MAIL)] };
    by(state, act(hero.id, { id: 'equip', index: 0 }));
    const events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'equipped')).toMatchObject([{ item: MAIL, slot: 'body', replaced: JERKIN }]);
    expect(hero.inventory.items).toEqual([one(JERKIN)]);
    expect(hero.inventory.equipped).toEqual({ body: one(MAIL) });

    const view = snapshot(state).domains.items.members[hero.id];
    expect(view?.equipped).toEqual([{ slot: 'body', def: MAIL, weight: 14, value: 60 }]);
    // Worn gear doesn't count against Carry: only the jerkin in the pack does.
    expect(view?.weight).toBe(10);

    expect(deserialize(serialize(state))).toEqual(state);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('refuses what can’t be done', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(POTION)] };
    let events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toBe("Mending draught can't be worn");
    events = by(state, act(hero.id, { id: 'equip', index: 4 }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toBe('There is no such item in the pack');
    events = by(state, act(hero.id, { id: 'unequip', slot: 'head' }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toBe('Nothing is worn there');
    expect(parseRequest({ id: 'unequip', slot: 'tail' })).toContain('The slot must be one of mainHand');
  });

  it('flags worn gear in the wrong slot', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [], equipped: { head: one(HATCHET) } };
    expect(checkInvariants(state).join('\n')).toContain('not its slot');
  });

  it('marks gear as used in the Codex when put on', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(CAP)] };
    const events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'equipped').flatMap(discoveriesOf)).toEqual([{ id: CAP, mark: 'used' }]);
  });
});

describe('comparing gear', () => {
  it('calls an upgrade only what is at least as good in every stat', () => {
    expect(compareGear(one(HATCHET), null)).toBe('better');
    expect(compareGear(null, one(HATCHET))).toBe('worse');
    expect(compareGear(one(SWORD), one(HATCHET))).toBe('better');
    expect(compareGear(one(CUDGEL), one(HATCHET))).toBe('worse');
    expect(compareGear(one(HATCHET), one(HATCHET))).toBe('same');
    // More damage for less accuracy is a tradeoff, left to the player's rules.
    expect(compareGear(one(MACE), one(HATCHET))).toBe('mixed');
    expect(compareGear(one(MAIL), one(JERKIN))).toBe('mixed');
    expect(compareGear(one(MAIL), null)).toBe('mixed');
  });

  it('picks the candidate nothing else beats', () => {
    const { hero } = setup();
    hero.inventory = { items: [one(CUDGEL), one(HATCHET), one(SWORD), one(MACE)] };
    expect(bestUpgrade(hero)).toMatchObject({ index: 2, slot: 'mainHand', replaces: null });
    hero.inventory.equipped = { mainHand: one(SWORD) };
    hero.inventory.items = [one(CUDGEL), one(HATCHET), one(MACE)];
    expect(bestUpgrade(hero)).toBeNull();
  });

  it('words modifiers', () => {
    expect(modifierText({ stat: 'damage', op: 'add', value: 2 })).toBe('Damage +2');
    expect(modifierText({ stat: 'evasion', op: 'add', value: -1 })).toBe('Evasion −1');
    expect(modifierText({ stat: 'speed', op: 'mul', value: 1.1 })).toBe('Speed ×1.1');
  });
});

describe('the baseline with gear', () => {
  it('picks up gear it sees, puts on clear upgrades with a trace line, and leaves tradeoffs', () => {
    const { state, hero } = setup();
    placeItem(state, 'd1', { x: 4, y: 2 }, one(SWORD));
    placeItem(state, 'd1', { x: 6, y: 1 }, one(MACE));
    hero.inventory = { items: [], equipped: { body: one(JERKIN) } };
    const events = run(state, 20);

    expect(ofType(events, 'equipped')).toMatchObject([{ item: SWORD, slot: 'mainHand', replaced: null }]);
    expect(hero.inventory.equipped).toEqual({ body: one(JERKIN), mainHand: one(SWORD) });
    // The mace (more damage, less accuracy) is carried but not worn: a tradeoff.
    expect(hero.inventory.items).toEqual([one(MACE)]);
    const trace = ofType(events, 'ruleFired').find((e) => e.action === 'act.equip_upgrade');
    expect(trace?.detail).toContain('equipping the Arming sword (Damage +2, Accuracy +1)');
    // Settled: nothing else to put on, and no swapping back and forth.
    expect(ofType(run(state, 10), 'equipped')).toEqual([]);
  });

  it('upgrades step by step and never swaps back', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(CUDGEL), one(HATCHET)] };
    const events = run(state, 10);
    expect(ofType(events, 'equipped').map((e) => e.item)).toEqual([HATCHET]);
    expect(hero.inventory.equipped).toEqual({ mainHand: one(HATCHET) });
  });
});
