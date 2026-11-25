/**
 * The Quartermaster's Mystery Crate (ETH-187): the table is sound, the roll is seeded and leaves
 * the dungeon alone, the item is unidentified kit that is never sold, and the log never names it.
 */
import { describe, expect, it } from 'vitest';
import { CRATE_TABLE, crateTableProblems, isCrateDud, ITEMS, UPGRADE_MYSTERY_CRATE } from '../../src/content';
import type { CrateEntry } from '../../src/content';
import { buildRunConfig, defaultRunChoices, newProfile } from '../../src/meta';
import type { Profile } from '../../src/meta';
import {
  checkInvariants,
  createRun,
  crateItem,
  getEntity,
  isItemIdentified,
  itemSale,
  rollCrate,
  serialize,
  soldOnExit,
  step,
} from '../../src/sim';
import type { ActorEntity, RunConfig, SimEvent } from '../../src/sim';
import { RUN_DOMAIN_LOG_TEXT } from '../../src/ui/shell/logText/run';

const ROOM = ['#########', '#<@.....#', '#.......#', '#########'];
const member = (name: string) => ({ name, classId: 'class.vanguard', raceId: 'race.human' });

const owner = (): Profile => {
  const profile = newProfile();
  return { ...profile, upgrades: { owned: [UPGRADE_MYSTERY_CRATE.id], ranks: {} } };
};
const config = (on: boolean, party = [member('Hero'), member('Mira')]): RunConfig => ({
  ...buildRunConfig(owner(), { ...defaultRunChoices(), optIns: { enabled: on ? [UPGRADE_MYSTERY_CRATE.id] : [] } }, 1),
  party,
  floorTexts: [ROOM],
  depth: 1,
  monsters: false,
});
const packOf = (e: ActorEntity) => e.inventory?.items ?? [];
const kitOf = (state: ReturnType<typeof createRun>, i: number) => getEntity(state, state.party[i] as number) as ActorEntity;

describe('the crate table', () => {
  it('is sound, with gifts and duds', () => {
    expect(crateTableProblems()).toEqual([]);
    expect(CRATE_TABLE.some(isCrateDud)).toBe(true);
    expect(CRATE_TABLE.some((e) => !isCrateDud(e))).toBe(true);
    // Rings and amulets are among the finds, as the spec promises.
    expect(CRATE_TABLE.some((e) => ITEMS.get(e.item).category === 'jewelry')).toBe(true);
  });

  it('rejects an unknown item, a bad weight, a bad enchantment, and a table without duds', () => {
    const gift = CRATE_TABLE.find((e) => !isCrateDud(e)) as CrateEntry;
    expect(crateTableProblems([{ item: 'item.nope', weight: 1 }, ...CRATE_TABLE]).join()).toContain('unknown item');
    expect(crateTableProblems([{ ...gift, weight: 0 }, ...CRATE_TABLE]).join()).toContain('weight');
    expect(crateTableProblems([{ item: 'item.copper_band', weight: 1, enchant: 9 }, ...CRATE_TABLE]).join()).toContain('outside');
    expect(crateTableProblems([{ item: 'item.mending_draught', weight: 1, enchant: 1 }, ...CRATE_TABLE]).join()).toContain('only gear');
    expect(crateTableProblems([{ item: 'item.trail_biscuit', weight: 1 }, ...CRATE_TABLE]).join()).toContain('cannot sit');
    expect(crateTableProblems(CRATE_TABLE.filter((e) => !isCrateDud(e))).join()).toContain('no cursed entry');
    expect(crateTableProblems(CRATE_TABLE.filter(isCrateDud)).join()).toContain('nothing but duds');
  });

  it('makes a valid, unidentified, unsold kit item of every entry', () => {
    for (const entry of CRATE_TABLE) {
      const state = createRun({ ...config(false), startCrate: true }, 1);
      const hero = kitOf(state, 0);
      const item = crateItem(entry);
      hero.inventory = { items: [item] };
      expect(item.identified).toBe(false);
      expect(isItemIdentified(state, item)).toBe(false);
      expect(soldOnExit(item)).toBe(false);
      expect(checkInvariants(state), entry.item).toEqual([]);
    }
  });
});

describe('the run with the crate', () => {
  it('gives the first adventurer exactly one unidentified kit item, and nobody else', () => {
    const state = createRun(config(true), 1);
    const [first, second] = [kitOf(state, 0), kitOf(state, 1)];
    const crate = packOf(first).filter((i) => i.identified === false);
    expect(crate).toHaveLength(1);
    expect(crate[0]?.kit).toBe(true);
    expect(packOf(second).filter((i) => i.identified === false)).toHaveLength(0);
    expect(checkInvariants(state)).toEqual([]);
    // It is never sold on the way out.
    expect(itemSale(state, 'retreat')).toMatchObject({ items: 0, trophies: 0 });
  });

  it('rolls from the seed alone: the same seed gives the same crate, and seeds vary', () => {
    expect(rollCrate(7)).toBe(rollCrate(7));
    const seen = new Set(Array.from({ length: 60 }, (_, seed) => rollCrate(seed).item + String(rollCrate(seed).blessing)));
    expect(seen.size).toBeGreaterThan(3);
    const duds = Array.from({ length: 400 }, (_, seed) => rollCrate(seed)).filter(isCrateDud).length;
    expect(duds).toBeGreaterThan(40);
    expect(duds).toBeLessThan(160);
  });

  it('leaves the dungeon and every RNG stream exactly as they are with it off', () => {
    const on = createRun(config(true), 5);
    const off = createRun(config(false), 5);
    expect(on.rng).toEqual(off.rng);
    expect(on.floors).toEqual(off.floors);
    expect(on.dungeon).toEqual(off.dungeon);
    // An owned but switched-off crate is a run like one without the node.
    const none = createRun({ ...buildRunConfig(newProfile(), defaultRunChoices(), 1), party: [member('Hero'), member('Mira')], floorTexts: [ROOM], depth: 1, monsters: false }, 5);
    expect(serialize(off)).toBe(serialize(none));
  });

  it('adds nothing when the node is off, and nothing without the node', () => {
    expect(config(false).startCrate).toBeUndefined();
    expect(buildRunConfig(newProfile(), defaultRunChoices(), 1).startCrate).toBeUndefined();
    expect(packOf(kitOf(createRun(config(false), 1), 0)).every((i) => i.identified !== false)).toBe(true);
  });

  it('says a crate is carried, and never what is in it', () => {
    const state = createRun(config(true), 1);
    const events: SimEvent[] = step(state, []);
    const issued = events.filter((e) => e.type === 'crateIssued');
    expect(issued).toHaveLength(1);
    const text = RUN_DOMAIN_LOG_TEXT.crateIssued.text(issued[0] as never, () => '');
    const line = Array.isArray(text) ? text.join('') : text;
    expect(line).toContain('Quartermaster');
    const content = packOf(kitOf(state, 0)).find((i) => i.identified === false);
    expect(content).toBeDefined();
    expect(line).not.toContain(ITEMS.get(content?.def as string).name);
    // The ordinary kit event leaves the crate item out.
    const kit = events.filter((e): e is Extract<SimEvent, { type: 'kitIssued' }> => e.type === 'kitIssued');
    expect(kit.flatMap((e) => e.items)).not.toContain(content?.def as string);
  });
});
