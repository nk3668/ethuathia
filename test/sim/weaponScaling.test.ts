/**
 * Weapon scaling (ETH-082): each weapon type's damage scales with its own attribute (swords and
 * daggers Finesse, axes and maces Brawn, staves Wits; bare hands Brawn), through the derived item
 * property in `gearBundles`: stats and their tooltip parts, the wielder-weighted gear comparison,
 * the baseline's choice of weapon, and the snapshot's tooltip line. Fixed seeds, hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { GEAR_TYPE_INFO, UNARMED_ATTRIBUTE } from '../../src/content';
import {
  bestUpgrade,
  checkInvariants,
  compareGear,
  createRun,
  DAMAGE_FORMULA,
  gearBundles,
  gearStatsText,
  getEntity,
  getStat,
  ITEM_DERIVED_PROPERTIES,
  placeItem,
  snapshot,
  statValue,
  step,
  weaponScalesWith,
  weaponScaling,
  weaponScalingText,
} from '../../src/sim';
import type { ActorEntity, EntityId, RunState, SimEvent } from '../../src/sim';

// A Human Vanguard: Brawn 12, Finesse 10, Wits 5.
const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const HATCHET = 'item.iron_hatchet';
const SWORD = 'item.arming_sword';
const KNIFE = 'item.skinning_knife';
const STAFF = 'item.ashwood_staff';
const MACE = 'item.flanged_mace';

const ROOM = ['#########', '#@......#', '#.......#', '#########'];
const one = (def: string) => ({ def, qty: 1 });

/** A run with the hero, trained by `finesse` points of Finesse (14 with 4). */
function setup(finesse = 0, seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 1, floorText: ROOM, monsters: false }, seed);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  if (finesse !== 0 && hero.stats !== undefined) hero.stats.attributes = { finesse };
  return { state, hero };
}

