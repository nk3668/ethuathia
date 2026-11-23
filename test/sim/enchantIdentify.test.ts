/**
 * Enchantment, blessed/cursed beatitude and identification (ETH-044):
 * - loot RNG rolls enchant, blessing, special enchantments and unidentified state deterministically
 * - base +N/-N and special ENCHANTMENTS (modifiers & hit triggers) feed getStat, fireTrigger, value, name & stacking
 * - cursed gear blocks unequip and replacement until uncursed via { kind: 'uncurse' } (Scroll of Uncursing)
 * - blessed/cursed consumables scale runEffects potency (1.5x / 0.5x)
 * - unidentified potions, scrolls & jewelry use per-run seeded appearances; weapons/armor hide +N/curse/enchantments
 * - Wits `identify` stat rolls on pickup; use-ID remembers type for the run; wear-ID reveals curses; Scroll of Identify works
 * - honest baseline AI handles unknown potions when critical, avoids known curses, and reads Identify/Uncursing scrolls
 */
import { describe, expect, it } from 'vitest';
import {
  ENCHANT_HONED,
  ENCHANT_KEEN,
  ENCHANT_VAMPIRIC,
  ENCHANT_VENOMOUS,
  FLOOR_HALLS,
  ITEM_SCROLL_OF_IDENTIFY,
  ITEM_SCROLL_OF_UNCURSING,
  ITEMS,
} from '../../src/content';
import { Rng } from '../../src/core';
import {
  appearanceName,
  bestUpgrade,
  canStack,
  carriesHealingPotion,
  checkInvariants,
  chooseRule,
  compareGear,
  createRun,
  deserialize,
  discoveriesOf,
  generateFloor,
  getEntity,
  getStat,
  ITEMS_CHRONICLE,
  itemName,
  itemValue,
  placeItem,
  rollItemProperties,
  serialize,
  snapshot,
  spawnMonster,
  statValue,
  step,
  upgradeSlot,
  waitDecide,
  wantsItem,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, AiActor, Command, EntityId, ItemInstance, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const HATCHET = 'item.iron_hatchet';
const SWORD = 'item.arming_sword';
const POTION = 'item.mending_draught';
const BAND = 'item.copper_band';
const SCROLL_ID = ITEM_SCROLL_OF_IDENTIFY.id;
const SCROLL_UNCURSE = ITEM_SCROLL_OF_UNCURSING.id;
const ROOM = ['#########', '#@......#', '#.......#', '#########'];

function setup(seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 1, floorText: ROOM, monsters: false }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });
const by = (state: RunState, ...commands: Command[]) => step(state, commands, { decide: waitDecide });
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe('loot property rolling', () => {
  it('rolls enchantment, beatitude, special enchantments and unidentified from loot RNG without moving walls', () => {
    const a = generateFloor(FLOOR_HALLS, new Rng([1, 2, 3, 4]), { depth: 5, loot: new Rng([11, 22, 33, 44]) });
    const b = generateFloor(FLOOR_HALLS, new Rng([1, 2, 3, 4]), { depth: 5, loot: new Rng([99, 88, 77, 66]) });
    expect(Array.from(a.terrain.cells)).toEqual(Array.from(b.terrain.cells));
    expect(a.features).toEqual(b.features);

    // Over many rolls at depth 5, we see blessed, cursed, +N, -N, special enchantments, and unidentified potions.
    const rng = Rng.seeded(7, 'test-loot-props');
    let sawBlessed = false;
    let sawCursed = false;
    let sawPlus = false;
    let sawMinus = false;
    let sawSpecial = false;
    for (let i = 0; i < 300; i++) {
      const rolled = rollItemProperties(ITEMS.get(HATCHET), 5, rng);
      if (rolled.blessing === 'blessed') sawBlessed = true;
      if (rolled.blessing === 'cursed') sawCursed = true;
      if ((rolled.enchant ?? 0) > 0) sawPlus = true;
      if ((rolled.enchant ?? 0) < 0) sawMinus = true;
      if ((rolled.enchantments?.length ?? 0) > 0) sawSpecial = true;
    }
    expect(sawBlessed && sawCursed && sawPlus && sawMinus && sawSpecial).toBe(true);

    const potionProps = rollItemProperties(ITEMS.get(POTION), 1, Rng.seeded(1, 'p'));
    expect(potionProps.identified).toBe(false);
  });
});

