/**
 * Identification secrecy and curse safety for the idle player (ETH-142):
 * - all gear starts `identified: false`, so the flag never reveals what an item rolled
 * - the baseline waits to identify gear, or weighs its known gain against the hidden-property margin
 * - a locked slot is explained, and the turns cursed gear was worn are counted
 * - unknown scrolls are read-tested only when it is safe
 * - the Wits roll on pickup happens once per item instance
 */
import { describe, expect, it } from 'vitest';
import { BLESSING_INFO, ENCHANT_KEEN, ITEM_SCROLL_OF_IDENTIFY, ITEMS } from '../../src/content';
import { Rng } from '../../src/core';
import {
  addToStacks,
  canStack,
  checkInvariants,
  chooseRule,
  createRun,
  CURSE_LOCK_PREMIUM,
  evaluateUpgrade,
  getEntity,
  hiddenGearMargin,
  LOOT_CURSE_CHANCE,
  placeItem,
  rollItemProperties,
  secretGear,
  snapshot,
  spawnMonster,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActorEntity, AiActor, EntityId, ItemInstance, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const HATCHET = 'item.iron_hatchet';
const SWORD = 'item.arming_sword';
const JERKIN = 'item.quilted_jerkin';
const SCROLL_ID = ITEM_SCROLL_OF_IDENTIFY.id;
const SCROLL_UNCURSE = 'item.scroll_of_uncursing';
const ROOM = ['#########', '#@......#', '#.......#', '#########'];
const ROOM_STAIRS = ['#########', '#@.>....#', '#.......#', '#########'];

function setup(floorText = ROOM, seed = 5): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 2, floorTexts: [floorText, ROOM], monsters: false }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

/** One idle step first, so the party has looked around and remembers the stairs. */
const look = (state: RunState) => step(state, [], { decide: waitDecide });
const choose = (state: RunState, hero: ActorEntity) => chooseRule({ state, actor: hero as AiActor });
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe('gear secrecy (ETH-142)', () => {
  it('flags every piece of gear identified: false, whatever it rolled', () => {
    const gear = ITEMS.all().filter((d) => d.gear !== undefined);
    expect(gear.length).toBeGreaterThan(10);
    const rng = Rng.seeded(42, 'secrecy-guard');
    let plain = 0;
    let rolled = 0;
    for (const def of gear) {
      for (let depth = 1; depth <= 10; depth++) {
        for (let i = 0; i < 40; i++) {
          const props = rollItemProperties(def, depth, rng);
          expect(props.identified, `${def.id} at depth ${depth}`).toBe(false);
          if (props.enchant === undefined && props.blessing === undefined && props.enchantments === undefined) plain++;
          else rolled++;
        }
      }
    }
    // Both kinds exist, so the flag cannot be telling them apart.
    expect(plain).toBeGreaterThan(0);
    expect(rolled).toBeGreaterThan(0);
  });

  it('shows the same flag and note for a plain item and one with hidden properties', () => {
    const variants: ItemInstance[] = [
      { def: SWORD, qty: 1, identified: false },
      { def: SWORD, qty: 1, enchant: -2, blessing: 'cursed', identified: false },
      { def: SWORD, qty: 1, enchant: 3, blessing: 'blessed', enchantments: [{ id: ENCHANT_KEEN.id, level: 2 }], identified: false },
    ];
    const views = variants.map((variant) => {
      const { state, hero } = setup();
      hero.inventory = { items: [variant] };
      const view = snapshot(state).domains.items.members[hero.id]?.items[0];
      return { unidentified: view?.unidentified, note: view?.stateNote, name: view?.name };
    });
    expect(views[0]?.unidentified).toBe(true);
    for (const v of views) expect(v).toEqual(views[0]);
  });

  it('logs that identifying a plain piece of gear found no enchantment or curse', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [{ def: SWORD, qty: 1, identified: false }] };
    const events = step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'equip', index: 0 } }], { decide: waitDecide });
    expect(ofType(events, 'itemIdentified')).toMatchObject([{ item: SWORD, method: 'equip', plain: true }]);
    expect(hero.inventory.equipped?.mainHand?.identified).toBeUndefined();
  });

  it('marks gear a monster carried unidentified when it drops it, and leaves other items alone', () => {
    expect(secretGear({ def: SWORD, qty: 1 })).toEqual({ def: SWORD, qty: 1, identified: false });
    expect(secretGear({ def: SWORD, qty: 1, enchant: 2, identified: false })).toEqual({ def: SWORD, qty: 1, enchant: 2, identified: false });
    expect(secretGear({ def: 'item.mending_draught', qty: 1 })).toEqual({ def: 'item.mending_draught', qty: 1 });
  });
});

