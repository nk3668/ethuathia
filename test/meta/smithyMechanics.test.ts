/**
 * The Smithy nodes that needed new mechanics (ETH-188): Maker's Marks, the class kit upgrades, the
 * Forge Stamps / Apprentice Trinket pick and Field Salvage Kit, from purchase to run config.
 */
import { describe, expect, it } from 'vitest';
import { BUILDING_SMITHY, UPGRADES } from '../../src/content';
import { buildRunConfig, canPurchase, defaultRunChoices, describeGrant, newProfile, purchase, rankOf } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { addEntity, createRun, getEntity, getStat, step } from '../../src/sim';
import type { ActorEntity, EntityId } from '../../src/sim';

const SMITHY = BUILDING_SMITHY.id;
const id = (name: string) => `upgrade.${name}`;
const rich = (): Profile => ({
  ...newProfile(),
  currencies: { renown: 100_000, trophies: 100_000, favor: {} },
  milestones: { unlocked: [{ id: SMITHY, run: 1 }] },
});
const config = (p: Profile) => buildRunConfig(p, defaultRunChoices(), 7);

describe("Maker's Marks", () => {
  it('is a ranked identify bundle at the specced price', () => {
    const node = UPGRADES.get(id('makers_marks'));
    expect(node.cost).toEqual({ trophies: 35 });
    expect(node.ranks).toEqual({ max: 3, costGrowth: 1.5 });
    expect(node.tier).toBe(1);
    expect(describeGrant(node.grants[0] as never, 3)).toMatch(/24/);
  });

  it('adds 8 to the identify stat per rank credited to the node, and raises seeded pickup identification', () => {
    const statAt = (p: Profile) => {
      const state = createRun({ ...config(p), floorTexts: [['#####', '#<@.#', '#####']], depth: 1, monsters: false }, 3);
      return getStat(state, getEntity(state, state.party[0] as EntityId) as ActorEntity, 'identify');
    };
    let p = rich();
    const base = statAt(p).value;
    for (let rank = 1; rank <= 3; rank++) {
      p = purchase(p, id('makers_marks'));
      expect(rankOf(p, id('makers_marks'))).toBe(rank);
      const res = statAt(p);
      expect(res.value).toBe(Math.min(95, base + 8 * rank));
      expect(res.parts.filter((part) => part.source.id === id('makers_marks'))).toHaveLength(rank);
    }
    expect(canPurchase(p, id('makers_marks'))).toMatchObject({ ok: false, status: 'owned' });

    const identifiedCount = (prof: Profile) => {
      let hits = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const state = createRun({ ...config(prof), floorTexts: [['#####', '#<@.#', '#####']], depth: 1, monsters: false }, seed);
        const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
        const drop = addEntity(state, { def: 'item.oak_cudgel', floor: hero.floor, pos: hero.pos, item: { def: 'item.oak_cudgel', qty: 1, identified: false } });
        const events = step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'pickup', item: drop.id } }]);
        if (events.some((e) => e.type === 'itemIdentified' && e.method === 'wits')) hits++;
      }
      return hits;
    };
    expect(identifiedCount(p)).toBeGreaterThan(identifiedCount(rich()));
  });
});
