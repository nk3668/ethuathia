import { describe, expect, it } from 'vitest';
import { defineBuilding, defineUpgrade, UPGRADES } from '../../src/content';
import {
  canPurchase,
  capacity,
  checkProfile,
  decodeSave,
  describeGrant,
  encodeSave,
  isUnlocked,
  newProfile,
  nodeStatus,
  profileGrants,
  purchase,
  FOUNDATIONS_RESPEC_FEE_RATE,
  respec,
  respecBlock,
  respecFee,
  resetPlan,
  resetTree,
  RUN_ACTIVE_REASON,
  treeKind,
  respecPlan,
} from '../../src/meta';
import type { Profile } from '../../src/meta';

// The shipped Guild Hall (ETH-132): second_berth (T1, 1200 Renown) then contract_board (row 3, needs it);
// its only pick-one pair (row 6) is behind the Long Muster gate, so pick-one tests use fixtures.

// A test-only building with a Favor cost and an unlock grant.
defineBuilding({ id: 'building.test_shrine', name: 'Test Shrine', description: 'A test shrine.', tags: [], kind: 'tactics' });
defineUpgrade({
  id: 'upgrade.test_vow',
  name: 'Test Vow',
  description: 'A test node.',
  tags: [],
  building: 'building.test_shrine',
  tier: 1,
  column: 0,
  cost: { renown: 3, 'favor:deity.dawn': 5 },
  requires: [],
  grants: [{ kind: 'unlock', id: 'class.vanguard' }],
});

// A Foundations building with a two-currency node, for fee rounding.
defineBuilding({ id: 'building.test_forge', name: 'Test Forge', description: 'A test forge.', tags: [], kind: 'foundations' });
defineUpgrade({
  id: 'upgrade.test_forge_a',
  name: 'Test Forge A',
  description: 'A test node.',
  tags: [],
  building: 'building.test_forge',
  tier: 1,
  column: 0,
  cost: { renown: 7, trophies: 3 },
  requires: [],
  grants: [{ kind: 'capacity', key: 'habitSlots', amount: 1 }],
});

// A pick-one pair whose left node has a chain of dependents, for the respec cascade.
const testNode = (id: string, tier: number, column: number, renown: number, fields: object = {}) =>
  defineUpgrade({
    id: `upgrade.test_${id}`,
    name: `Test ${id}`,
    description: 'A test node.',
    tags: [],
    building: 'building.test_shrine',
    tier,
    column,
    cost: { renown },
    requires: [],
    grants: [{ kind: 'capacity', key: 'habitSlots', amount: 1 }],
    ...fields,
  });
testNode('left', 1, 1, 7, { exclusiveGroup: 'test_shrine.t1' });
testNode('right', 1, 2, 7, { exclusiveGroup: 'test_shrine.t1' });
testNode('after', 2, 1, 20, { requires: ['upgrade.test_left'] });
testNode('last', 3, 1, 30, { requires: ['upgrade.test_after'] });

// A Foundations pick-one pair at 120 Renown each, for the respec fee.
for (const [id, column] of [['pick_a', 1], ['pick_b', 2]] as const) {
  defineUpgrade({
    id: `upgrade.test_forge_${id}`,
    name: `Test Forge ${id}`,
    description: 'A test node.',
    tags: [],
    building: 'building.test_forge',
    tier: 1,
    column,
    cost: { renown: 120 },
    requires: [],
    exclusiveGroup: 'test_forge.t1',
    grants: [{ kind: 'capacity', key: 'habitSlots', amount: 1 }],
  });
}

function rich(renown = 10_000): Profile {
  const p = newProfile();
  return { ...p, currencies: { ...p.currencies, renown } };
}

function buy(profile: Profile, ...ids: string[]): Profile {
  return ids.reduce((p, id) => purchase(p, id), profile);
}

