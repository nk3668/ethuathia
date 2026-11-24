/**
 * Selling carried items on exit (ETH-171): victory and retreat sell every living member's carried
 * and worn items for Trophies at base value; kit items, zero-value items, gold and the fallen's items
 * are not sold; a wipe loses everything; the sum is rounded down once. Fixed seeds, hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import {
  ITEM_ARMING_SWORD,
  ITEM_BENT_NAIL,
  ITEM_GOLD,
  ITEM_MENDING_DRAUGHT,
  ITEM_TRAIL_BISCUIT,
  itemValueToTrophies,
  VALUE_PER_TROPHY,
} from '../../src/content';
import { applyRunResult, newProfile } from '../../src/meta';
import {
  addToInventory,
  checkInvariants,
  createRun,
  getEntity,
  isKitItem,
  itemSale,
  newItem,
  runResult,
  soldOnExit,
  step,
  TROPHIES,
  VICTORY_CHECKS,
  wornItems,
} from '../../src/sim';
import type { ActorEntity, Command, EntityId, RunConfig, RunState, SimEvent, VictoryCheck } from '../../src/sim';

const A = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const B = { name: 'Isolde', classId: 'class.vanguard', raceId: 'race.human' };
const D1 = ['#######', '#<@@..#', '#######'];
const CONFIG: RunConfig = { party: [A, B], depth: 1, floorTexts: [D1], monsters: false };

function setup(): { state: RunState; a: ActorEntity; b: ActorEntity } {
  const state = createRun(CONFIG, 1);
  const [ia, ib] = state.party as [EntityId, EntityId];
  return { state, a: getEntity(state, ia) as ActorEntity, b: getEntity(state, ib) as ActorEntity };
}

function exitDungeon(state: RunState): SimEvent[] {
  const events: SimEvent[] = [];
  let commands: Command[] = [{ type: 'retreat' }];
  for (let i = 0; i < 30 && state.domains.run.end === null; i++) {
    events.push(...step(state, commands));
    commands = [];
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

function withVictoryCheck<T>(fn: () => T): T {
  const check: VictoryCheck = { id: 'victory.test_items', check: () => ({ applies: true, met: true, detail: 'Contract met.' }) };
  VICTORY_CHECKS.push(check);
  try {
    return fn();
  } finally {
    VICTORY_CHECKS.splice(VICTORY_CHECKS.indexOf(check), 1);
  }
}

describe('itemValueToTrophies', () => {
  it('uses VALUE_PER_TROPHY and rounds down', () => {
    expect(VALUE_PER_TROPHY).toBe(10);
    expect(itemValueToTrophies(0)).toBe(0);
    expect(itemValueToTrophies(-5)).toBe(0);
    expect(itemValueToTrophies(Number.NaN)).toBe(0);
    expect(itemValueToTrophies(9)).toBe(0);
    expect(itemValueToTrophies(25)).toBe(2);
    expect(itemValueToTrophies(25, 5)).toBe(5);
    expect(itemValueToTrophies(25, 0)).toBe(0);
  });
});

describe('soldOnExit', () => {
  it('leaves out kit items, zero-value items and gold', () => {
    expect(soldOnExit(newItem(ITEM_ARMING_SWORD.id))).toBe(true);
    expect(soldOnExit({ ...newItem(ITEM_ARMING_SWORD.id), kit: true })).toBe(false);
    expect(soldOnExit(newItem(ITEM_BENT_NAIL.id))).toBe(false);
    expect(soldOnExit(newItem(ITEM_GOLD.id, 50))).toBe(false);
  });
});

describe('items sold at run end', () => {
  it('sells the living members carried and worn items on a retreat, rounded once over the sum', () => {
    const { state, a, b } = setup();
    // Both start in kit gear, which is not sold. 3 x 30 + 2 x 5 + 45 (worn) = 145, 14 Trophies.
    expect(wornItems(a).every((w) => isKitItem(w.item))).toBe(true);
    addToInventory(a, newItem(ITEM_MENDING_DRAUGHT.id, 3));
    addToInventory(b, newItem(ITEM_TRAIL_BISCUIT.id, 2));
    addToInventory(b, newItem(ITEM_BENT_NAIL.id));
    addToInventory(b, newItem(ITEM_ARMING_SWORD.id));
    state.domains.items.gold = 5; // purse gold is never sold as an item

    const events = exitDungeon(state);
    expect(events.map((e) => e.type).slice(-2)).toEqual(['itemsSettled', 'runEnded']);
    expect(events.find((e) => e.type === 'itemsSettled')).toMatchObject({ items: 6, value: 145, trophies: 14, lost: false });

    const result = runResult(state);
    expect(result.outcome).toBe('retreat');
    expect(result.converted).toEqual({ [TROPHIES]: 14 });
    expect(result.extras['run.items']).toEqual({ items: 6, value: 145, trophies: 14, rate: VALUE_PER_TROPHY });
    const after = applyRunResult(newProfile(), result);
    expect(after.currencies.trophies).toBe((result.atRisk[TROPHIES] ?? 0) + 14);
    expect(after.history.recent[0]?.items).toEqual({ items: 6, value: 145, trophies: 14, rate: VALUE_PER_TROPHY });
  });

  it('sells on a victory and sums with gold conversion', () => {
    withVictoryCheck(() => {
      const { state, b } = setup();
      addToInventory(b, newItem(ITEM_MENDING_DRAUGHT.id, 2)); // value 60 -> 6 Trophies
      state.domains.items.gold = 25; // -> 2 Trophies
      exitDungeon(state);
      const result = runResult(state);
      expect(result.outcome).toBe('victory');
      expect(result.converted).toEqual({ [TROPHIES]: 8 });
      expect(result.extras['run.gold']).toMatchObject({ trophies: 2 });
      expect(result.extras['run.items']).toMatchObject({ items: 2, trophies: 6 });
    });
  });

  it('does not sell items on fallen members', () => {
    const { state, a, b } = setup();
    addToInventory(a, newItem(ITEM_MENDING_DRAUGHT.id, 3));
    addToInventory(b, newItem(ITEM_TRAIL_BISCUIT.id, 2)); // value 10 -> 1 Trophy
    a.actor.hp = 0;
    step(state, []);
    expect(state.domains.run.fallen).toContain(a.id);
    exitDungeon(state);
    const result = runResult(state);
    expect(result.extras['run.items']).toEqual({ items: 2, value: 10, trophies: 1, rate: VALUE_PER_TROPHY });
    expect(result.converted).toEqual({ [TROPHIES]: 1 });
  });

  it('loses everything on a wipe and converts nothing', () => {
    const { state, a, b } = setup();
    addToInventory(a, newItem(ITEM_MENDING_DRAUGHT.id, 3));
    addToInventory(b, newItem(ITEM_BENT_NAIL.id));
    a.actor.hp = 0;
    b.actor.hp = 0;
    const events = step(state, []);
    expect(events.map((e) => e.type).slice(-2)).toEqual(['itemsSettled', 'runEnded']);
    expect(events.find((e) => e.type === 'itemsSettled')).toMatchObject({ items: 3, value: 90, trophies: 0, lost: true });
    const result = runResult(state);
    expect(result.outcome).toBe('wipe');
    expect('converted' in result).toBe(false);
    expect(result.extras['run.items']).toEqual({ items: 3, value: 90, trophies: 0, rate: VALUE_PER_TROPHY });
    expect(applyRunResult(newProfile(), result).history.recent[0]?.items?.trophies).toBe(0);
  });

  it('records an empty sale and emits no event when nothing sells (kit only)', () => {
    const { state } = setup();
    const events = exitDungeon(state);
    expect(events.some((e) => e.type === 'itemsSettled')).toBe(false);
    expect(itemSale(state, 'retreat')).toEqual({ items: 0, value: 0, trophies: 0, rate: VALUE_PER_TROPHY });
    expect('converted' in runResult(state)).toBe(false);
  });
});
