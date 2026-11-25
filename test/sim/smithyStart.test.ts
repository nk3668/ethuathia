/**
 * What the Smithy's start perks do inside a run (ETH-159): enchanted kit pieces use each gear type's
 * own enchantment, the Scroll Case's scrolls are kit and never sold, known kinds respect
 * identification secrecy (ETH-142), and the trade bonus lifts the converted Trophies. Fixed seeds,
 * hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import {
  goldToTrophies,
  ITEM_ASHWOOD_STAFF,
  ITEM_BENT_NAIL,
  ITEM_COPPER_BAND,
  ITEM_MENDING_DRAUGHT,
  ITEM_SCROLL_OF_IDENTIFY,
  ITEM_SCROLL_OF_UNCURSING,
  ITEMS,
  itemValueToTrophies,
} from '../../src/content';
import {
  addToInventory,
  checkInvariants,
  createRun,
  getEntity,
  isInstanceTypeKnown,
  isItemIdentified,
  isTypeIdentified,
  itemSale,
  runResult,
  soldOnExit,
  statValue,
  step,
  wornItems,
} from '../../src/sim';
import type { ActorEntity, EntityId, ItemInstance, RunConfig, RunState, SimEvent } from '../../src/sim';
import { RUN_DOMAIN_LOG_TEXT } from '../../src/ui/shell/logText/run';

const ROOM = ['#########', '#<@.....#', '#.......#', '#########'];
const member = (name: string, classId: string) => ({ name, classId, raceId: 'race.human' });
const CLASSES = ['class.vanguard', 'class.outrider', 'class.lorekeeper', 'class.reaver'] as const;

function setup(config: Partial<RunConfig> = {}, classes: readonly string[] = ['class.vanguard']): { state: RunState; party: ActorEntity[] } {
  const state = createRun({ party: classes.map((c, i) => member(`Hero${i}`, c)), depth: 1, floorTexts: [ROOM], monsters: false, ...config }, 1);
  return { state, party: state.party.map((id) => getEntity(state, id as EntityId) as ActorEntity) };
}

const worn = (e: ActorEntity) => Object.fromEntries(wornItems(e).map((w) => [w.slot, w.item]));
const text = (parts: unknown): string =>
  (Array.isArray(parts) ? parts : [parts]).map((p) => (typeof p === 'string' ? p : ((p as { label?: string; ref: string }).label ?? (p as { ref: string }).ref))).join('');

describe('Runed Implements and Warded Attire (kitEnchant)', () => {
  it('leaves the kit plain without them', () => {
    const { party } = setup({}, CLASSES);
    for (const e of party) for (const item of wornItems(e)) expect(item.item.enchant, e.adventurer?.classId).toBeUndefined();
  });

  it('enchants only the main-hand piece of every class at +1, kept identified and marked as kit', () => {
    const { state, party } = setup({ kitEnchant: ['weapon'] }, CLASSES);
    for (const e of party) {
      const gear = worn(e);
      expect(gear.mainHand?.enchant, e.adventurer?.classId).toBe(1);
      expect(gear.mainHand?.kit).toBe(true);
      expect(gear.mainHand?.identified).toBeUndefined();
      for (const [slot, item] of Object.entries(gear)) if (slot !== 'mainHand') expect(item.enchant, `${e.adventurer?.classId} ${slot}`).toBeUndefined();
    }
    expect(checkInvariants(state)).toEqual([]);
  });

  it('enchants exactly one defensive piece of every class at +1 and never the weapon', () => {
    const { state, party } = setup({ kitEnchant: ['defense'] }, CLASSES);
    for (const e of party) {
      const enchanted = wornItems(e).filter((w) => w.item.enchant !== undefined);
      expect(enchanted, e.adventurer?.classId).toHaveLength(1);
      expect(ITEMS.get((enchanted[0] as { item: ItemInstance }).item.def).category).toBe('armor');
      expect((enchanted[0] as { item: ItemInstance }).item.kit).toBe(true);
      expect(worn(e).mainHand?.enchant).toBeUndefined();
    }
    expect(checkInvariants(state)).toEqual([]);
  });

  it('does both when both are bought', () => {
    const { party } = setup({ kitEnchant: ['weapon', 'defense'] }, CLASSES);
    for (const e of party) expect(wornItems(e).filter((w) => w.item.enchant === 1)).toHaveLength(2);
  });

  it("uses each gear type's own enchantment: a staff gains Max MP, a cudgel gains damage", () => {
    const plain = setup({}, ['class.lorekeeper', 'class.vanguard']);
    const runed = setup({ kitEnchant: ['weapon'] }, ['class.lorekeeper', 'class.vanguard']);
    const [loreP, vanP] = plain.party as [ActorEntity, ActorEntity];
    const [loreR, vanR] = runed.party as [ActorEntity, ActorEntity];
    expect(worn(loreR).mainHand?.def).toBe(ITEM_ASHWOOD_STAFF.id);
    expect(statValue(runed.state, loreR, 'mp') - statValue(plain.state, loreP, 'mp')).toBe(2);
    expect(statValue(runed.state, loreR, 'damage')).toBe(statValue(plain.state, loreP, 'damage'));
    expect(statValue(runed.state, vanR, 'damage') - statValue(plain.state, vanP, 'damage')).toBe(1);
    expect(statValue(runed.state, vanR, 'mp')).toBe(statValue(plain.state, vanP, 'mp'));
  });

  it('gives a defensive piece its armor', () => {
    const plain = setup({}, ['class.vanguard']);
    const warded = setup({ kitEnchant: ['defense'] }, ['class.vanguard']);
    expect(statValue(warded.state, warded.party[0] as ActorEntity, 'armor') - statValue(plain.state, plain.party[0] as ActorEntity, 'armor')).toBe(1);
  });

  it('never sells the enchanted pieces', () => {
    const { state } = setup({ kitEnchant: ['weapon', 'defense'] });
    expect(itemSale(state, 'retreat')).toMatchObject({ items: 0, trophies: 0 });
  });

  it('says so in the run-start log', () => {
    const { state, party } = setup({ kitEnchant: ['weapon'] });
    const issued = step(state, []).filter((e): e is Extract<SimEvent, { type: 'kitIssued' }> => e.type === 'kitIssued');
    expect(issued).toMatchObject([{ actor: (party[0] as ActorEntity).id, enchanted: ['item.oak_cudgel'] }]);
    expect(text(RUN_DOMAIN_LOG_TEXT.kitIssued.text(issued[0] as never, () => 'Hero0'))).toBe('Hero0 shoulders a +1 oak cudgel and a round shield.');
  });
});

describe('Scroll Case (startStock)', () => {
  const STOCK = [
    { item: ITEM_SCROLL_OF_IDENTIFY.id, qty: 1 },
    { item: ITEM_SCROLL_OF_UNCURSING.id, qty: 1 },
  ];

  it('gives the first member one of each scroll as kit, and nobody else', () => {
    const { state, party } = setup({ startStock: STOCK }, ['class.vanguard', 'class.outrider']);
    expect((party[0] as ActorEntity).inventory?.items).toEqual([
      { def: ITEM_SCROLL_OF_IDENTIFY.id, qty: 1, kit: true },
      { def: ITEM_SCROLL_OF_UNCURSING.id, qty: 1, kit: true },
    ]);
    expect((party[1] as ActorEntity).inventory?.items ?? []).toEqual([]);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('knows the scroll kinds on sight, so a found copy is named too', () => {
    const { state } = setup({ startStock: STOCK });
    expect(isTypeIdentified(state, ITEM_SCROLL_OF_IDENTIFY.id)).toBe(true);
    expect(isTypeIdentified(state, ITEM_SCROLL_OF_UNCURSING.id)).toBe(true);
  });

  it('never sells the scrolls, but sells a found one', () => {
    const { state, party } = setup({ startStock: STOCK });
    expect(itemSale(state, 'retreat')).toMatchObject({ items: 0, trophies: 0 });
    expect((party[0] as ActorEntity).inventory?.items.every((i) => !soldOnExit(i))).toBe(true);
    addToInventory((party[0] as ActorEntity), { def: ITEM_SCROLL_OF_IDENTIFY.id, qty: 1 });
    expect(itemSale(state, 'retreat')).toMatchObject({ items: 1, value: ITEMS.get(ITEM_SCROLL_OF_IDENTIFY.id).value });
    expect((party[0] as ActorEntity).inventory?.items).toHaveLength(3); // the found scroll doesn't merge into the kit one
  });

  it('is listed in the run-start log with the kit', () => {
    const { state } = setup({ startStock: STOCK });
    const issued = step(state, []).find((e) => e.type === 'kitIssued');
    expect(issued).toMatchObject({ items: ['item.oak_cudgel', 'item.round_shield', ITEM_SCROLL_OF_IDENTIFY.id, ITEM_SCROLL_OF_UNCURSING.id] });
  });

  it('survives an unknown stack size by splitting at the stack limit', () => {
    const { party } = setup({ startStock: [{ item: ITEM_SCROLL_OF_IDENTIFY.id, qty: 7 }] });
    expect((party[0] as ActorEntity).inventory?.items.map((i) => i.qty)).toEqual([5, 2]);
  });
});

describe('Appraiser’s Eye and Assayer’s Ledger (startKnown)', () => {
  const kindsOf = (category: string) => ITEMS.all().filter((d) => d.category === category).map((d) => d.id);

  it('knows nothing extra by default', () => {
    const { state } = setup();
    for (const id of [...kindsOf('potion'), ...kindsOf('jewelry')]) expect(isTypeIdentified(state, id), id).toBe(false);
  });

  it('knows every potion kind but not the rings, from the first turn', () => {
    const { state } = setup({ startKnown: ['potion'] });
    for (const id of kindsOf('potion')) expect(isTypeIdentified(state, id), id).toBe(true);
    for (const id of kindsOf('jewelry')) expect(isTypeIdentified(state, id), id).toBe(false);
    expect(state.domains.items.identifiedTypes).toEqual([...state.domains.items.identifiedTypes].sort());
  });

  it('knows every ring and amulet kind but not the potions', () => {
    const { state } = setup({ startKnown: ['jewelry'] });
    for (const id of kindsOf('jewelry')) expect(isTypeIdentified(state, id), id).toBe(true);
    for (const id of kindsOf('potion')) expect(isTypeIdentified(state, id), id).toBe(false);
    expect(kindsOf('jewelry')).toContain(ITEM_COPPER_BAND.id);
  });

  it('keeps each copy secret: a known kind does not reveal whether this one is special (ETH-142)', () => {
    const { state } = setup({ startKnown: ['potion', 'jewelry'] });
    const draught = { def: ITEM_MENDING_DRAUGHT.id, qty: 1, identified: false } as const;
    const band = { def: ITEM_COPPER_BAND.id, qty: 1, identified: false } as const;
    for (const item of [draught, band]) {
      expect(isInstanceTypeKnown(state, item)).toBe(true);
      expect(isItemIdentified(state, item)).toBe(false);
    }
  });

  it('announces itself once in the log', () => {
    const { state } = setup({ startKnown: ['potion', 'jewelry'] });
    const events = step(state, []).filter((e): e is Extract<SimEvent, { type: 'startKnown' }> => e.type === 'startKnown');
    expect(events).toHaveLength(1);
    expect(text(RUN_DOMAIN_LOG_TEXT.startKnown.text(events[0] as never, () => ''))).toBe(
      'The party sets out knowing every kind of potions, rings and amulets on sight.',
    );
    expect(step(setup().state, []).some((e) => e.type === 'startKnown')).toBe(false);
  });
});

describe('Smelting Pit (tradeBonus)', () => {
  it('adds the percentage once, before rounding down', () => {
    expect(goldToTrophies(100)).toBe(10);
    expect(goldToTrophies(100, 10, 15)).toBe(11);
    expect(goldToTrophies(100, 10, 45)).toBe(14);
    expect(itemValueToTrophies(70, 10, 15)).toBe(8);
    expect(itemValueToTrophies(70, 10, 0)).toBe(7);
    expect(goldToTrophies(0, 10, 45)).toBe(0);
  });

  function exitWith(config: Partial<RunConfig>): { state: RunState; events: SimEvent[] } {
    const { state, party } = setup(config);
    state.domains.items.gold = 100;
    addToInventory((party[0] as ActorEntity), { def: ITEM_MENDING_DRAUGHT.id, qty: 2 });
    const events: SimEvent[] = [];
    let commands = [{ type: 'retreat' } as const];
    for (let i = 0; i < 40 && state.domains.run.end === null; i++) {
      events.push(...step(state, [...commands]));
      commands = [] as never;
    }
    expect(state.domains.run.end?.outcome).toBe('retreat');
    return { state, events };
  }

  it('lifts gold and item Trophies on exit, and records the bonus', () => {
    const plain = exitWith({});
    const pit = exitWith({ tradeBonus: 30 });
    const value = ITEMS.get(ITEM_MENDING_DRAUGHT.id).value * 2;
    const [plainItems, pitItems] = [itemValueToTrophies(value), itemValueToTrophies(value, 10, 30)];
    expect(pitItems).toBeGreaterThan(plainItems);
    expect(runResult(plain.state).converted).toEqual({ trophies: 10 + plainItems });
    expect(runResult(pit.state).converted).toEqual({ trophies: 13 + pitItems });
    expect(runResult(pit.state).extras['run.gold']).toMatchObject({ trophies: 13, bonus: 30 });
    expect(runResult(plain.state).extras['run.gold']).not.toHaveProperty('bonus');
    expect(runResult(pit.state).extras['run.items']).toMatchObject({ trophies: pitItems, bonus: 30 });
    const gold = pit.events.find((e) => e.type === 'goldSettled');
    expect(gold).toMatchObject({ gold: 100, trophies: 13, bonus: 30 });
    expect(text(RUN_DOMAIN_LOG_TEXT.goldSettled.text(gold as never, () => ''))).toBe('100 leftover gold converts to 13 Trophies, with the Smithy’s +30%.');
  });

  it('is not an Omen multiplier: it never touches the at-risk Trophies', () => {
    const plain = exitWith({});
    const pit = exitWith({ tradeBonus: 45 });
    expect(runResult(pit.state).atRisk).toEqual(runResult(plain.state).atRisk);
  });

  it('is lost with everything else in a wipe', () => {
    const { state, party } = setup({ tradeBonus: 45 });
    state.domains.items.gold = 100;
    addToInventory((party[0] as ActorEntity), { def: ITEM_BENT_NAIL.id, qty: 1 });
    expect(itemSale(state, 'wipe').trophies).toBe(0);
  });
});