function run(state: RunState, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('which attribute a weapon uses', () => {
  it('maps swords and daggers to Finesse, axes and maces to Brawn, staves to Wits, bare hands to Brawn', () => {
    expect(GEAR_TYPE_INFO.sword.scalesWith).toBe('finesse');
    expect(GEAR_TYPE_INFO.dagger.scalesWith).toBe('finesse');
    expect(GEAR_TYPE_INFO.axe.scalesWith).toBe('brawn');
    expect(GEAR_TYPE_INFO.mace.scalesWith).toBe('brawn');
    expect(GEAR_TYPE_INFO.staff.scalesWith).toBe('wits');
    expect(UNARMED_ATTRIBUTE).toBe('brawn');
    expect(DAMAGE_FORMULA.attribute).toBe(UNARMED_ATTRIBUTE);
    expect(weaponScalesWith(one(KNIFE))).toBe('finesse');
    expect(weaponScalesWith(one('item.quilted_jerkin'))).toBeNull();
    expect(weaponScalesWith(one('item.mending_draught'))).toBeNull();
    expect(ITEM_DERIVED_PROPERTIES.map((p) => p.id)).toEqual(['prop.weapon_scaling']);
  });
});

describe('damage', () => {
  it('uses the weapon’s attribute instead of Brawn, with tooltip parts for each', () => {
    const { state, hero } = setup(4);
    const unarmed = statValue(state, hero, 'damage');
    hero.inventory = { items: [], equipped: { mainHand: one(SWORD) } };
    const damage = getStat(state, hero, 'damage');
    // Sword +2, Finesse 14 (+2) in place of Brawn 12 (+1).
    expect(damage.value).toBe(unarmed + 3);
    expect(damage.parts).toContainEqual({ op: 'add', value: 2, source: { id: 'attribute.finesse', label: 'Finesse 14 (Arming sword)' } });
    expect(damage.parts).toContainEqual({ op: 'add', value: -1, source: { id: 'attribute.brawn', label: 'Brawn 12 (unused with Arming sword)' } });
    expect(damage.parts).toContainEqual({ op: 'add', value: 2, source: { id: SWORD, label: 'Arming sword' } });
    expect(checkInvariants(state)).toEqual([]);
  });

  it('follows the wielder’s attribute: Finesse matters with a sword, not with bare hands or an axe', () => {
    const plain = setup();
    const deft = setup(4);
    expect(statValue(deft.state, deft.hero, 'damage')).toBe(statValue(plain.state, plain.hero, 'damage'));
    for (const { hero } of [plain, deft]) hero.inventory = { items: [], equipped: { mainHand: one(HATCHET) } };
    expect(statValue(deft.state, deft.hero, 'damage')).toBe(statValue(plain.state, plain.hero, 'damage'));
    for (const { hero } of [plain, deft]) hero.inventory = { items: [], equipped: { mainHand: one(SWORD) } };
    expect(statValue(deft.state, deft.hero, 'damage')).toBe(statValue(plain.state, plain.hero, 'damage') + 2);
  });

  it('adds nothing for axes and maces, nor without a wearer with attributes', () => {
    const { state, hero } = setup(4);
    expect(gearBundles(state, hero, one(HATCHET))).toHaveLength(1);
    expect(gearBundles(state, hero, one(MACE))).toHaveLength(1);
    expect(gearBundles(state, hero, one(SWORD))).toHaveLength(3);
    expect(gearBundles(state, undefined, one(SWORD))).toHaveLength(1);
    const monster = { ...hero, adventurer: undefined, stats: hero.stats === undefined ? undefined : { ...hero.stats, attributes: undefined } };
    expect(weaponScaling(monster as ActorEntity, one(SWORD))).toBeNull();
  });

  it('can make a weapon worse for an unsuited wielder: a staff for a dim Vanguard', () => {
    const { state, hero } = setup();
    const s = weaponScaling(hero, one(STAFF));
    expect(s).toMatchObject({ attribute: 'wits', value: 5, unarmed: 'brawn', unarmedValue: 12, change: -3.5 });
    expect(weaponScalingText(hero, one(STAFF))).toBe('Damage scales with Wits 5 instead of Brawn 12: −3.5 damage');
    // Staff +1 damage, −3.5 from Wits: the worn-stats text nets them.
    expect(gearStatsText(state, hero, one(STAFF))).toBe('Damage −2.5, Evasion +1');
    expect(compareGear(state, hero, one(STAFF), null)).toBe('mixed');
  });
});

describe('choosing a weapon', () => {
  it('weighs a sword by the wielder’s Finesse', () => {
    const plain = setup();
    const deft = setup(4);
    // Sword: damage +2, accuracy +1. Hatchet: damage +2.
    expect(compareGear(plain.state, plain.hero, one(SWORD), one(HATCHET))).toBe('mixed');
    expect(compareGear(deft.state, deft.hero, one(SWORD), one(HATCHET))).toBe('better');
    deft.hero.inventory = { items: [one(HATCHET), one(SWORD)] };
    expect(bestUpgrade(deft.state, deft.hero)).toMatchObject({ index: 1, slot: 'mainHand' });
  });

  it('the baseline swaps a hatchet for a sword only when its Finesse makes the sword better', () => {
    for (const [finesse, swaps] of [
      [0, false],
      [4, true],
    ] as const) {
      const { state, hero } = setup(finesse);
      hero.inventory = { items: [], equipped: { mainHand: one(HATCHET) } };
      placeItem(state, 'd1', { x: 3, y: 1 }, one(SWORD));
      const events = run(state, 15);
      const equipped = events.filter((e) => e.type === 'equipped');
      expect(equipped.length > 0, `Finesse +${finesse}`).toBe(swaps);
      expect(hero.inventory.equipped?.mainHand).toEqual(one(swaps ? SWORD : HATCHET));
      if (swaps) {
        const trace = events.find((e) => e.type === 'ruleFired' && e.action === 'act.equip_upgrade');
        expect(trace?.type === 'ruleFired' ? trace.detail : '').toContain('Arming sword (Damage +3, Accuracy +1)');
      }
    }
  });
});

describe('the snapshot', () => {
  it('carries the wielder’s scaling line for weapons whose attribute changes their damage', () => {
    const { state, hero } = setup(4);
    hero.inventory = { items: [one(HATCHET), one(KNIFE)], equipped: { mainHand: one(SWORD) } };
    const view = snapshot(state).domains.items.members[hero.id];
    expect(view?.equipped[0]?.scaling).toBe('Damage scales with Finesse 14 instead of Brawn 12: +1 damage');
    expect(view?.items[0]?.scaling).toBeUndefined();
    expect(view?.items[1]?.scaling).toBe('Damage scales with Finesse 14 instead of Brawn 12: +1 damage');
  });
});