describe('enchantments and special triggers', () => {
  it('applies base +N/-N, beatitude gear delta, and special enchantments to stats, names, values and triggers', () => {
    const { state, hero } = setup();
    const sword: ItemInstance = {
      def: HATCHET,
      qty: 1,
      enchant: 2,
      blessing: 'blessed',
      enchantments: [
        { id: ENCHANT_KEEN.id, level: 2 },
        { id: ENCHANT_VENOMOUS.id, level: 1 },
        { id: ENCHANT_VAMPIRIC.id, level: 2 },
      ],
    };
    expect(itemName(state, sword, hero)).toBe('+2 blessed Keen II Venomous Iron hatchet of Draining II');
    expect(itemValue(state, sword)).toBeGreaterThan(itemValue(state, { def: HATCHET, qty: 1 }));

    const baseDmg = statValue(state, hero, 'damage');
    const baseAcc = statValue(state, hero, 'accuracy');
    hero.inventory = { items: [], equipped: { mainHand: sword } };

    // Base hatchet +2 dmg, enchant +2 dmg, blessed +1 dmg = +5 dmg; Keen II = +2 accuracy (not double-scaled!).
    expect(statValue(state, hero, 'damage')).toBe(baseDmg + 5);
    expect(statValue(state, hero, 'accuracy')).toBe(baseAcc + 2);
    expect(getStat(state, hero, 'accuracy').parts).toContainEqual({
      op: 'add',
      value: 2,
      source: { id: ENCHANT_KEEN.id, label: 'Keen II (Iron hatchet)' },
    });

    // Landing a melee hit fires both Venomous (poisons rat) and Draining II (heals wielder 2 HP).
    hero.actor.hp = 5;
    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: hero.pos.x + 1, y: hero.pos.y });
    if (rat.actor !== undefined) rat.actor.hp = 40;
    if (rat.stats !== undefined) rat.stats.base.hp = 40;
    if (hero.stats !== undefined) hero.stats.base.accuracy = 40;

    const events = by(state, act(hero.id, { id: 'attack', dir: { x: 1, y: 0 } }));
    expect(ofType(events, 'attacked').length).toBeGreaterThan(0);
    expect(ofType(events, 'statusApplied')).toContainEqual(expect.objectContaining({ actor: rat.id, status: 'status.poisoned' }));
    expect(ofType(events, 'healed')).toContainEqual(expect.objectContaining({ actor: hero.id, amount: 2, source: ENCHANT_VAMPIRIC.id }));
    expect(checkInvariants(state)).toEqual([]);
  });

  it('rejects malformed enchantment entries in the items.properties invariant', () => {
    const { state, hero } = setup();
    hero.inventory = {
      items: [
        { def: POTION, qty: 1, enchant: 1 },
        { def: HATCHET, qty: 1, enchantments: [{ id: 'enchant.nimble', level: 1 }] },
      ],
    };
    const problems = checkInvariants(state).join('\n');
    expect(problems).toContain('cannot carry enchant');
    expect(problems).toContain('does not fit');
  });
});

