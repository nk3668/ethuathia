/**
 * Known-type potions and scrolls give nothing away about a hidden blessing or curse (ETH-147):
 * - an unidentified copy looks the same whatever its blessing, whether or not its type is known
 * - copies stack together, so a stack can hold plain, blessed and cursed copies
 * - using or dropping part of a mixed stack draws copies with the seeded loot stream
 * - identifying a mixed stack splits it into correctly labelled stacks
 * - the baseline AI cannot tell the copies apart
 */
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/content';
import { Rng } from '../../src/core';
import {
  addToStacks,
  canStack,
  checkInvariants,
  chooseRule,
  createRun,
  deserialize,
  drawHidden,
  getEntity,
  hiddenCounts,
  identifyItemFor,
  isItemIdentified,
  itemName,
  placeItem,
  rollItemProperties,
  serialize,
  snapshot,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActorEntity, AiActor, EntityId, ItemInstance, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const POTION = 'item.mending_draught';
const SCROLL_UNCURSE = 'item.scroll_of_uncursing';
const ROOM = ['#########', '#@......#', '#.......#', '#########'];

function setup(seed = 5): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 2, floorTexts: [ROOM, ROOM], monsters: false }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
const act = (state: RunState, hero: ActorEntity, action: Record<string, unknown>): SimEvent[] =>
  step(state, [{ type: 'playerAction', actor: hero.id, action: action as never }], { decide: waitDecide });
const hidden = (qty: number, blessing?: 'blessed' | 'cursed'): ItemInstance => ({
  def: POTION,
  qty,
  identified: false,
  ...(blessing === undefined ? {} : { blessing }),
});
/** A stack of 5 with 2 plain, 2 blessed and 1 cursed copy, built the way play builds it. */
function mixedStack(): ItemInstance[] {
  const stacks: ItemInstance[] = [];
  addToStacks(stacks, hidden(2));
  addToStacks(stacks, hidden(2, 'blessed'));
  addToStacks(stacks, hidden(1, 'cursed'));
  return stacks;
}

