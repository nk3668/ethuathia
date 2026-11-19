/**
 * Equipment (ETH-043): gear defs and their validation, equipping and unequipping through the
 * actions, worn gear as a bundle source, the clear-upgrade comparison and the baseline putting on
 * clear upgrades (with a trace line). Fixed seeds and hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { EQUIP_SLOTS, GEAR_TYPE_INFO, gearSlots, ITEM_KIND, ITEMS } from '../../src/content';
import {
  bestUpgrade,
  upgradeSlot,
  wantsItem,
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
  it('gives every weapon, armor and jewelry a gear type whose slots and category fit', () => {
    const gear = ITEMS.all().filter((d) => d.category === 'weapon' || d.category === 'armor' || d.category === 'jewelry');
    expect(gear.length).toBeGreaterThanOrEqual(8);
    for (const def of gear) {
      expect(def.gear, def.id).toBeDefined();
      const type = GEAR_TYPE_INFO[def.gear?.type ?? 'sword'];
      expect(type.category).toBe(def.category);
      expect(gearSlots(def).length).toBeGreaterThan(0);
      for (const slot of gearSlots(def)) expect(EQUIP_SLOTS).toContain(slot);
      expect(def.bundle?.modifiers?.length ?? 0, def.id).toBeGreaterThan(0);
    }
    // Every slot is fitted by some gear type, and a ring fits either ring slot.
    for (const slot of EQUIP_SLOTS) expect(Object.values(GEAR_TYPE_INFO).some((t) => t.slots.includes(slot)), slot).toBe(true);
    expect(GEAR_TYPE_INFO.ring.slots).toEqual(['ring1', 'ring2']);
    expect(gear.some((d) => d.gear?.type === 'ring') && gear.some((d) => d.gear?.type === 'amulet')).toBe(true);
    for (const def of ITEMS.all().filter((d) => d.gear === undefined)) expect(gearSlots(def)).toEqual([]);
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
    expect(view?.equipped).toEqual([{ slot: 'body', def: MAIL, name: 'Riveted mail', weight: 14, value: 60 }]);
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
    expect(checkInvariants(state).join('\n')).toContain('not one of its slots');
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
    const { state } = setup();
    expect(compareGear(state, undefined, one(HATCHET), null)).toBe('better');
    expect(compareGear(state, undefined, null, one(HATCHET))).toBe('worse');
    expect(compareGear(state, undefined, one(SWORD), one(HATCHET))).toBe('better');
    expect(compareGear(state, undefined, one(CUDGEL), one(HATCHET))).toBe('worse');
    expect(compareGear(state, undefined, one(HATCHET), one(HATCHET))).toBe('same');
    // More damage for less accuracy is a tradeoff, left to the player's rules.
    expect(compareGear(state, undefined, one(MACE), one(HATCHET))).toBe('mixed');
    expect(compareGear(state, undefined, one(MAIL), one(JERKIN))).toBe('mixed');
    expect(compareGear(state, undefined, one(MAIL), null)).toBe('mixed');
  });

  it('picks the candidate nothing else beats', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(CUDGEL), one(HATCHET), one(SWORD), one(MACE)] };
    expect(bestUpgrade(state, hero)).toMatchObject({ index: 2, slot: 'mainHand', replaces: null });
    hero.inventory.equipped = { mainHand: one(SWORD) };
    hero.inventory.items = [one(CUDGEL), one(HATCHET), one(MACE)];
    expect(bestUpgrade(state, hero)).toBeNull();
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

describe('gear and the Carry limit', () => {
  it('puts on an upgrade before dropping anything when overloaded, and wants upgrades even when full', () => {
    const { state, hero } = setup();
    const carry = statValue(state, hero, 'carry');
    hero.inventory = { items: [] };
    // Potions up to the limit, then a jerkin on top: overloaded.
    while (hero.inventory.items.length * 5 + 5 <= carry) hero.inventory.items.push({ def: POTION, qty: 5 });
    hero.inventory.items.push(one(JERKIN));
    expect(compareGear(state, undefined, one(JERKIN), null)).toBe('better');
    // Full: a biscuit is not wanted, but an upgrade still is.
    expect(wantsItem(state, hero, { def: 'item.trail_biscuit', qty: 1 })).toBe(false);
    expect(wantsItem(state, hero, one(CAP))).toBe(true);
    const events = run(state, 3);
    expect(ofType(events, 'ruleFired')[0]).toMatchObject({ condition: 'cond.overloaded', action: 'act.equip_upgrade' });
    expect(ofType(events, 'dropped')).toEqual([]);
    expect(hero.inventory.equipped?.body).toEqual(one(JERKIN));
  });
});

describe('rings and amulets (ETH-111)', () => {
  const BAND = 'item.copper_band';
  const SIGNET = 'item.garnet_signet';
  const OWL = 'item.owl_eye_ring';
  const PENDANT = 'item.knotwork_pendant';

  it('fit either ring slot; the equip action fills an empty one first, or the slot asked for', () => {
    const { state, hero } = setup();
    const hp = statValue(state, hero, 'hp');
    hero.inventory = { items: [one(BAND), one(OWL), one(SIGNET)] };
    let events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'equipped')).toMatchObject([{ item: BAND, slot: 'ring1', replaced: null }]);
    events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'equipped')).toMatchObject([{ item: OWL, slot: 'ring2', replaced: null }]);
    expect(statValue(state, hero, 'hp')).toBe(hp + 3);
    // Both full: the slot asked for, or else the first.
    events = by(state, act(hero.id, { id: 'equip', index: 0, slot: 'ring2' }));
    expect(ofType(events, 'equipped')).toMatchObject([{ item: SIGNET, slot: 'ring2', replaced: OWL }]);
    expect(hero.inventory.equipped).toEqual({ ring1: one(BAND), ring2: one(SIGNET) });
    expect(statValue(state, hero, 'hp')).toBe(hp + 6);

    events = by(state, act(hero.id, { id: 'equip', index: 0, slot: 'neck' }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toBe("Owl-eye ring can't be worn there");
    expect(checkInvariants(state)).toEqual([]);
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('flags a ring worn at the neck', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [], equipped: { neck: one(BAND) } };
    expect(checkInvariants(state).join('\n')).toContain('not one of its slots');
  });

  it('auto-equip fills empty ring slots first, with the slot in the trace', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(BAND), one(OWL), one(PENDANT)] };
    const events = run(state, 10);
    expect(ofType(events, 'equipped').map((e) => [e.item, e.slot])).toEqual([
      [PENDANT, 'neck'],
      [BAND, 'ring1'],
      [OWL, 'ring2'],
    ]);
    expect(hero.inventory.items).toEqual([]);
    const trace = ofType(events, 'ruleFired').filter((e) => e.action === 'act.equip_upgrade');
    expect(trace[1]?.detail).toContain('equipping the Copper band (Max HP +3) (left ring), nothing worn there yet');
  });

  it('auto-equip replaces the weaker ring once both are full, and settles', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(SIGNET)], equipped: { ring1: one(SIGNET), ring2: one(BAND) } };
    expect(upgradeSlot(state, hero, one(SIGNET))).toBe('ring2');
    const events = run(state, 10);
    expect(ofType(events, 'equipped')).toMatchObject([{ item: SIGNET, slot: 'ring2', replaced: BAND }]);
    expect(hero.inventory.equipped).toEqual({ ring1: one(SIGNET), ring2: one(SIGNET) });
    expect(hero.inventory.items).toEqual([one(BAND)]);
  });

  it('leaves a ring with a tradeoff against both worn ones', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [one(OWL)], equipped: { ring1: one(SIGNET), ring2: one(BAND) } };
    expect(upgradeSlot(state, hero, one(OWL))).toBeNull();
    expect(bestUpgrade(state, hero)).toBeNull();
  });
});