describe('cursed and blessed items', () => {
  it('prevents unequipping or replacing cursed gear until uncursed by Scroll of Uncursing', () => {
    const { state, hero } = setup();
    const cursedHatchet: ItemInstance = { def: HATCHET, qty: 1, enchant: -1, blessing: 'cursed' };
    hero.inventory = { items: [{ def: SWORD, qty: 1 }, { def: SCROLL_UNCURSE, qty: 1 }], equipped: { mainHand: cursedHatchet } };

    // Unequip refused.
    let events = by(state, act(hero.id, { id: 'unequip', slot: 'mainHand' }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toContain('cursed and cannot be removed');
    expect(hero.inventory.equipped?.mainHand?.blessing).toBe('cursed');

    // Equip replacement refused.
    events = by(state, act(hero.id, { id: 'equip', index: 0 }));
    expect(ofType(events, 'actionFailed')[0]?.reason).toContain('cursed and cannot be replaced');

    // AI skips cursed slots and never knowingly equips cursed gear.
    expect(upgradeSlot(state, hero, { def: SWORD, qty: 1 })).toBeNull();
    expect(bestUpgrade(state, hero)).toBeNull();
    expect(wantsItem(state, hero, cursedHatchet)).toBe(false);

    // Snapshot flags worn cursed item for the UI.
    expect(snapshot(state).domains.items.members[hero.id]?.equipped[0]?.cursed).toBe(true);

    // Reading Scroll of Uncursing lifts the curse and allows unequipping.
    events = by(state, act(hero.id, { id: 'use', index: 1 }));
    expect(ofType(events, 'itemUncursed')).toMatchObject([{ actor: hero.id, item: HATCHET, slot: 'mainHand' }]);
    expect(hero.inventory.equipped?.mainHand?.blessing).toBeUndefined();

    events = by(state, act(hero.id, { id: 'unequip', slot: 'mainHand' }));
    expect(ofType(events, 'unequipped')).toHaveLength(1);
    expect(hero.inventory.equipped).toBeUndefined();
    expect(checkInvariants(state)).toEqual([]);
  });

  it('scales consumable potency for blessed (1.5x) and cursed (0.5x) potions', () => {
    const { state, hero } = setup();
    hero.inventory = {
      items: [
        { def: POTION, qty: 1, blessing: 'blessed' },
        { def: POTION, qty: 1, blessing: 'cursed' },
      ],
    };
    if (hero.stats !== undefined) hero.stats.base.hp = 40;
    hero.actor.hp = 1;

    let events = by(state, act(hero.id, { id: 'use', index: 0 }));
    // Mending draught base heal is 12 -> blessed 1.5x = 18.
    expect(ofType(events, 'healed')).toContainEqual(expect.objectContaining({ amount: 18 }));

    events = by(state, act(hero.id, { id: 'use', index: 0 }));
    // Cursed 0.5x = 6.
    expect(ofType(events, 'healed')).toContainEqual(expect.objectContaining({ amount: 6 }));
  });

  it('blessed Scroll of Uncursing lifts curses from both worn gear and carried pack items', () => {
    const { state, hero } = setup();
    hero.inventory = {
      items: [
        { def: SCROLL_UNCURSE, qty: 1, blessing: 'blessed' },
        { def: SWORD, qty: 1, blessing: 'cursed' },
      ],
      equipped: { mainHand: { def: HATCHET, qty: 1, blessing: 'cursed' } },
    };
    const events = by(state, act(hero.id, { id: 'use', index: 0 }));
    expect(ofType(events, 'itemUncursed')).toHaveLength(2);
    expect(hero.inventory.equipped?.mainHand?.blessing).toBeUndefined();
    expect(hero.inventory.items[0]?.blessing).toBeUndefined();
  });
});

describe('identification and appearances', () => {
  it('shows seeded generic appearances for unidentified potions/scrolls/jewelry, hides weapon properties, and remembers types per run', () => {
    const { state, hero } = setup(17);
    const unknownPotion: ItemInstance = { def: POTION, qty: 1, identified: false };
    const unknownRing: ItemInstance = { def: BAND, qty: 1, enchant: 1, identified: false };
    const unknownHatchet: ItemInstance = { def: HATCHET, qty: 1, enchant: 2, blessing: 'blessed', identified: false };

    // Potions & rings show deterministic generic appearance names; weapons show base name without +2/blessed.
    const potionAlias = appearanceName(state.seed, POTION);
    const ringAlias = appearanceName(state.seed, BAND);
    expect(itemName(state, unknownPotion, hero)).toBe(potionAlias);
    expect(potionAlias).not.toBe('Mending draught');
    expect(itemName(state, unknownRing, hero)).toBe(ringAlias);
    expect(itemName(state, unknownHatchet, hero)).toBe('Iron hatchet');
    // Without a viewer, full name is returned.
    expect(itemName(state, unknownHatchet)).toBe('+2 blessed Iron hatchet');

    // AI gear comparison with knownOnly does not peek at hidden +2/blessed on unidentified hatchet.
    expect(compareGear(state, hero, unknownHatchet, { def: HATCHET, qty: 1 }, true)).toBe('same');
    expect(compareGear(state, hero, unknownHatchet, { def: HATCHET, qty: 1 }, false)).toBe('better');

    // Floor snapshot hides unidentified potion's true identity and does not spoil Codex on sighting.
    placeItem(state, 'd1', { x: hero.pos.x + 1, y: hero.pos.y }, unknownPotion);
    const snap = snapshot(state);
    expect(snap.domains.items.floor[0]).toMatchObject({ name: potionAlias, typeUnknown: true });

    // Using one potion identifies its type for the rest of the run, revealing other bottles too.
    hero.inventory = { items: [{ def: POTION, qty: 2, identified: false }] };
    const events = by(state, act(hero.id, { id: 'use', index: 0 }));
    expect(ofType(events, 'itemIdentified')).toMatchObject([{ item: POTION, name: 'Mending draught', was: potionAlias, method: 'use' }]);
    expect(state.domains.items.identifiedTypes).toEqual([POTION]);
    expect(itemName(state, unknownPotion, hero)).toBe('Mending draught');
    expect(ofType(events, 'itemIdentified').flatMap(discoveriesOf)).toContainEqual({ id: POTION, mark: 'seen' });

    // Save/load preserves identifiedTypes and yields identical appearances.
    const loaded = deserialize(serialize(state));
    expect(loaded.domains.items.identifiedTypes).toEqual([POTION]);
    expect(appearanceName(loaded.seed, BAND)).toBe(ringAlias);
    expect(checkInvariants(loaded)).toEqual([]);
  });

  it('uses Wits-based identify stat on pickup and wear-IDs cursed gear on equip', () => {
    const { state, hero } = setup(5);
    // Boost Wits so identify skill hits cap (95%) and reliably identifies on pickup across a few items.
    if (hero.stats !== undefined) hero.stats.attributes = { wits: 30 };
    expect(statValue(state, hero, 'identify')).toBe(95);

    let identifiedByWits = 0;
    for (let i = 0; i < 6; i++) {
      placeItem(state, 'd1', hero.pos, { def: HATCHET, qty: 1, enchant: 1, identified: false });
      const evs = by(state, act(hero.id, { id: 'pickup' }));
      if (ofType(evs, 'itemIdentified').some((e) => e.method === 'wits')) identifiedByWits++;
    }
    expect(identifiedByWits).toBeGreaterThanOrEqual(4);

    // With 0 Wits (Human Vanguard starts at 5 Wits -> -5 = 0 -> identify = 0%), pickup never identifies, and equipping wear-IDs and reveals curses.
    const { state: lowState, hero: lowHero } = setup(5);
    if (lowHero.stats !== undefined) lowHero.stats.attributes = { wits: -5 };
    expect(statValue(lowState, lowHero, 'identify')).toBe(0);
    placeItem(lowState, 'd1', lowHero.pos, { def: HATCHET, qty: 1, enchant: -1, blessing: 'cursed', identified: false });
    const pickupEvs = by(lowState, act(lowHero.id, { id: 'pickup' }));
    expect(ofType(pickupEvs, 'itemIdentified')).toEqual([]);
    expect(lowHero.inventory?.items[0]?.identified).toBe(false);

    const equipEvs = by(lowState, act(lowHero.id, { id: 'equip', index: 0 }));
    expect(ofType(equipEvs, 'itemIdentified')).toMatchObject([
      { item: HATCHET, name: '-1 cursed Iron hatchet', was: 'Iron hatchet', method: 'equip', cursed: true },
    ]);
    expect(lowHero.inventory?.equipped?.mainHand?.identified).toBeUndefined();
  });

  it('Scroll of Identify identifies one item (or all items when blessed)', () => {
    const { state, hero } = setup();
    hero.inventory = {
      items: [
        { def: SCROLL_ID, qty: 1 },
        { def: HATCHET, qty: 1, enchant: 2, identified: false },
        { def: BAND, qty: 1, enchant: 1, identified: false },
      ],
    };
    let events = by(state, act(hero.id, { id: 'use', index: 0 }));
    expect(ofType(events, 'itemIdentified')).toHaveLength(1);
    expect(hero.inventory.items[0]?.identified).toBeUndefined();
    expect(hero.inventory.items[1]?.identified).toBe(false);

    // Blessed Scroll of Identify reveals every remaining unidentified item at once.
    hero.inventory.items.unshift({ def: SCROLL_ID, qty: 1, blessing: 'blessed' });
    hero.inventory.items.push({ def: POTION, qty: 1, blessing: 'blessed', identified: false });
    events = by(state, act(hero.id, { id: 'use', index: 0 }));
    expect(ofType(events, 'itemIdentified')).toHaveLength(2);
    expect(hero.inventory.items.every((i) => i.identified === undefined)).toBe(true);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('baseline AI drinks an unidentified potion when critical, reads Identify and Uncursing scrolls, and stacks identical items', () => {
    expect(canStack({ def: POTION, qty: 1, blessing: 'blessed' }, { def: POTION, qty: 1, blessing: 'blessed' })).toBe(true);
    expect(canStack({ def: POTION, qty: 1, blessing: 'blessed' }, { def: POTION, qty: 1, blessing: 'cursed' })).toBe(false);
    expect(canStack({ def: POTION, qty: 1, identified: false }, { def: POTION, qty: 1, identified: false })).toBe(true);

    // Critically wounded hero tries an unidentified potion and learns Mending draught.
    const { state, hero } = setup();
    hero.inventory = { items: [{ def: POTION, qty: 2, identified: false }] };
    hero.actor.hp = 2;
    const healEvents = step(state, []);
    expect(ofType(healEvents, 'used')).toMatchObject([{ item: POTION }]);
    expect(ofType(healEvents, 'itemIdentified')).toHaveLength(1);
    expect(state.domains.items.identifiedTypes).toContain(POTION);

    // Cursed hero reads a known Scroll of Uncursing automatically.
    hero.actor.hp = statValue(state, hero, 'hp');
    hero.inventory = {
      items: [{ def: SCROLL_UNCURSE, qty: 1 }],
      equipped: { mainHand: { def: HATCHET, qty: 1, blessing: 'cursed' } },
    };
    const uncurseEvents = step(state, []);
    expect(ofType(uncurseEvents, 'itemUncursed')).toHaveLength(1);
    expect(hero.inventory.equipped?.mainHand?.blessing).toBeUndefined();

    // Hero with a known Scroll of Identify reads it to identify carried unidentified gear.
    hero.inventory.items = [
      { def: SCROLL_ID, qty: 1 },
      { def: SWORD, qty: 1, enchant: 1, identified: false },
    ];
    const idEvents = step(state, []);
    expect(ofType(idEvents, 'itemIdentified')).toHaveLength(1);
    expect(hero.inventory.items[0]?.identified).toBeUndefined();
    expect(checkInvariants(state)).toEqual([]);
  });

  it('scales status durations for blessed/cursed status consumables and ranked on-hit enchantments', () => {
    const { state, hero } = setup();
    hero.inventory = {
      items: [
        { def: 'item.quickstep_tonic', qty: 1, blessing: 'blessed' },
        { def: 'item.quickstep_tonic', qty: 1, blessing: 'cursed' },
      ],
    };
    // Quickstep tonic base duration is 20 turns -> blessed 1.5x = 30 turns, cursed 0.5x = 10 turns.
    let events = by(state, act(hero.id, { id: 'use', index: 0 }));
    expect(ofType(events, 'statusApplied')).toContainEqual(expect.objectContaining({ status: 'status.hasted', turns: 30 }));

    const { state: s2, hero: h2 } = setup();
    h2.inventory = { items: [{ def: 'item.quickstep_tonic', qty: 1, blessing: 'cursed' }] };
    events = by(s2, act(h2.id, { id: 'use', index: 0 }));
    expect(ofType(events, 'statusApplied')).toContainEqual(expect.objectContaining({ status: 'status.hasted', turns: 10 }));

    // Venomous II (potency 2) inflicts 8 turns of poison vs Venomous I's 4 turns.
    const { state: s3, hero: h3 } = setup();
    h3.inventory = { items: [], equipped: { mainHand: { def: HATCHET, qty: 1, enchantments: [{ id: ENCHANT_VENOMOUS.id, level: 2 }] } } };
    if (h3.stats !== undefined) h3.stats.base.accuracy = 40;
    const rat = spawnMonster(s3, 'monster.gloam_rat', 'd1', { x: h3.pos.x + 1, y: h3.pos.y });
    if (rat.actor !== undefined) rat.actor.hp = 40;
    if (rat.stats !== undefined) rat.stats.base.hp = 40;
    const hitEvents = by(s3, act(h3.id, { id: 'attack', dir: { x: 1, y: 0 } }));
    expect(ofType(hitEvents, 'statusApplied')).toContainEqual(expect.objectContaining({ actor: rat.id, status: 'status.poisoned', turns: 8 }));
  });

  it('does not leak unidentified items through fountains, chronicle, dropped events, or mid-loop consolidation', () => {
    const { state, hero } = setup(11);
    // Fountain AI does not peek at an unidentified healing potion.
    hero.inventory = { items: [{ def: POTION, qty: 1, identified: false }] };
    expect(carriesHealingPotion(state, hero)).toBe(false);
    hero.inventory = { items: [{ def: POTION, qty: 1 }] };
    expect(carriesHealingPotion(state, hero)).toBe(true);

    // Dropping an unidentified potion marks `identified: false` so the log stays non-spoiling.
    hero.inventory = { items: [{ def: POTION, qty: 1, identified: false }] };
    const dropEvents = by(state, act(hero.id, { id: 'drop', index: 0 }));
    expect(ofType(dropEvents, 'dropped')[0]).toMatchObject({
      item: POTION,
      name: appearanceName(state.seed, POTION),
      identified: false,
    });

    // Chronicle does not spoil unidentified valuable finds (e.g. Quickstep tonic worth 60).
    const hiddenPick = {
      type: 'pickedUp' as const,
      turn: 1,
      actor: hero.id,
      item: 'item.quickstep_tonic',
      name: appearanceName(state.seed, 'item.quickstep_tonic'),
      identified: false as const,
      qty: 1,
      value: 60,
      floor: 'd1',
      pos: hero.pos,
    };
    expect(ITEMS_CHRONICLE.pickedUp?.(hiddenPick)).toBeNull();
    expect(ITEMS_CHRONICLE.pickedUp?.({ ...hiddenPick, identified: undefined })).not.toBeNull();

    // Blessed Scroll of Identify safely identifies all items even when a plain stack of the same potion type consolidates.
    const { state: s2, hero: h2 } = setup(12);
    h2.inventory = {
      items: [
        { def: SCROLL_ID, qty: 1, blessing: 'blessed' },
        { def: POTION, qty: 1, identified: false },
        { def: POTION, qty: 1 },
        { def: SWORD, qty: 1, enchant: 2, identified: false },
      ],
    };
    const idAllEvents = by(s2, act(h2.id, { id: 'use', index: 0 }));
    expect(ofType(idAllEvents, 'itemIdentified')).toHaveLength(2);
    expect(h2.inventory.items.every((i) => i.identified === undefined)).toBe(true);
    // Plain potions consolidated into one stack of 2 after identification.
    expect(h2.inventory.items.find((i) => i.def === POTION)?.qty).toBe(2);
    // Base +N enchantment (`enchant.honed`) is discovered on identification and equip.
    expect(ofType(idAllEvents, 'itemIdentified').flatMap(discoveriesOf)).toContainEqual({ id: ENCHANT_HONED.id, mark: 'seen' });
    const swordIdx = h2.inventory.items.findIndex((i) => i.def === SWORD);
    const equipEvents = by(s2, act(h2.id, { id: 'equip', index: swordIdx }));
    expect(ofType(equipEvents, 'equipped').flatMap(discoveriesOf)).toContainEqual({ id: ENCHANT_HONED.id, mark: 'used' });

    // `identified: true` is rejected by the `items.properties` invariant (absent means known).
    h2.inventory.items.push({ def: POTION, qty: 1, identified: true as unknown as false });
    expect(checkInvariants(s2).join('\n')).toContain('identified');
  });
});

describe('AI information-leak guards (ETH-131)', () => {
  const decisionOf = (state: RunState, hero: ActorEntity) => {
    const choice = chooseRule({ state, actor: hero as AiActor });
    return { action: choice?.action ?? null, request: choice?.request ?? null };
  };

  it('makes identical decisions regardless of hidden fields or unknown-type item identity', () => {
    // 1. Hurt with fountain in view (HP 9/20 = 45%, between 35% quaff threshold and 50% fountain threshold):
    //    carriesHealingPotion must not peek at an unidentified Mending draught.
    const fountainDecisions = (['blessed', undefined, 'cursed'] as const).flatMap((blessing) =>
      [POTION, 'item.quickstep_tonic'].map((def) => {
        const s = createRun({ party: [HERO], depth: 1, floorText: ['#####', '#@.{#', '#####'], monsters: false }, 19);
        const h = getEntity(s, s.party[0] as EntityId) as ActorEntity;
        h.actor.hp = 9;
        h.inventory = { items: [{ def, qty: 1, identified: false, ...(blessing === undefined ? {} : { blessing }) }] };
        return decisionOf(s, h);
      }),
    );
    expect(fountainDecisions[0]?.action).toBe('act.drink_fountain');
    for (const d of fountainDecisions) expect(d).toEqual(fountainDecisions[0]);

    // 2. Critically wounded (HP 4/20 = 20% < 35%): unidentified healing vs speed potion & hidden beatitude choose identically.
    const urgentDecisions = (['blessed', undefined, 'cursed'] as const).flatMap((blessing) =>
      [POTION, 'item.quickstep_tonic'].map((def) => {
        const { state: s, hero: h } = setup(19);
        h.actor.hp = 4;
        h.inventory = { items: [{ def, qty: 1, identified: false, ...(blessing === undefined ? {} : { blessing }) }] };
        return decisionOf(s, h);
      }),
    );
    expect(urgentDecisions[0]).toEqual({ action: 'act.quaff_healing', request: { id: 'use', index: 0 } });
    for (const d of urgentDecisions) expect(d).toEqual(urgentDecisions[0]);

    // 3. Overloaded pack: dropping lowest-value unknown potion or scroll must not leak hidden base value or blessing.
    const heavyArmor = { def: 'item.riveted_mail', qty: 4 };
    const dropPotionVariants: [ItemInstance, ItemInstance][] = [
      [{ def: POTION, qty: 1, identified: false }, { def: 'item.quickstep_tonic', qty: 1, identified: false }],
      [{ def: 'item.quickstep_tonic', qty: 1, blessing: 'blessed', identified: false }, { def: POTION, qty: 1, blessing: 'cursed', identified: false }],
    ];
    const dropDecisions = dropPotionVariants.map((pair) => {
      const { state: s, hero: h } = setup(23);
      h.inventory = { items: [heavyArmor, ...pair] };
      return decisionOf(s, h);
    });
    expect(dropDecisions[0]).toEqual({ action: 'act.drop_lowest', request: { id: 'drop', index: 2, qty: 1 } });
    expect(dropDecisions[1]).toEqual(dropDecisions[0]);

    const dropScrollVariants: [ItemInstance, ItemInstance][] = [
      [{ def: SCROLL_ID, qty: 1, identified: false }, { def: SCROLL_UNCURSE, qty: 1, identified: false }],
      [{ def: SCROLL_UNCURSE, qty: 1, blessing: 'blessed', identified: false }, { def: SCROLL_ID, qty: 1, blessing: 'cursed', identified: false }],
    ];
    const scrollDropDecisions = dropScrollVariants.map((pair) => {
      const { state: s, hero: h } = setup(23);
      h.inventory = { items: [heavyArmor, ...pair] };
      return decisionOf(s, h);
    });
    expect(scrollDropDecisions[0]).toEqual({ action: 'act.drop_lowest', request: { id: 'drop', index: 2, qty: 1 } });
    expect(scrollDropDecisions[1]).toEqual(scrollDropDecisions[0]);

    // 4a. Unidentified weapon: hidden +N, blessing, and special enchantments change neither equip nor pickup decisions.
    const weaponVariants: ItemInstance[] = [
      { def: HATCHET, qty: 1, identified: false },
      { def: HATCHET, qty: 1, enchant: 3, blessing: 'blessed', enchantments: [{ id: ENCHANT_KEEN.id, level: 2 }], identified: false },
      { def: HATCHET, qty: 1, enchant: -2, blessing: 'cursed', identified: false },
    ];
    const packWeaponDecisions = weaponVariants.map((variant) => {
      const { state: s, hero: h } = setup(29);
      h.inventory = { items: [variant], equipped: { mainHand: { def: HATCHET, qty: 1 } } };
      return decisionOf(s, h);
    });
    for (const d of packWeaponDecisions) expect(d).toEqual(packWeaponDecisions[0]);

    const floorWeaponDecisions = weaponVariants.map((variant) => {
      const { state: s, hero: h } = setup(29);
      placeItem(s, 'd1', h.pos, variant);
      return decisionOf(s, h);
    });
    for (const d of floorWeaponDecisions) expect(d).toEqual(floorWeaponDecisions[0]);

    // 4b. Unidentified jewelry: swapping defs of same weight and adding hidden props changes neither equip nor pickup.
    const jewelryVariants: ItemInstance[] = [
      { def: BAND, qty: 1, identified: false },
      { def: 'item.owl_eye_ring', qty: 1, enchant: 2, blessing: 'blessed', identified: false },
      { def: 'item.owl_eye_ring', qty: 1, blessing: 'cursed', identified: false },
    ];
    const jewelryPackDecisions = jewelryVariants.map((variant) => {
      const { state: s, hero: h } = setup(31);
      h.inventory = { items: [variant] };
      return decisionOf(s, h);
    });
    for (const d of jewelryPackDecisions) expect(d).toEqual(jewelryPackDecisions[0]);

    const jewelryFloorDecisions = jewelryVariants.map((variant) => {
      const { state: s, hero: h } = setup(31);
      placeItem(s, 'd1', h.pos, variant);
      return decisionOf(s, h);
    });
    for (const d of jewelryFloorDecisions) expect(d).toEqual(jewelryFloorDecisions[0]);
  });
});