describe('every copy looks the same (ETH-147)', () => {
  for (const typeKnown of [false, true]) {
    it(`shows plain, blessed and cursed copies identically, type ${typeKnown ? 'known' : 'unknown'}`, () => {
      const views = [undefined, 'blessed' as const, 'cursed' as const].map((blessing) => {
        const { state, hero } = setup();
        if (typeKnown) state.domains.items.identifiedTypes.push(POTION);
        hero.inventory = { items: [hidden(1, blessing)] };
        const item = hero.inventory.items[0] as ItemInstance;
        expect(isItemIdentified(state, item)).toBe(false);
        return { view: snapshot(state).domains.items.members[hero.id]?.items[0], name: itemName(state, item, hero) };
      });
      expect(views[0]?.view?.unidentified).toBe(true);
      for (const v of views) expect(v).toEqual(views[0]);
      if (typeKnown) {
        expect(views[0]?.name).toBe('Mending draught');
        expect(views[0]?.view?.stateNote).toContain('Blessing unknown');
      }
    });
  }

  it('stacks the copies together and shows a mixed stack exactly like a pure one', () => {
    expect(canStack(hidden(1), hidden(1, 'cursed'))).toBe(true);
    const stacks = mixedStack();
    expect(stacks).toHaveLength(1);
    expect(stacks[0]).toMatchObject({ qty: 5, mix: { plain: 2, blessed: 2, cursed: 1 } });
    expect(stacks[0]?.blessing).toBeUndefined();
    const { state, hero } = setup();
    state.domains.items.identifiedTypes.push(POTION);
    hero.inventory = { items: stacks };
    const mixed = snapshot(state).domains.items.members[hero.id]?.items;
    hero.inventory = { items: [hidden(5)] };
    const pure = snapshot(state).domains.items.members[hero.id]?.items;
    expect(mixed).toEqual(pure);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('does not stack an identified copy with an unidentified one', () => {
    expect(canStack({ def: POTION, qty: 1 }, hidden(1))).toBe(false);
  });

  it('keeps counts straight when a stack overflows its size', () => {
    const stacks: ItemInstance[] = [];
    addToStacks(stacks, hidden(4, 'cursed'));
    addToStacks(stacks, hidden(4));
    expect(stacks.map((s) => s.qty)).toEqual([5, 3]);
    const total = stacks.reduce((n, s) => n + hiddenCounts(s).cursed, 0);
    expect(total).toBe(4);
    expect(stacks.reduce((n, s) => n + hiddenCounts(s).plain, 0)).toBe(4);
  });
});

describe('using and dropping from a mixed stack (ETH-147)', () => {
  const drawOrder = (seed: number): string[] => {
    const { state, hero } = setup(seed);
    hero.inventory = { items: mixedStack() };
    const out: string[] = [];
    for (let i = 0; i < 5; i++) {
      const events = act(state, hero, { id: 'use', index: 0 });
      const ident = ofType(events, 'itemIdentified')[0];
      out.push(ident === undefined ? '?' : ident.cursed === true ? 'cursed' : ident.plain === true ? 'plain' : 'blessed');
      expect(checkInvariants(state)).toEqual([]);
    }
    return out;
  };

  it('draws each copy from the seeded loot stream, deterministically, and uses every copy once', () => {
    const a = drawOrder(11);
    expect(a).toEqual(drawOrder(11));
    expect([...a].sort()).toEqual(['blessed', 'blessed', 'cursed', 'plain', 'plain']);
    expect(Array.from({ length: 12 }, (_, s) => drawOrder(s + 1).join()).filter((v, i, all) => all.indexOf(v) === i).length).toBeGreaterThan(3);
  });

  it('reveals only the used copy and keeps the rest hidden', () => {
    const { state, hero } = setup();
    hero.inventory = { items: mixedStack() };
    const events = act(state, hero, { id: 'use', index: 0 });
    expect(ofType(events, 'itemIdentified')).toHaveLength(1);
    const rest = hero.inventory.items;
    expect(rest).toHaveLength(1);
    expect(rest[0]?.qty).toBe(4);
    expect(rest[0]?.identified).toBe(false);
    expect(state.domains.items.identifiedTypes).toContain(POTION);
  });

  it('does not clear the flag on the other copies when the type is learned', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [hidden(3)] };
    act(state, hero, { id: 'use', index: 0 });
    expect(hero.inventory.items[0]).toMatchObject({ qty: 2, identified: false });
    expect(isItemIdentified(state, hero.inventory.items[0] as ItemInstance)).toBe(false);
  });

  it('splits a partial drop by a draw and merges the copies back on pickup', () => {
    const { state, hero } = setup();
    hero.inventory = { items: mixedStack() };
    const before = hiddenCounts(hero.inventory.items[0] as ItemInstance);
    act(state, hero, { id: 'drop', index: 0, qty: 3 });
    const left = hero.inventory.items[0] as ItemInstance;
    const floor = Object.values(state.entities).find((e) => e.item !== undefined)?.item as ItemInstance;
    expect(left.qty).toBe(2);
    expect(floor.qty).toBe(3);
    const l = hiddenCounts(left);
    const f = hiddenCounts(floor);
    expect(l.plain + f.plain).toBe(before.plain);
    expect(l.blessed + f.blessed).toBe(before.blessed);
    expect(l.cursed + f.cursed).toBe(before.cursed);
    act(state, hero, { id: 'pickup' });
    expect(hero.inventory.items).toHaveLength(1);
    expect(hero.inventory.items[0]).toMatchObject({ qty: 5, identified: false, mix: { plain: 2, blessed: 2, cursed: 1 } });
    expect(checkInvariants(state)).toEqual([]);
  });

  it('draws with the loot stream and nothing else', () => {
    const { state, hero } = setup();
    hero.inventory = { items: mixedStack() };
    const other = JSON.stringify({ ...state.rng, loot: undefined });
    act(state, hero, { id: 'drop', index: 0, qty: 3 });
    expect(JSON.stringify({ ...state.rng, loot: undefined })).toBe(other);
  });

  it('draws without replacement and conserves counts', () => {
    const rng = Rng.seeded(3, 'draw');
    for (let i = 0; i < 50; i++) {
      const got = drawHidden({ plain: 3, blessed: 2, cursed: 1 }, 4, rng);
      expect(got.plain + got.blessed + got.cursed).toBe(4);
      expect(got.plain).toBeLessThanOrEqual(3);
      expect(got.blessed).toBeLessThanOrEqual(2);
      expect(got.cursed).toBeLessThanOrEqual(1);
    }
  });
});