describe('the hidden-gear margin (ETH-142)', () => {
  it('matches what rollItemProperties actually rolls (no specials at depth 1)', () => {
    const def = ITEMS.get(HATCHET);
    const rng = Rng.seeded(9, 'margin-mc');
    let total = 0;
    const n = 40000;
    for (let i = 0; i < n; i++) {
      const p = rollItemProperties(def, 1, rng);
      total += (p.enchant ?? 0) + (p.blessing === undefined ? 0 : BLESSING_INFO[p.blessing].gearDelta);
    }
    const { expected, curseRisk, margin } = hiddenGearMargin(def, 1);
    expect(Math.abs(total / n - expected)).toBeLessThan(0.04);
    expect(curseRisk).toBeCloseTo(CURSE_LOCK_PREMIUM * LOOT_CURSE_CHANCE * 2.25, 6);
    expect(margin).toBeCloseTo(Math.max(expected, 0) + curseRisk, 6);
  });

  it('grows with depth as better enchantments and specials become possible', () => {
    const def = ITEMS.get(HATCHET);
    expect(hiddenGearMargin(def, 6).expected).toBeGreaterThan(hiddenGearMargin(def, 1).expected);
  });
});

describe('baseline gear gate (ETH-142)', () => {
  it('puts on unidentified gear whose known gain beats the margin and says why', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [{ def: HATCHET, qty: 1, enchant: -2, blessing: 'cursed', identified: false }] };
    const choice = choose(state, hero);
    expect(choice?.action).toBe('act.equip_upgrade');
    const { margin } = hiddenGearMargin(ITEMS.get(HATCHET), 1);
    expect(choice?.detail).toContain('unidentified, but gain +2 vs margin');
    expect(choice?.detail).toContain(`margin ${Number(margin.toFixed(2))}`);
    expect(choice?.detail).toContain('curse lock risk');
  });

  it('leaves unidentified gear in the pack when its gain does not beat the margin, with a stable note', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [{ def: JERKIN, qty: 1, identified: false }] };
    const first = choose(state, hero);
    expect(first?.action).not.toBe('act.equip_upgrade');
    expect(first?.skipped?.join(' ')).toContain("isn't worth the risk");
    // The same text a turn later (nothing changed), so repeated trace lines collapse.
    state.turn += 5;
    expect(choose(state, hero)?.skipped).toEqual(first?.skipped);
    // A plain identified jerkin of the same gain is simply put on.
    hero.inventory = { items: [{ def: JERKIN, qty: 1 }] };
    expect(choose(state, hero)?.action).toBe('act.equip_upgrade');
  });

  it('never decides differently for different hidden properties', () => {
    const variants: ItemInstance[] = [
      { def: JERKIN, qty: 1, identified: false },
      { def: JERKIN, qty: 1, enchant: 3, blessing: 'blessed', identified: false },
      { def: JERKIN, qty: 1, enchant: -2, blessing: 'cursed', identified: false },
    ];
    const verdicts = variants.map((variant) => {
      const { state, hero } = setup();
      hero.inventory = { items: [variant] };
      return evaluateUpgrade(state, hero, variant);
    });
    for (const v of verdicts) expect(v).toEqual(verdicts[0]);
  });

  it('waits to identify first while it carries a known Scroll of Identify', () => {
    const { state, hero } = setup();
    state.domains.items.identifiedTypes.push(SCROLL_ID);
    const sword: ItemInstance = { def: HATCHET, qty: 1, identified: false };
    hero.inventory = { items: [{ def: SCROLL_ID, qty: 1 }, sword] };
    const verdict = evaluateUpgrade(state, hero, sword);
    expect(verdict.slot).toBeNull();
    expect(verdict.held).toContain('a Scroll of identify will name it first');
    // And the baseline reads the scroll rather than wearing the unknown weapon.
    expect(choose(state, hero)?.action).toBe('act.use_identify');
  });
});

