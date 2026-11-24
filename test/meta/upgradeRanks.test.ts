/**
 * Ranked nodes and quest-locked building tiers (ETH-172). Test-only buildings and nodes; no
 * shipped content has ranks or gates yet.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDING_KIND,
  checkKinds,
  defineBuilding,
  defineUpgrade,
  roundCost,
  UPGRADE_KIND,
  UPGRADES,
} from '../../src/content';
import type { ContentKind, Milestone, UpgradeNodeDef } from '../../src/content';
import { Registry } from '../../src/core';
import type { Def } from '../../src/core';
import {
  applyRunResult,
  canPurchase,
  capacity,
  checkProfile,
  closedGates,
  decodeSave,
  describeGrant,
  encodeSave,
  latestUnlocks,
  milestoneTargets,
  newProfile,
  nextRankCost,
  nodeStatus,
  profileGrants,
  purchase,
  rankCost,
  rankOf,
  respec,
  respecPlan,
  resetPlan,
  resetTree,
  tierGate,
  upgradePartyBundles,
  upgradeRunModifiers,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult, runModifierListProblems } from '../../src/sim';

const B = 'building.test_ranks';
const GATED = 'building.test_tiers';

defineBuilding({ id: B, name: 'Test Ranks', description: 'Ranked test nodes.', tags: [], kind: 'foundations' });
defineBuilding({
  id: GATED,
  name: 'Test Tiers',
  description: 'Gated test tiers.',
  tags: [],
  kind: 'tactics',
  tierGates: [
    { fromTier: 3, unlock: { kind: 'reachDepth', depth: 4 } },
    { fromTier: 5, unlock: { kind: 'reachDepth', depth: 6 }, name: 'The deep vault' },
  ],
});

const node = (id: string, building: string, tier: number, column: number, fields: Partial<UpgradeNodeDef> = {}) =>
  defineUpgrade({
    id: `upgrade.${id}`,
    name: id,
    description: 'A test node.',
    tags: [],
    building,
    tier,
    column,
    cost: { renown: 10 },
    requires: [],
    grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
    ...fields,
  });

// 100, 150, 230, 340, 510 (see the rounding test); +1 party size per rank.
node('rk_rooms', B, 1, 0, { cost: { renown: 100 }, ranks: { max: 5, costGrowth: 1.5 } });
// 10, 20, 40; +2 hp per rank for each adventurer.
node('rk_hp', B, 1, 1, {
  ranks: { max: 3, costGrowth: 2 },
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 2 }] } }],
});
node('rk_run', B, 1, 2, {
  ranks: { max: 2, costGrowth: 1 },
  grants: [{ kind: 'bundle', scope: 'run', bundle: { modifiers: [{ stat: 'sight', op: 'add', value: 1 }] } }],
});
// A ranked pick-one pair, and a node that needs the left one.
node('rk_left', B, 2, 0, { cost: { renown: 20 }, ranks: { max: 3, costGrowth: 2 }, exclusiveGroup: 'test_ranks.t2', requires: ['upgrade.rk_rooms'] });
node('rk_right', B, 2, 1, { cost: { renown: 20 }, exclusiveGroup: 'test_ranks.t2', requires: ['upgrade.rk_rooms'] });
node('rk_after', B, 3, 0, { cost: { renown: 40 }, requires: ['upgrade.rk_left'] });

// A tree with gates before rows 3 and 5.
node('tr_a', GATED, 1, 0);
node('tr_b', GATED, 2, 0, { requires: ['upgrade.tr_a'] });
node('tr_c', GATED, 3, 0, { requires: ['upgrade.tr_b'] });
node('tr_d', GATED, 4, 0, { requires: ['upgrade.tr_c'] });
node('tr_e', GATED, 5, 0, { requires: ['upgrade.tr_d'], ranks: { max: 2, costGrowth: 1 } });

function rich(renown = 100_000): Profile {
  const p = newProfile();
  return { ...p, currencies: { ...p.currencies, renown } };
}

const buy = (p: Profile, ...ids: string[]): Profile => ids.reduce((acc, id) => purchase(acc, `upgrade.${id}`), p);
const node_ = (id: string) => UPGRADES.get(`upgrade.${id}`);
const asDepth = (profile: Profile, deepestDepth: number): Profile => applyRunResult(profile, { ...emptyRunResult('retreat'), deepestDepth });

describe('rank costs', () => {
  it('rounds to a readable number, and never goes below the rank before', () => {
    const costs = [1, 2, 3, 4, 5].map((r) => rankCost(node_('rk_rooms'), r).renown);
    expect(costs).toEqual([100, 150, 230, 340, 510]);
    expect([1, 2, 3].map((r) => rankCost(node_('rk_hp'), r).renown)).toEqual([10, 20, 40]);
    expect(roundCost(4.4)).toBe(4);
    expect(roundCost(0.2)).toBe(1);
    expect(roundCost(1234)).toBe(1200);
    expect(roundCost(99_999)).toBe(100_000);
    // Growth 1 keeps every rank at the base price; the costs never fall.
    expect([1, 2].map((r) => rankCost(node_('rk_run'), r).renown)).toEqual([10, 10]);
    for (const n of [node_('rk_rooms'), node_('rk_hp'), node_('rk_left')]) {
      const prices = Array.from({ length: n.ranks?.max ?? 1 }, (_, i) => rankCost(n, i + 1).renown);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    }
  });

  it('rounds each currency on its own', () => {
    const two: UpgradeNodeDef = { ...node_('rk_rooms'), cost: { renown: 100, trophies: 7 }, ranks: { max: 3, costGrowth: 1.5 } };
    expect([1, 2, 3].map((r) => rankCost(two, r))).toEqual([
      expect.objectContaining({ renown: 100, trophies: 7 }),
      expect.objectContaining({ renown: 150, trophies: 11 }),
      expect.objectContaining({ renown: 230, trophies: 16 }),
    ]);
  });
});

describe('buying ranks', () => {
  it('buys one rank at a time up to max, paying each rank price', () => {
    let p = rich(2000);
    const states: [number, string, number][] = [];
    for (let i = 0; i < 5; i++) {
      p = purchase(p, 'upgrade.rk_rooms');
      states.push([rankOf(p, 'upgrade.rk_rooms'), nodeStatus(p, 'upgrade.rk_rooms'), 2000 - p.currencies.renown]);
    }
    expect(states).toEqual([
      [1, 'available', 100],
      [2, 'available', 250],
      [3, 'available', 480],
      [4, 'available', 820],
      [5, 'owned', 1330],
    ]);
    expect(() => purchase(p, 'upgrade.rk_rooms')).toThrow(/Fully ranked/);
    expect(canPurchase(p, 'upgrade.rk_rooms')).toMatchObject({ ok: false, status: 'owned' });
  });

  it('lists the node once in owned and stores only ranks past 1, sparsely', () => {
    let p = buy(rich(), 'rk_rooms');
    expect(p.upgrades).toEqual({ owned: ['upgrade.rk_rooms'], ranks: {} });
    p = buy(p, 'rk_hp', 'rk_rooms', 'rk_rooms');
    expect(p.upgrades).toEqual({ owned: ['upgrade.rk_rooms', 'upgrade.rk_hp'], ranks: { 'upgrade.rk_rooms': 3 } });
    expect(checkProfile(p)).toEqual([]);
  });

  it('reports a partly bought node as available or expensive for its next rank', () => {
    const p = buy(rich(105), 'rk_rooms');
    expect(rankOf(p, 'upgrade.rk_rooms')).toBe(1);
    expect(nextRankCost(p, 'upgrade.rk_rooms')?.renown).toBe(150);
    const check = canPurchase(p, 'upgrade.rk_rooms');
    expect(check).toMatchObject({ ok: false, status: 'expensive', reason: 'Needs 145 Renown more.' });
    expect(nodeStatus(p, 'upgrade.rk_rooms')).toBe('expensive');
    expect(nextRankCost(buy(rich(), 'rk_hp', 'rk_hp', 'rk_hp'), 'upgrade.rk_hp')).toBeNull();
    expect(nextRankCost(rich(), 'upgrade.rk_hp')?.renown).toBe(10);
  });

  it('counts a node as owned for prerequisites from rank 1, and keeps a partly bought pick-one node buyable', () => {
    let p = rich();
    expect(canPurchase(p, 'upgrade.rk_left')).toMatchObject({ status: 'locked', missing: ['upgrade.rk_rooms'] });
    p = buy(p, 'rk_rooms', 'rk_left');
    expect(canPurchase(buy(rich(), 'rk_rooms'), 'upgrade.rk_left')).toEqual({ ok: true });
    expect(nodeStatus(p, 'upgrade.rk_left')).toBe('available');
    expect(nodeStatus(p, 'upgrade.rk_right')).toBe('excluded');
    expect(rankOf(buy(p, 'rk_left'), 'upgrade.rk_left')).toBe(2);
  });
});

describe('grants per rank', () => {
  it('stacks capacity grants', () => {
    expect(capacity(buy(rich(), 'rk_rooms', 'rk_rooms', 'rk_rooms'), 'partySize', 1)).toBe(4);
    expect(capacity(rich(), 'partySize', 1)).toBe(1);
  });

  it('repeats a node bundle once per rank in party bundles, run modifiers and grants', () => {
    const p = buy(rich(), 'rk_hp', 'rk_hp', 'rk_run', 'rk_run', 'rk_hp');
    expect(upgradePartyBundles(p)).toEqual(['upgrade.rk_hp', 'upgrade.rk_hp', 'upgrade.rk_hp']);
    const mods = upgradeRunModifiers(p);
    expect(mods.map((m) => m.key)).toEqual(['upgrade.rk_run', 'upgrade.rk_run#2']);
    expect(runModifierListProblems(mods)).toEqual([]);
    expect(profileGrants(p).filter((g) => g.source === 'upgrade.rk_hp')).toHaveLength(3);
  });

  it('words stacked effects', () => {
    const [capacityGrant] = node_('rk_rooms').grants;
    const [bundleGrant] = node_('rk_hp').grants;
    expect(describeGrant(capacityGrant as never, 3)).toBe('Party size +3');
    expect(describeGrant(bundleGrant as never, 3)).toBe('+6 max HP for each adventurer');
    expect(describeGrant(bundleGrant as never)).toBe('+2 max HP for each adventurer');
  });
});

describe('validation', () => {
  function withDefs<T extends Def>(kind: ContentKind<T>, defs: unknown[]): ContentKind<T> {
    const registry = new Registry<T>(kind.registry.kind);
    for (const def of defs) registry.register(def as T);
    return { ...kind, registry };
  }
  const hall = { id: 'building.hall', name: 'Hall', description: 'A hall.', tags: [], kind: 'foundations' };
  const base = {
    id: 'upgrade.x',
    name: 'x',
    description: 'x',
    tags: [],
    building: hall.id,
    tier: 1,
    column: 0,
    cost: { renown: 10 },
    requires: [],
    grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
  };
  const stats = { kind: 'stat', has: () => true };
  const problems = (nodes: unknown[], buildings: unknown[] = [hall]) =>
    checkKinds([withDefs(BUILDING_KIND, buildings), withDefs(UPGRADE_KIND, nodes)], [stats]);

  it('accepts a ranked capacity or bundle node', () => {
    expect(problems([{ ...base, ranks: { max: 5, costGrowth: 1.5 } }])).toEqual([]);
  });

  it('rejects an unlock grant on a ranked node, since it cannot stack', () => {
    const unlock = { kind: 'unlock', id: 'class.vanguard' };
    expect(problems([{ ...base, ranks: { max: 2, costGrowth: 1 }, grants: [unlock] }])).toContainEqual(
      expect.stringContaining('a ranked node may only have capacity and bundle grants'),
    );
    expect(problems([{ ...base, grants: [unlock] }]).filter((p) => p.includes('ranked'))).toEqual([]);
  });

  it('bounds max to 2..10 and costGrowth to 1 or more', () => {
    for (const ranks of [{ max: 1, costGrowth: 1 }, { max: 11, costGrowth: 1 }, { max: 3, costGrowth: 0.9 }, { max: 2.5, costGrowth: 1 }]) {
      expect(problems([{ ...base, ranks }]).length).toBeGreaterThan(0);
    }
    expect(problems([{ ...base, ranks: { max: 10, costGrowth: 1 } }])).toEqual([]);
  });

  it('checks tier gates: fromTier 2 or more and strictly increasing, milestones valid', () => {
    const gates = (list: { fromTier: number; unlock: Milestone }[]) => problems([base], [{ ...hall, tierGates: list }]);
    const open = { kind: 'reachDepth', depth: 3 } as const;
    expect(gates([{ fromTier: 2, unlock: open }, { fromTier: 4, unlock: open }])).toEqual([]);
    expect(gates([{ fromTier: 1, unlock: open }])).not.toEqual([]);
    expect(gates([{ fromTier: 3, unlock: open }, { fromTier: 3, unlock: open }])).not.toEqual([]);
    expect(gates([{ fromTier: 4, unlock: open }, { fromTier: 3, unlock: open }])).not.toEqual([]);
    expect(gates([{ fromTier: 2, unlock: { kind: 'reachDepth', depth: 0 } }])).not.toEqual([]);
  });
});

describe('respec and reset refund every rank', () => {
  const FEE = { foundationsFeeRate: 0.5 };

  it('resets a tree, paying back all ranks, free by default', () => {
    const start = rich(5000);
    const p = buy(start, 'rk_rooms', 'rk_rooms', 'rk_rooms', 'rk_hp', 'rk_hp');
    expect(p.currencies.renown).toBe(5000 - (100 + 150 + 230) - (10 + 20));
    const plan = resetPlan(p, B);
    expect(plan?.refund.renown).toBe(100 + 150 + 230 + 10 + 20);
    const after = resetTree(p, B);
    expect(after.upgrades).toEqual({ owned: [], ranks: {} });
    expect(after.currencies).toEqual(start.currencies);
  });

  it('charges the Foundations fee on the whole refund when the constant is nonzero', () => {
    const p = buy(rich(5000), 'rk_rooms', 'rk_rooms', 'rk_rooms');
    const plan = resetPlan(p, B, FEE);
    expect(plan?.refund.renown).toBe(480);
    expect(plan?.fee.renown).toBe(240);
    expect(resetTree(p, B, FEE).currencies.renown).toBe(5000 - 240);
  });

  it('group respec refunds every rank of the chosen node and its dependents, and charges the fee on all the chosen ranks', () => {
    const p = buy(rich(5000), 'rk_rooms', 'rk_left', 'rk_left', 'rk_left', 'rk_after');
    const plan = respecPlan(p, 'test_ranks.t2', FEE);
    expect(plan?.removed).toEqual(['upgrade.rk_left', 'upgrade.rk_after']);
    expect(plan?.refund.renown).toBe(20 + 40 + 80 + 40);
    expect(plan?.fee.renown).toBe(70); // half of 20 + 40 + 80, rounded up
    const after = respec(p, 'test_ranks.t2', FEE);
    expect(after.upgrades).toEqual({ owned: ['upgrade.rk_rooms'], ranks: {} });
    expect(after.currencies.renown).toBe(p.currencies.renown + 180 - 70);
  });

  it('never charges Tactics, and only touches the named building', () => {
    const p = buy(rich(5000), 'tr_a', 'rk_hp', 'rk_hp');
    expect(resetPlan(p, GATED, FEE)?.fee.renown).toBe(0);
    expect(resetTree(p, B).upgrades).toEqual({ owned: ['upgrade.tr_a'], ranks: {} });
  });
});

describe('tier gates', () => {
  it('lists each gate as a milestone target with the id <building>_t<fromTier>', () => {
    const targets = milestoneTargets().filter((t) => t.id.startsWith(GATED));
    expect(targets).toEqual([
      { id: 'building.test_tiers_t3', name: 'Test Tiers, tier 2', unlock: { kind: 'reachDepth', depth: 4 } },
      { id: 'building.test_tiers_t5', name: 'The deep vault', unlock: { kind: 'reachDepth', depth: 6 } },
    ]);
  });

  it('refuses a node behind a closed gate with the milestone reason, even when affordable and unblocked', () => {
    const p = buy(rich(), 'tr_a', 'tr_b');
    expect(tierGate(p, GATED, 2)).toBeNull();
    expect(tierGate(p, GATED, 3)?.id).toBe('building.test_tiers_t3');
    expect(tierGate(p, GATED, 5)?.id).toBe('building.test_tiers_t3');
    expect(canPurchase(p, 'upgrade.tr_c')).toEqual({
      ok: false,
      status: 'locked',
      missing: [],
      reason: 'Tier 3 and up open when you reach floor 4.',
    });
    expect(() => purchase(p, 'upgrade.tr_c')).toThrow(/Tier 3 and up open/);
    expect(closedGates(p, GATED).map((g) => g.fromTier)).toEqual([3, 5]);
  });

  it('opens when its milestone is met in applyRunResult, and stays open', () => {
    let p = buy(rich(), 'tr_a', 'tr_b');
    p = asDepth(p, 4);
    expect(latestUnlocks(p).filter((u) => u.id.startsWith(GATED))).toEqual([{ id: 'building.test_tiers_t3', run: 1 }]);
    expect(canPurchase(p, 'upgrade.tr_c')).toEqual({ ok: true });
    expect(tierGate(p, GATED, 4)).toBeNull();
    expect(tierGate(p, GATED, 5)?.id).toBe('building.test_tiers_t5');
    p = buy(p, 'tr_c', 'tr_d');
    expect(canPurchase(p, 'upgrade.tr_e')).toMatchObject({ status: 'locked', reason: 'Tier 5 and up open when you reach floor 6.' });
    p = asDepth(p, 6);
    expect(latestUnlocks(p).filter((u) => u.id.startsWith(GATED)).map((u) => u.id)).toEqual(['building.test_tiers_t5']);
    expect(canPurchase(p, 'upgrade.tr_e')).toEqual({ ok: true });
    // A shallower run later does not close it again.
    expect(tierGate(asDepth(p, 1), GATED, 5)).toBeNull();
    expect(checkProfile(p)).toEqual([]);
  });

  it('records two gates met by one run', () => {
    const after = asDepth(newProfile(), 7);
    expect(after.milestones.unlocked.map((u) => u.id)).toEqual(expect.arrayContaining(['building.test_tiers_t3', 'building.test_tiers_t5']));
  });
});

describe('the upgrades slice, version 2', () => {
  it('round-trips ranks through a save', () => {
    const p = buy(rich(), 'rk_rooms', 'rk_rooms', 'rk_hp', 'rk_hp', 'rk_hp');
    const decoded = decodeSave(encodeSave(p, 1));
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.upgrades).toEqual({
      owned: ['upgrade.rk_rooms', 'upgrade.rk_hp'],
      ranks: { 'upgrade.rk_rooms': 2, 'upgrade.rk_hp': 3 },
    });
  });

  it('migrates a version 1 save: everything owned is at rank 1', () => {
    const save = JSON.parse(encodeSave(buy(rich(), 'rk_rooms'), 1)) as { slices: { upgrades: unknown } };
    save.slices.upgrades = { version: 1, data: { owned: ['upgrade.rk_rooms', 'upgrade.rk_hp'] } };
    const decoded = decodeSave(JSON.stringify(save));
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.upgrades).toEqual({ owned: ['upgrade.rk_rooms', 'upgrade.rk_hp'], ranks: {} });
    expect(rankOf(decoded.profile, 'upgrade.rk_rooms')).toBe(1);
  });

  it('enforces its invariants: ranks only for owned nodes, whole numbers from 2', () => {
    const p = buy(rich(), 'rk_rooms');
    const bad = (ranks: Record<string, number>): Profile => ({ ...p, upgrades: { ...p.upgrades, ranks } });
    expect(checkProfile(bad({ 'upgrade.rk_rooms': 2 }))).toEqual([]);
    expect(checkProfile(bad({ 'upgrade.rk_hp': 2 }))).toEqual(['upgrades.ranks: must only list owned nodes']);
    expect(checkProfile(bad({ 'upgrade.rk_rooms': 1 }))).toHaveLength(1);
    expect(checkProfile(bad({ 'upgrade.rk_rooms': 2.5 }))).toHaveLength(1);
  });

  it('holds a node at its new top rank when content shrinks its ranks', () => {
    const p = { ...buy(rich(), 'rk_rooms'), upgrades: { owned: ['upgrade.rk_rooms'], ranks: { 'upgrade.rk_rooms': 9 } } };
    expect(rankOf(p, 'upgrade.rk_rooms')).toBe(5);
  });
});