describe('identifying a mixed stack (ETH-147)', () => {
  it('splits it into correctly labelled stacks and logs each group', () => {
    const { state, hero } = setup();
    hero.inventory = { items: mixedStack() };
    const events: SimEvent[] = [];
    expect(identifyItemFor(state, hero, hero.inventory.items[0] as ItemInstance, 'effect', (e) => events.push(e as SimEvent))).toBe(true);
    const items = hero.inventory.items;
    expect(items.map((i) => i.qty).sort()).toEqual([1, 2, 2]);
    for (const i of items) {
      expect(i.identified).toBeUndefined();
      expect(i.mix).toBeUndefined();
    }
    expect(items.find((i) => i.blessing === undefined)?.qty).toBe(2);
    expect(items.find((i) => i.blessing === 'blessed')?.qty).toBe(2);
    expect(items.find((i) => i.qty === 1)?.blessing).toBe('cursed');
    const idents = ofType(events, 'itemIdentified');
    expect(idents).toHaveLength(3);
    expect(idents.filter((e) => e.plain === true)).toHaveLength(1);
    expect(idents.filter((e) => e.cursed === true)).toHaveLength(1);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('logs "no blessing or curse" for a plain copy', () => {
    const { state, hero } = setup();
    hero.inventory = { items: [hidden(1)] };
    const events = act(state, hero, { id: 'use', index: 0 });
    expect(ofType(events, 'itemIdentified')).toMatchObject([{ item: POTION, method: 'use', plain: true }]);
  });

  it('cannot farm Wits rolls by splitting and merging a stack', () => {
    const { state, hero } = setup();
    if (hero.stats !== undefined) hero.stats.attributes = { wits: -5 };
    placeItem(state, 'd1', hero.pos, { ...(mixedStack()[0] as ItemInstance) });
    expect(ofType(act(state, hero, { id: 'pickup' }), 'itemIdentified')).toEqual([]);
    expect(hero.inventory?.items[0]?.identifyTried).toBe(true);
    if (hero.stats !== undefined) hero.stats.attributes = { wits: 40 };
    for (let i = 0; i < 8; i++) {
      act(state, hero, { id: 'drop', index: 0, qty: 1 + (i % 4) });
      for (let k = 0; k < 3; k++) expect(ofType(act(state, hero, { id: 'pickup' }), 'itemIdentified')).toEqual([]);
    }
    expect(hero.inventory?.items.every((i) => i.identified === false)).toBe(true);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('turns hidden cursed copies plain when uncursed, and keeps the stack unidentified', () => {
    const { state, hero } = setup();
    const stack = mixedStack()[0] as ItemInstance;
    hero.inventory = { items: [stack, { def: SCROLL_UNCURSE, qty: 1 }] };
    state.domains.items.identifiedTypes.push(SCROLL_UNCURSE);
    const events = act(state, hero, { id: 'use', index: 1 });
    expect(ofType(events, 'itemUncursed')).toHaveLength(0);
    hero.inventory = { items: [stack, { def: SCROLL_UNCURSE, qty: 1, blessing: 'blessed' }] };
    const blessed = act(state, hero, { id: 'use', index: 1 });
    expect(ofType(blessed, 'itemUncursed')).toHaveLength(1);
    expect(hero.inventory.items[0]).toMatchObject({ qty: 5, identified: false, mix: { plain: 3, blessed: 2 } });
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('the baseline AI cannot see a hidden blessing (ETH-147)', () => {
  const variants: [string, ItemInstance[]][] = [
    ['all plain', [hidden(3)]],
    ['all blessed', [hidden(3, 'blessed')]],
    ['all cursed', [hidden(3, 'cursed')]],
    ['mixed', mixedStack().map((s) => ({ ...s, qty: 3, mix: { plain: 1, blessed: 1, cursed: 1 } }))],
  ];

  it('quaffs the same potion with the same reasoning whatever the copies hide', () => {
    const choices = variants.map(([, items]) => {
      const { state, hero } = setup();
      state.domains.items.identifiedTypes.push(POTION);
      hero.inventory = { items: items.map((i) => ({ ...i })) };
      hero.actor.hp = 2;
      const c = chooseRule({ state, actor: hero as AiActor });
      return { action: c?.action, detail: c?.detail };
    });
    expect(choices[0]?.action).toBe('act.quaff_healing');
    for (const c of choices) expect(c).toEqual(choices[0]);
  });

  it('reads an unknown scroll the same way whatever it hides', () => {
    const scroll = (blessing?: 'blessed' | 'cursed'): ItemInstance => ({ def: SCROLL_UNCURSE, qty: 1, identified: false, ...(blessing === undefined ? {} : { blessing }) });
    const picks = [undefined, 'blessed' as const, 'cursed' as const].map((b) => {
      const { state, hero } = setup();
      hero.inventory = { items: [scroll(b)] };
      step(state, [], { decide: waitDecide });
      const c = chooseRule({ state, actor: hero as AiActor });
      return { action: c?.action, detail: c?.detail };
    });
    for (const p of picks) expect(p).toEqual(picks[0]);
  });

  it('plays a run to the same decisions with plain or blessed hidden potions', () => {
    const run = (blessing?: 'blessed' | 'cursed'): string[] => {
      const { state, hero } = setup(9);
      state.domains.items.identifiedTypes.push(POTION);
      hero.inventory = { items: [hidden(3, blessing)] };
      hero.actor.hp = 3;
      const names: string[] = [];
      for (let i = 0; i < 6; i++) {
        const c = chooseRule({ state, actor: hero as AiActor });
        names.push(`${c?.action}:${c?.detail}`);
        step(state, [], { decide: waitDecide });
      }
      return names;
    };
    expect(run('blessed')).toEqual(run());
    expect(run('cursed')).toEqual(run());
  });
});

describe('saving a mixed stack (ETH-147)', () => {
  it('round-trips through serialize and flags a broken mix', () => {
    const { state, hero } = setup();
    hero.inventory = { items: mixedStack() };
    const back = deserialize(serialize(state));
    expect(back).toEqual(state);
    const bad = setup();
    bad.hero.inventory = {
      items: [
        { def: POTION, qty: 3, identified: false, mix: { plain: 1, cursed: 1 } },
        { def: POTION, qty: 2, mix: { plain: 1, cursed: 1 } },
        { def: POTION, qty: 2, identified: false, blessing: 'blessed', mix: { plain: 1, cursed: 1 } },
      ],
    };
    const problems = checkInvariants(bad.state).join('\n');
    expect(problems).toContain('counts 2 copies but the stack has 3');
    expect(problems).toContain('not an unidentified potion or scroll');
    expect(problems).toContain('both a blessing and a mix');
  });
});

describe('secret-bearing events and loot (ETH-147, §11.6)', () => {
  it('flags every potion and scroll identified: false, plain or not', () => {
    const rng = Rng.seeded(42, 'consumable-guard');
    let plain = 0;
    let rolled = 0;
    for (const def of ITEMS.all().filter((d) => d.category === 'potion' || d.category === 'scroll')) {
      for (let depth = 1; depth <= 10; depth++) {
        for (let i = 0; i < 60; i++) {
          const props = rollItemProperties(def, depth, rng);
          expect(props.identified, `${def.id} at depth ${depth}`).toBe(false);
          expect(props.mix).toBeUndefined();
          if (props.blessing === undefined) plain++;
          else rolled++;
        }
      }
    }
    expect(plain).toBeGreaterThan(0);
    expect(rolled).toBeGreaterThan(0);
  });

  it('emits identical pickup, drop and sighting events for plain, blessed and cursed copies', () => {
    const runs = [undefined, 'blessed' as const, 'cursed' as const].map((blessing) => {
      const { state, hero } = setup();
      state.domains.items.identifiedTypes.push(POTION);
      if (hero.stats !== undefined) hero.stats.attributes = { wits: -5 };
      placeItem(state, 'd1', hero.pos, hidden(2, blessing));
      const events = [...act(state, hero, { id: 'pickup' }), ...act(state, hero, { id: 'drop', index: 0, qty: 1 })];
      const strip = events.filter((e) => ['pickedUp', 'dropped', 'itemSighted'].includes(e.type));
      return { strip, items: snapshot(state).domains.items };
    });
    expect(runs[0]?.strip.length).toBeGreaterThan(0);
    for (const r of runs) expect(r).toEqual(runs[0]);
  });
});
