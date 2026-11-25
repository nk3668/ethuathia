/**
 * The Smithy tree, Tiers I and II (ETH-159): the nodes that build on existing systems, the Tier II
 * lock behind the *Star-Iron* quest, and how bought nodes reach the run config.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDING_SMITHY,
  buildingNodes,
  CONTRACT_STAR_IRON,
  CONTRACTS,
  ITEM_SCROLL_OF_IDENTIFY,
  ITEM_SCROLL_OF_UNCURSING,
  opensTarget,
  tierGateId,
  UPGRADES,
} from '../../src/content';
import {
  applyRunResult,
  buildRunConfig,
  canPurchase,
  capacity,
  checkRunConfig,
  defaultRunChoices,
  describeGrant,
  isMilestoneOpen,
  newProfile,
  partySize,
  purchase,
  questOffer,
  rankOf,
  tierGate,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import type { UpgradeGrant } from '../../src/content';
import { describeObjective, emptyRunResult } from '../../src/sim';

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
/** Tier I bought, Tier II open and the pit bought: what every Tier II kit node needs. */
const withPit = (): Profile => purchase(tierTwo(buy(rich(), id('fitted_straps'), id('appraisers_eye'), id('reinforced_wagon'))), id('smelting_pit'));

describe('the tree', () => {
  it('has the Tier I and II nodes of the approved page, keeps the recruit ids and names them anew', () => {
    const ids = buildingNodes(SMITHY).map((n) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'upgrade.fitted_straps',
        'upgrade.appraisers_eye',
        'upgrade.reinforced_wagon',
        'upgrade.reaver_training',
        'upgrade.stonekin_recruitment',
        'upgrade.smelting_pit',
        'upgrade.runed_implements',
        'upgrade.warded_attire',
        'upgrade.scroll_case',
        'upgrade.assayers_ledger',
      ]),
    );
    expect(UPGRADES.get('upgrade.reaver_training').name).toBe('Ironmonger Contract');
    expect(UPGRADES.get('upgrade.stonekin_recruitment').name).toBe('Quarry Pact');
    expect(UPGRADES.get('upgrade.reaver_training').tier).toBe(3);
    expect(UPGRADES.get('upgrade.stonekin_recruitment').tier).toBe(4);
  });

  it('is paid in Trophies at the specced prices, with ranks on straps and the pit', () => {
    const cost = (name: string) => UPGRADES.get(id(name)).cost;
    expect(cost('fitted_straps')).toEqual({ trophies: 75 });
    expect(UPGRADES.get(id('fitted_straps')).ranks).toEqual({ max: 3, costGrowth: 1.5 });
    expect(cost('appraisers_eye')).toEqual({ trophies: 450 });
    expect(cost('reinforced_wagon')).toEqual({ trophies: 2400 });
    expect(cost('smelting_pit')).toEqual({ trophies: 360 });
    expect(UPGRADES.get(id('smelting_pit')).ranks).toEqual({ max: 3, costGrowth: 1.6 });
    expect(cost('runed_implements')).toEqual({ trophies: 1200 });
    expect(cost('warded_attire')).toEqual({ trophies: 1200 });
    expect(cost('scroll_case')).toEqual({ trophies: 1050 });
    expect(cost('assayers_ledger')).toEqual({ trophies: 1500 });
  });

  it('has no placeholder left', () => {
    expect(BUILDING_SMITHY.tags).not.toContain('placeholder');
    for (const node of buildingNodes(SMITHY)) expect(node.description.length, node.id).toBeGreaterThan(20);
  });
});

describe('the Tier II lock', () => {
  it('opens at row 4 on the Star-Iron quest, floor 5, with its own contract', () => {
    expect(BUILDING_SMITHY.tierGates?.map((g) => g.fromTier)).toEqual([4]);
    expect(CONTRACTS.get(CONTRACT_STAR_IRON.id)).toBe(CONTRACT_STAR_IRON);
    expect(opensTarget(CONTRACT_STAR_IRON)).toBe(GATE);
    expect(describeObjective(CONTRACT_STAR_IRON.objective)).toBe('Find the Star-iron on floor 5 and carry it out');
    expect(tierGate(rich(), SMITHY, 3)).toBeNull();
    expect(tierGate(rich(), SMITHY, 4)).not.toBeNull();
  });

  it('keeps every Tier II row unbuyable until the quest is done, whatever the player can afford', () => {
    const p = buy(rich(), id('fitted_straps'), id('appraisers_eye'), id('reinforced_wagon'));
    for (const name of ['stonekin_recruitment', 'smelting_pit', 'runed_implements', 'warded_attire', 'scroll_case', 'assayers_ledger']) {
      expect(canPurchase(p, id(name)), name).toMatchObject({ ok: false, status: 'locked' });
    }
    expect(() => purchase(p, id('smelting_pit'))).toThrow(/Tier 4 and up open/);
  });

  it('opens once a run walks out with the star-iron, and then the rows are buyable', () => {
    const p = buy(rich(), id('fitted_straps'), id('appraisers_eye'), id('reinforced_wagon'));
    const done = applyRunResult(p, {
      ...emptyRunResult('retreat'),
      extras: { 'quests.objectives': [{ key: `contract:${CONTRACT_STAR_IRON.id}`, owner: { kind: 'contract', id: CONTRACT_STAR_IRON.id }, status: 'complete' }] },
    });
    expect(isMilestoneOpen(done, GATE)).toBe(true);
    expect(canPurchase(done, id('smelting_pit'))).toEqual({ ok: true });
  });

  it('offers the quest after half of Tier I is bought, not before', () => {
    const none = rich();
    expect(questOffer(none, CONTRACT_STAR_IRON).state).toBe('locked');
    expect(questOffer(buy(none, id('fitted_straps')), CONTRACT_STAR_IRON).state).toBe('locked');
    expect(questOffer(buy(none, id('fitted_straps'), id('appraisers_eye')), CONTRACT_STAR_IRON).state).toBe('locked');
    // Straps I is a third of a node; with the eye, the wagon, the marks and a pick of the kit pair that is 3.7 of the 6 Tier I slots.
    expect(questOffer(buy(none, id('fitted_straps'), id('appraisers_eye'), id('reinforced_wagon'), id('makers_marks'), id('artisan_implements')), CONTRACT_STAR_IRON)).toEqual({ state: 'offered' });
    expect(questOffer(tierTwo(none), CONTRACT_STAR_IRON)).toEqual({ state: 'done' });
  });
});

