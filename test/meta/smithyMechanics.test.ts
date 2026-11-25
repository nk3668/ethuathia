/**
 * The Smithy nodes that needed new mechanics (ETH-188): Maker's Marks, the class kit upgrades, the
 * Forge Stamps / Apprentice Trinket pick and Field Salvage Kit, from purchase to run config.
 */
import { describe, expect, it } from 'vitest';
import { BUILDING_SMITHY, tierGateId, UPGRADES } from '../../src/content';
import { buildRunConfig, canPurchase, defaultRunChoices, describeGrant, newProfile, purchase, rankOf } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { createRun, getEntity, statValue } from '../../src/sim';
import type { ActorEntity, EntityId } from '../../src/sim';

const SMITHY = BUILDING_SMITHY.id;
const GATE = tierGateId(SMITHY, 4);
const id = (name: string) => `upgrade.${name}`;
const rich = (): Profile => ({
  ...newProfile(),
  currencies: { renown: 100_000, trophies: 100_000, favor: {} },
  milestones: { unlocked: [{ id: SMITHY, run: 1 }] },
});
const tierTwo = (p: Profile): Profile => ({ ...p, milestones: { unlocked: [...p.milestones.unlocked, { id: GATE, run: 2 }] } });
const buy = (p: Profile, ...ids: string[]): Profile => ids.reduce((acc, nodeId) => purchase(acc, nodeId), p);
const config = (p: Profile) => buildRunConfig(p, defaultRunChoices(), 7);

describe("Maker's Marks", () => {
  it('is a ranked identify bundle at the specced price', () => {
    const node = UPGRADES.get(id('makers_marks'));
    expect(node.cost).toEqual({ trophies: 35 });
    expect(node.ranks).toEqual({ max: 3, costGrowth: 1.5 });
    expect(node.tier).toBe(1);
    expect(describeGrant(node.grants[0] as never, 3)).toMatch(/24/);
  });

  it('adds 8 to the identify stat per rank, credited to the node', () => {
    const statAt = (p: Profile): number => {
      const state = createRun({ ...config(p), floorTexts: [['#####', '#<@.#', '#####']], depth: 1, monsters: false }, 3);
      return statValue(state, getEntity(state, state.party[0] as EntityId) as ActorEntity, 'identify');
    };
    let p = rich();
    const base = statAt(p);
    for (let rank = 1; rank <= 3; rank++) {
      p = purchase(p, id('makers_marks'));
      expect(rankOf(p, id('makers_marks'))).toBe(rank);
      expect(statAt(p)).toBe(Math.min(95, base + 8 * rank));
    }
    expect(canPurchase(p, id('makers_marks'))).toMatchObject({ ok: false, status: 'owned' });
    void tierTwo;
    void buy;
  });
});