describe('purchase', () => {
  it('pays the cost, records the node and leaves the input untouched', () => {
    const before = rich(1500);
    const after = purchase(before, 'upgrade.second_berth');
    expect(after.currencies.renown).toBe(300);
    expect(after.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(before.upgrades.owned).toEqual([]);
    expect(before.currencies.renown).toBe(1500);
    expect(checkProfile(after)).toEqual([]);
  });

  it('explains why a node cannot be bought', () => {
    const poor = rich(1000);
    expect(canPurchase(poor, 'upgrade.nope')).toMatchObject({ ok: false, status: 'unknown' });
    expect(canPurchase(poor, 'upgrade.second_berth')).toMatchObject({
      ok: false,
      status: 'expensive',
      reason: 'Needs 200 Renown more.',
      short: { renown: 200, trophies: 0, favor: {} },
    });
    expect(canPurchase(poor, 'upgrade.contract_board')).toMatchObject({
      ok: false,
      status: 'locked',
      missing: ['upgrade.second_berth'],
      reason: 'Needs Second Berth first.',
    });
    const owned = buy(rich(), 'upgrade.second_berth');
    expect(canPurchase(owned, 'upgrade.second_berth')).toMatchObject({ ok: false, status: 'owned' });
    expect(canPurchase(owned, 'upgrade.contract_board')).toEqual({ ok: true });
    expect(() => purchase(poor, 'upgrade.second_berth')).toThrow(/Cannot buy Second Berth: Needs 200 Renown more/);
  });

  it('checks Favor per deity', () => {
    const p = newProfile();
    const short = { ...p, currencies: { renown: 3, trophies: 0, favor: { 'deity.dawn': 4, 'deity.tide': 9 } } };
    expect(canPurchase(short, 'upgrade.test_vow')).toMatchObject({ status: 'expensive', reason: 'Needs 1 Favor of deity.dawn more.' });
    const enough = { ...p, currencies: { renown: 3, trophies: 0, favor: { 'deity.dawn': 5 } } };
    expect(purchase(enough, 'upgrade.test_vow').currencies).toEqual({ renown: 0, trophies: 0, favor: {} });
  });
});

describe('pick-one groups', () => {
  it('excludes the other nodes of the group once one is owned', () => {
    const p = buy(rich(), 'upgrade.test_left');
    expect(nodeStatus(p, 'upgrade.test_left')).toBe('owned');
    expect(nodeStatus(p, 'upgrade.test_right')).toBe('excluded');
    expect(canPurchase(p, 'upgrade.test_right')).toMatchObject({
      status: 'excluded',
      chosen: 'upgrade.test_left',
      reason: 'You chose Test left in this pick-one tier. Respec to choose again.',
    });
    expect(() => purchase(p, 'upgrade.test_right')).toThrow(RangeError);
  });

  it('reports excluded before locked', () => {
    const p = { ...rich(), upgrades: { owned: ['upgrade.test_left'], ranks: {} } };
    expect(nodeStatus(p, 'upgrade.test_right')).toBe('excluded');
  });
});

// The Guild Hall is a Foundations tree, the Test Shrine a Tactics tree (ETH-086).
const FEE_HALF = { foundationsFeeRate: 0.5 };

describe('tree kinds', () => {
  it('sets the Foundations fee constant to 0', () => {
    expect(FOUNDATIONS_RESPEC_FEE_RATE).toBe(0);
  });

  it('reads a node\'s tree kind from its building', () => {
    expect(treeKind(UPGRADES.get('upgrade.second_berth'))).toBe('foundations');
    expect(treeKind(UPGRADES.get('upgrade.test_left'))).toBe('tactics');
  });
});

describe('respec', () => {
  it('is free by default: refunds the chosen node in full and frees the group (Foundations)', () => {
    const p = buy(rich(1000), 'upgrade.test_forge_pick_a');
    expect(p.currencies.renown).toBe(880);
    const plan = respecPlan(p, 'test_forge.t1');
    expect(plan).toMatchObject({ chosen: 'upgrade.test_forge_pick_a', removed: ['upgrade.test_forge_pick_a'] });
    expect(plan?.refund.renown).toBe(120);
    expect(plan?.fee.renown).toBe(0);

    const after = respec(p, 'test_forge.t1');
    expect(after.upgrades.owned).toEqual([]);
    expect(after.currencies.renown).toBe(1000);
    expect(nodeStatus(after, 'upgrade.test_forge_pick_b')).toBe('available');
    expect(purchase(after, 'upgrade.test_forge_pick_b').upgrades.owned).toContain('upgrade.test_forge_pick_b');
  });

  it('is free for Tactics too', () => {
    const p = buy(rich(1000), 'upgrade.test_left');
    expect(respec(p, 'test_shrine.t1').currencies.renown).toBe(1000);
  });

  it('charges a Foundations fee of the constant\'s share of the chosen node when it is nonzero', () => {
    const p = buy(rich(1000), 'upgrade.test_forge_pick_a');
    const plan = respecPlan(p, 'test_forge.t1', FEE_HALF);
    expect(plan?.refund.renown).toBe(120);
    expect(plan?.fee.renown).toBe(60);
    expect(respec(p, 'test_forge.t1', FEE_HALF).currencies.renown).toBe(940);
    expect(respecFee(UPGRADES.get('upgrade.test_forge_pick_a'), FEE_HALF).renown).toBe(60);
  });

  it('never charges Tactics, whatever the Foundations rate', () => {
    const p = buy(rich(1000), 'upgrade.test_left');
    expect(respecFee(UPGRADES.get('upgrade.test_left'), FEE_HALF).renown).toBe(0);
    expect(respecPlan(p, 'test_shrine.t1', FEE_HALF)?.fee.renown).toBe(0);
    expect(respec(p, 'test_shrine.t1', FEE_HALF).currencies.renown).toBe(1000);
  });

  it('rounds a Foundations fee up per currency and clamps the rate to 0..1', () => {
    expect(respecFee(UPGRADES.get('upgrade.test_forge_a'), { foundationsFeeRate: 0.5 })).toMatchObject({ renown: 4, trophies: 2 });
    expect(respecFee(UPGRADES.get('upgrade.test_forge_a'), { foundationsFeeRate: 3 })).toMatchObject({ renown: 7, trophies: 3 });
    expect(respecFee(UPGRADES.get('upgrade.test_forge_a'), { foundationsFeeRate: -1 })).toMatchObject({ renown: 0, trophies: 0 });
  });

  it('also gives up owned nodes that need the chosen one, directly or not, refunding them in full', () => {
    const p = buy(rich(1000), 'upgrade.test_left', 'upgrade.test_after', 'upgrade.test_last');
    expect(p.currencies.renown).toBe(1000 - 7 - 20 - 30);
    const plan = respecPlan(p, 'test_shrine.t1');
    expect(plan?.removed).toEqual(['upgrade.test_left', 'upgrade.test_after', 'upgrade.test_last']);
    const after = respec(p, 'test_shrine.t1');
    expect(after.upgrades.owned).toEqual([]);
    expect(after.currencies.renown).toBe(1000);
  });

  it('leaves owned nodes in other branches alone', () => {
    const p = buy(rich(), 'upgrade.second_berth', 'upgrade.contract_board', 'upgrade.test_forge_pick_b');
    expect(respecPlan(p, 'test_forge.t1')?.removed).toEqual(['upgrade.test_forge_pick_b']);
    expect(respec(p, 'test_forge.t1').upgrades.owned).toEqual(['upgrade.second_berth', 'upgrade.contract_board']);
  });

  it('refuses when nothing in the group is owned', () => {
    expect(respecPlan(rich(), 'test_forge.t1')).toBeNull();
    expect(() => respec(rich(), 'test_forge.t1')).toThrow(/Nothing to respec/);
  });

  it('is refused during a run, for both kinds, changing nothing', () => {
    const f = buy(rich(3000), 'upgrade.second_berth', 'upgrade.test_forge_pick_a');
    const t = buy(rich(1000), 'upgrade.test_left');
    expect(respecBlock({ runActive: true })).toBe(RUN_ACTIVE_REASON);
    expect(respecBlock({ runActive: false })).toBeNull();
    expect(respecBlock()).toBeNull();
    expect(() => respec(f, 'test_forge.t1', { runActive: true })).toThrow(RUN_ACTIVE_REASON);
    expect(() => respec(t, 'test_shrine.t1', { runActive: true })).toThrow(RUN_ACTIVE_REASON);
    expect(respec(f, 'test_forge.t1', { runActive: false }).upgrades.owned).toEqual(['upgrade.second_berth']);
  });
});

describe('resetTree', () => {
  const OWNED_HALL = ['upgrade.second_berth', 'upgrade.contract_board', 'upgrade.hardy_recruits'];

  it('gives up the whole tree and refunds everything, free by default', () => {
    const start = rich(3000);
    const p = buy(start, ...OWNED_HALL);
    expect(p.currencies.renown).toBeLessThan(3000);
    const plan = resetPlan(p, 'building.guild_hall');
    expect(plan?.removed).toEqual(OWNED_HALL);
    expect(plan?.fee.renown).toBe(0);
    const after = resetTree(p, 'building.guild_hall');
    expect(after.upgrades.owned).toEqual([]);
    expect(after.currencies).toEqual(start.currencies);
  });

  it('only touches the named building', () => {
    const p = buy(rich(3000), 'upgrade.second_berth', 'upgrade.test_left');
    const after = resetTree(p, 'building.test_shrine');
    expect(after.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(after.currencies.renown).toBe(3000 - 1200);
  });

  it('charges a Foundations fee on the whole refund when the constant is nonzero, never Tactics', () => {
    const p = buy(rich(3000), ...OWNED_HALL);
    const plan = resetPlan(p, 'building.guild_hall', FEE_HALF);
    expect(plan?.fee.renown).toBe(Math.ceil((plan?.refund.renown ?? 0) / 2));
    expect(resetTree(p, 'building.guild_hall', FEE_HALF).currencies.renown).toBe(3000 - (plan?.fee.renown ?? 0));
    const t = buy(rich(1000), 'upgrade.test_left', 'upgrade.test_after');
    expect(resetPlan(t, 'building.test_shrine', FEE_HALF)?.fee.renown).toBe(0);
    expect(resetTree(t, 'building.test_shrine', FEE_HALF).currencies.renown).toBe(1000);
  });

  it('refuses when nothing is owned, and during a run', () => {
    expect(resetPlan(rich(), 'building.guild_hall')).toBeNull();
    expect(() => resetTree(rich(), 'building.guild_hall')).toThrow(/Nothing to reset/);
    const p = buy(rich(), 'upgrade.second_berth');
    expect(() => resetTree(p, 'building.guild_hall', { runActive: true })).toThrow(RUN_ACTIVE_REASON);
  });
});

describe('saves from before tree kinds', () => {
  it('load unchanged: kinds live in content, so the owned list is unchanged, and v1 saves gain empty ranks', () => {
    const p = buy(rich(3000), 'upgrade.second_berth', 'upgrade.test_forge_pick_a');
    const old = JSON.parse(encodeSave(p, 1)) as { slices: { upgrades: { version: number; data: unknown } } };
    old.slices.upgrades = { version: 1, data: { owned: ['upgrade.second_berth', 'upgrade.test_forge_pick_a'] } };
    const decoded = decodeSave(JSON.stringify(old));
    expect(decoded.ok && decoded.profile.upgrades).toEqual({ owned: ['upgrade.second_berth', 'upgrade.test_forge_pick_a'], ranks: {} });
    if (decoded.ok) expect(respec(decoded.profile, 'test_forge.t1').upgrades.owned).toEqual(['upgrade.second_berth']);
  });
});

describe('grants', () => {
  it('collects grants from owned nodes with their source, in purchase order', () => {
    const p = buy(rich(), 'upgrade.second_berth', 'upgrade.hardy_recruits');
    expect(profileGrants(p)).toEqual([
      { source: 'upgrade.second_berth', grant: { kind: 'capacity', key: 'partySize', amount: 1 } },
      {
        source: 'upgrade.hardy_recruits',
        grant: { kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 3 }] } },
      },
    ]);
  });

  it('adds capacity grants to a base', () => {
    let p = rich();
    expect(capacity(p, 'partySize', 1)).toBe(1);
    p = buy(p, 'upgrade.second_berth', 'upgrade.contract_board');
    expect(capacity(p, 'partySize', 1)).toBe(2);
    expect(capacity(p, 'contractSlots', 1)).toBe(2);
    expect(capacity(p, 'habitSlots', 1)).toBe(1);
  });

  it('derives unlocks from owned nodes and ignores ids no longer in content', () => {
    const p = { ...newProfile(), upgrades: { owned: ['upgrade.test_vow', 'upgrade.removed_long_ago'], ranks: {} } };
    expect(isUnlocked(p, 'class.vanguard')).toBe(true);
    expect(isUnlocked(newProfile(), 'class.vanguard')).toBe(false);
    expect(profileGrants(p)).toHaveLength(1);
  });

  it('describes grants in words', () => {
    expect(describeGrant({ kind: 'capacity', key: 'partySize', amount: 1 })).toBe('Party size +1');
    expect(describeGrant({ kind: 'unlock', id: 'class.vanguard' })).toBe('Unlocks Vanguard');
    expect(describeGrant({ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 2 }] } })).toBe(
      '+2 max HP for each adventurer',
    );
  });
});

describe('the upgrades slice', () => {
  it('starts empty and survives a save round trip', () => {
    expect(newProfile().upgrades).toEqual({ owned: [], ranks: {} });
    const p = buy(rich(), 'upgrade.second_berth');
    const decoded = decodeSave(encodeSave(p, 1));
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.upgrades).toEqual({ owned: ['upgrade.second_berth'], ranks: {} });
  });

  it('rejects a node listed twice', () => {
    const p = { ...newProfile(), upgrades: { owned: ['upgrade.second_berth', 'upgrade.second_berth'], ranks: {} } };
    expect(checkProfile(p)).toEqual(['upgrades.owned: must not list a node twice']);
  });
});
