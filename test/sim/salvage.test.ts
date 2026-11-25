/**
 * Field Salvage Kit (ETH-188): an overloaded adventurer breaks plain, identified gear into scrap
 * instead of dropping it; the scrap pays at-risk Trophies that Omens do not multiply; and the choice
 * never depends on what an unidentified item hides. Fixed seeds, a hand-built floor.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_IRON_CAP, ITEM_RIVETED_MAIL, ITEM_ROUND_SHIELD } from '../../src/content';
import {
  chooseRule,
  createRun,
  getEntity,
  isOverloaded,
  salvageOn,
  step,
  runSalvage,
  RUN_TRACKERS,
  trackerRewards,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, AiActor, Command, EntityId, ItemInstance, RunConfig, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ROOM = ['#########', '#@......#', '#.......#', '#########'];
const CAP = ITEM_IRON_CAP.id;
const MAIL = ITEM_RIVETED_MAIL.id;

function setup(pack: ItemInstance[], config: Partial<RunConfig> = { salvage: true }): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 1, floorText: ROOM, monsters: false, ...config }, 5);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  hero.inventory = {
    items: pack,
    equipped: { head: { def: CAP, qty: 1 }, body: { def: MAIL, qty: 1 }, offHand: { def: ITEM_ROUND_SHIELD.id, qty: 1 } },
  };
  return { state, hero };
}

const mails = (): ItemInstance[] => [1, 2, 3].map(() => ({ def: MAIL, qty: 1 }));
const choice = (state: RunState, hero: ActorEntity) => {
  const c = chooseRule({ state, actor: hero as AiActor });
  return { action: c?.action ?? null, request: c?.request ?? null };
};
const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });

describe('the salvage rule', () => {
  it('breaks the least valuable plain identified gear down instead of dropping it', () => {
    const { state, hero } = setup([...mails(), { def: CAP, qty: 1 }]);
    expect(salvageOn(state)).toBe(true);
    expect(isOverloaded(state, hero)).toBe(true);
    expect(choice(state, hero)).toEqual({ action: 'act.salvage_lowest', request: { id: 'salvage', index: 3 } });
  });

  it('falls back to dropping with the kit off', () => {
    const { state, hero } = setup([...mails(), { def: CAP, qty: 1 }], {});
    expect(choice(state, hero).action).toBe('act.drop_lowest');
  });

  it('drops, never salvages, enchanted, cursed, kit and unidentified gear', () => {
    const variants: ItemInstance[] = [
      { def: CAP, qty: 1, enchant: 1 },
      { def: CAP, qty: 1, blessing: 'cursed' },
      { def: CAP, qty: 1, enchantments: [{ id: 'enchant.keen', level: 1 }] },
      { def: CAP, qty: 1, kit: true },
      { def: CAP, qty: 1, identified: false },
    ];
    for (const variant of variants) {
      const { state, hero } = setup([...mails(), variant]);
      expect(choice(state, hero).action, JSON.stringify(variant)).not.toBe('act.salvage_lowest');
    }
    // Hidden or marked, and no upgrade: dropped.
    for (const variant of [{ def: CAP, qty: 1, kit: true as const }, { def: CAP, qty: 1, identified: false as const }]) {
      const { state, hero } = setup([...mails(), variant]);
      expect(choice(state, hero).action).toBe('act.drop_lowest');
    }
  });

  it('does not let an unidentified piece’s hidden properties change the decision', () => {
    const variants: ItemInstance[] = [
      { def: CAP, qty: 1, identified: false },
      { def: CAP, qty: 1, identified: false, enchant: 3, blessing: 'blessed', enchantments: [{ id: 'enchant.keen', level: 2 }] },
      { def: CAP, qty: 1, identified: false, enchant: -2, blessing: 'cursed' },
    ];
    const decisions = variants.map((v) => {
      const { state, hero } = setup([...mails(), v]);
      return choice(state, hero);
    });
    for (const d of decisions) expect(d).toEqual(decisions[0]);
  });

  it('never salvages a clear upgrade for its wearer', () => {
    const { state, hero } = setup([...mails(), { def: CAP, qty: 1 }]);
    // The pack's cap is the only entry worth less than the mail; make the worn head slot empty so it is an upgrade.
    Reflect.deleteProperty(hero.inventory?.equipped ?? {}, 'head');
    expect(choice(state, hero).action).not.toBe('act.salvage_lowest');
  });
});

describe('salvaging', () => {
  it('removes the item, logs it and tallies Trophies that join the at-risk total unmultiplied', () => {
    const { state, hero } = setup([...mails(), { def: CAP, qty: 1 }]);
    const events: SimEvent[] = step(state, [act(hero.id, { id: 'salvage', index: 3 })]);
    const salvaged = events.filter((e): e is Extract<SimEvent, { type: 'itemSalvaged' }> => e.type === 'itemSalvaged');
    expect(salvaged).toHaveLength(1);
    expect(salvaged[0]).toMatchObject({ item: CAP, qty: 1, value: ITEM_IRON_CAP.value });
    expect(hero.inventory?.items.some((i) => i.def === CAP)).toBe(false);
    expect(runSalvage(state)).toEqual({ items: 1, value: ITEM_IRON_CAP.value });
    expect(RUN_TRACKERS.find((t) => t.id === 'track.salvage')?.unmultiplied).toBe(true);
    expect(trackerRewards(state).trophies).toBe(Math.floor(ITEM_IRON_CAP.value / 10));
  });

  it('is refused for items it may not take, and with the kit off', () => {
    const { state, hero } = setup([...mails(), { def: CAP, qty: 1, enchant: 1 }]);
    const before = hero.inventory?.items.length;
    step(state, [act(hero.id, { id: 'salvage', index: 3 })]);
    expect(hero.inventory?.items.length).toBe(before);
    const off = setup([...mails(), { def: CAP, qty: 1 }], {});
    step(off.state, [act(off.hero.id, { id: 'salvage', index: 3 })]);
    expect(off.hero.inventory?.items.length).toBe(4);
  });

  it('is not multiplied by the reward multiplier', () => {
    const bonus = { runModifiers: [{ key: 'test', source: { id: 'test', label: 'Test' }, scope: 'party' as const, rewardBonus: 1 }] };
    const { state, hero } = setup([...mails(), { def: CAP, qty: 1 }], { salvage: true, ...bonus });
    step(state, [act(hero.id, { id: 'salvage', index: 3 })]);
    expect(trackerRewards(state).trophies).toBe(Math.floor(ITEM_IRON_CAP.value / 10));
  });
});