describe('locked slots (ETH-142)', () => {
  it('explains a locked slot in the trace and on the party card, and counts the turns', () => {
    const { state, hero } = setup();
    hero.inventory = {
      items: [{ def: SWORD, qty: 1 }],
      equipped: { mainHand: { def: HATCHET, qty: 1, enchant: -2, blessing: 'cursed' } },
    };
    const choice = choose(state, hero);
    expect(choice?.skipped?.join(' ')).toMatch(/main hand slot is locked by the cursed .*Hatchet.*Scroll of Uncursing/i);

    const worn = snapshot(state).domains.items.members[hero.id]?.equipped[0];
    expect(worn?.locked).toContain('slot is locked');

    for (let i = 0; i < 5; i++) step(state, [], { decide: waitDecide });
    const tracked = state.domains.run.trackers['track.cursedGear'] as { turns: number };
    expect(tracked.turns).toBeGreaterThanOrEqual(4);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('counts nothing while no cursed gear is worn', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [], equipped: { mainHand: { def: HATCHET, qty: 1 } } };
    for (let i = 0; i < 5; i++) step(state, [], { decide: waitDecide });
    expect((state.domains.run.trackers['track.cursedGear'] as { turns: number }).turns).toBe(0);
  });
});

describe('testing unknown scrolls (ETH-142)', () => {
  const unknownScroll: ItemInstance = { def: SCROLL_UNCURSE, qty: 1, identified: false };

  it('reads an unknown scroll when safe and learns its type', () => {
    const { state, hero } = setup(ROOM_STAIRS);
    hero.inventory = { items: [{ ...unknownScroll }] };
    look(state);
    const choice = choose(state, hero);
    expect(choice?.action).toBe('act.read_unknown_scroll');
    expect(choice?.detail).toContain('to learn what it does');
    const events = step(state, []);
    expect(ofType(events, 'used')).toMatchObject([{ item: SCROLL_UNCURSE }]);
    expect(state.domains.items.identifiedTypes).toContain(SCROLL_UNCURSE);
  });

  it('does not read it with an enemy in sight, when hurt, or with no way out known', () => {
    const withEnemy = setup(ROOM_STAIRS);
    withEnemy.hero.inventory = { items: [{ ...unknownScroll }] };
    look(withEnemy.state);
    spawnMonster(withEnemy.state, 'monster.gloam_rat', 'd1', { x: 6, y: 2 });
    expect(choose(withEnemy.state, withEnemy.hero)?.action).not.toBe('act.read_unknown_scroll');

    const hurt = setup(ROOM_STAIRS);
    hurt.hero.inventory = { items: [{ ...unknownScroll }] };
    look(hurt.state);
    hurt.hero.actor.hp = 2;
    expect(choose(hurt.state, hurt.hero)?.action).not.toBe('act.read_unknown_scroll');

    const noStairs = setup(ROOM);
    noStairs.hero.inventory = { items: [{ ...unknownScroll }] };
    expect(choose(noStairs.state, noStairs.hero)?.action).not.toBe('act.read_unknown_scroll');
  });
});

describe('one Wits roll per item instance (ETH-142)', () => {
  it('cannot farm identification by dropping and picking an item up again', () => {
    const { state, hero } = setup();
    if (hero.stats !== undefined) hero.stats.attributes = { wits: -5 };
    placeItem(state, 'd1', hero.pos, { def: HATCHET, qty: 1, enchant: 1, identified: false });
    const pick = (): SimEvent[] => step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'pickup' } }], { decide: waitDecide });
    expect(ofType(pick(), 'itemIdentified')).toEqual([]);
    expect(hero.inventory?.items[0]?.identifyTried).toBe(true);

    // With every roll now certain to succeed, the item is still never rerolled.
    if (hero.stats !== undefined) hero.stats.attributes = { wits: 40 };
    for (let i = 0; i < 12; i++) {
      step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'drop', index: 0 } }], { decide: waitDecide });
      expect(ofType(pick(), 'itemIdentified')).toEqual([]);
    }
    expect(hero.inventory?.items[0]?.identified).toBe(false);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('does not change how items stack, and a merge never claims a roll that was not made', () => {
    const tried: ItemInstance = { def: 'item.mending_draught', qty: 1, identified: false, identifyTried: true };
    const fresh: ItemInstance = { def: 'item.mending_draught', qty: 1, identified: false };
    expect(canStack(tried, fresh)).toBe(true);
    expect(canStack(fresh, tried)).toBe(true);
    const stacks: ItemInstance[] = [{ ...tried }];
    addToStacks(stacks, fresh);
    expect(stacks).toEqual([{ def: 'item.mending_draught', qty: 2, identified: false }]);
    const both: ItemInstance[] = [{ ...tried }];
    addToStacks(both, { ...tried });
    expect(both[0]?.identifyTried).toBe(true);
  });
});