describe('what the nodes give a run', () => {
  it('Fitted Straps adds 2 carry per rank to every adventurer', () => {
    let p = rich();
    for (let rank = 1; rank <= 3; rank++) {
      p = purchase(p, id('fitted_straps'));
      expect(rankOf(p, id('fitted_straps'))).toBe(rank);
      expect(config(p).partyBundles?.filter((b) => b === id('fitted_straps'))).toHaveLength(rank);
    }
    expect(describeGrant(UPGRADES.get(id('fitted_straps')).grants[0] as UpgradeGrant, 3)).toBe('+6 carry for each adventurer');
    expect(canPurchase(p, id('fitted_straps'))).toMatchObject({ ok: false, status: 'owned' });
  });

  it('Reinforced Wagon is a party-size grant like the Guild Hall berths', () => {
    expect(UPGRADES.get(id('reinforced_wagon')).grants).toEqual([{ kind: 'capacity', key: 'partySize', amount: 1 }]);
    const before = partySize(rich());
    const p = buy(rich(), id('fitted_straps'), id('appraisers_eye'), id('reinforced_wagon'));
    expect(partySize(p)).toBe(Math.min(4, before + 1));
  });

  it('Smelting Pit adds 15% trade bonus per rank, and nothing without it', () => {
    expect(config(rich()).tradeBonus).toBeUndefined();
    let p = tierTwo(buy(rich(), id('fitted_straps'), id('appraisers_eye'), id('reinforced_wagon')));
    for (let rank = 1; rank <= 3; rank++) {
      p = purchase(p, id('smelting_pit'));
      expect(capacity(p, 'tradeBonus', 0)).toBe(15 * rank);
      expect(config(p).tradeBonus).toBe(15 * rank);
    }
  });

  it('puts each kit node in the run config, and only what was bought', () => {
    expect(config(rich())).not.toHaveProperty('startKnown');
    expect(config(rich())).not.toHaveProperty('kitEnchant');
    expect(config(rich())).not.toHaveProperty('startStock');
    const base = withPit();
    expect(config(base).startKnown).toEqual(['potion']);
    const runed = purchase(base, id('runed_implements'));
    expect(config(runed).kitEnchant).toEqual(['weapon']);
    const warded = purchase(base, id('warded_attire'));
    expect(config(warded).kitEnchant).toEqual(['defense']);
    const cased = buy(base, id('scroll_case'));
    expect(config(cased).startStock).toEqual([
      { item: ITEM_SCROLL_OF_IDENTIFY.id, qty: 1 },
      { item: ITEM_SCROLL_OF_UNCURSING.id, qty: 1 },
    ]);
    const full = buy(runed, id('scroll_case'), id('assayers_ledger'));
    expect(config(full)).toMatchObject({ startKnown: ['potion', 'jewelry'], kitEnchant: ['weapon'] });
    expect(checkRunConfig(config(full))).toEqual([]);
  });

  it('makes Runed Implements and Warded Attire a pick-one', () => {
    const base = withPit();
    const runed = purchase(base, id('runed_implements'));
    expect(canPurchase(runed, id('warded_attire'))).toMatchObject({ ok: false, status: 'excluded' });
  });

  it('words every start grant for its tooltip', () => {
    const words = (name: string) => UPGRADES.get(id(name)).grants.map((g) => describeGrant(g));
    expect(words('appraisers_eye')).toEqual(['Knows every potion kind from the first turn']);
    expect(words('assayers_ledger')).toEqual(['Knows every ring and amulet kind from the first turn']);
    expect(words('runed_implements')).toEqual(["Starts with the main-hand item of each adventurer's kit at +1"]);
    expect(words('warded_attire')).toEqual(["Starts with the defensive piece of each adventurer's kit at +1"]);
    expect(words('scroll_case')).toEqual(['The party starts with 1 Scroll of identify', 'The party starts with 1 Scroll of uncursing']);
    expect(words('smelting_pit')).toEqual(['Trade bonus (%) +15']);
  });
});
