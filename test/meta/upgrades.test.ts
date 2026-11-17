import { describe, expect, it } from 'vitest';
import { defineBuilding, defineUpgrade } from '../../src/content';
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
  respec,
  respecPlan,
} from '../../src/meta';
import type { Profile } from '../../src/meta';

// The shipped Guild Hall: second_berth (T1) → roster_ledger, and the pick-one pair
// hardy_recruits / contract_board (T2); third_berth (T3) needs roster_ledger.

// A test-only building with a Favor cost and an unlock grant.
defineBuilding({ id: 'building.test_shrine', name: 'Test Shrine', description: 'A test shrine.', tags: [] });
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
    grants: [{ kind: 'capacity', key: 'ruleSlots', amount: 1 }],
    ...fields,
  });
testNode('left', 1, 1, 7, { exclusiveGroup: 'test_shrine.t1' });
testNode('right', 1, 2, 7, { exclusiveGroup: 'test_shrine.t1' });
testNode('after', 2, 1, 20, { requires: ['upgrade.test_left'] });
testNode('last', 3, 1, 30, { requires: ['upgrade.test_after'] });

function rich(renown = 10_000): Profile {
  const p = newProfile();
  return { ...p, currencies: { ...p.currencies, renown } };
}

function buy(profile: Profile, ...ids: string[]): Profile {
  return ids.reduce((p, id) => purchase(p, id), profile);
}

describe('purchase', () => {
  it('pays the cost, records the node and leaves the input untouched', () => {
    const before = rich(100);
    const after = purchase(before, 'upgrade.second_berth');
    expect(after.currencies.renown).toBe(50);
    expect(after.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(before.upgrades.owned).toEqual([]);
    expect(before.currencies.renown).toBe(100);
    expect(checkProfile(after)).toEqual([]);
  });

  it('explains why a node cannot be bought', () => {
    const poor = rich(10);
    expect(canPurchase(poor, 'upgrade.nope')).toMatchObject({ ok: false, status: 'unknown' });
    expect(canPurchase(poor, 'upgrade.second_berth')).toMatchObject({
      ok: false,
      status: 'expensive',
      reason: 'Needs 40 Renown more.',
      short: { renown: 40, trophies: 0, favor: {} },
    });
    expect(canPurchase(poor, 'upgrade.third_berth')).toMatchObject({
      ok: false,
      status: 'locked',
      missing: ['upgrade.roster_ledger'],
      reason: 'Needs Roster Ledger first.',
    });
    const owned = buy(rich(), 'upgrade.second_berth');
    expect(canPurchase(owned, 'upgrade.second_berth')).toMatchObject({ ok: false, status: 'owned' });
    expect(canPurchase(owned, 'upgrade.roster_ledger')).toEqual({ ok: true });
    expect(() => purchase(poor, 'upgrade.second_berth')).toThrow(/Cannot buy Second Berth: Needs 40 Renown more/);
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
    const p = buy(rich(), 'upgrade.second_berth', 'upgrade.hardy_recruits');
    expect(nodeStatus(p, 'upgrade.hardy_recruits')).toBe('owned');
    expect(nodeStatus(p, 'upgrade.contract_board')).toBe('excluded');
    expect(canPurchase(p, 'upgrade.contract_board')).toMatchObject({
      status: 'excluded',
      chosen: 'upgrade.hardy_recruits',
      reason: 'You chose Hardy Recruits in this pick-one tier. Respec to choose again.',
    });
    expect(() => purchase(p, 'upgrade.contract_board')).toThrow(RangeError);
  });

  it('reports excluded before locked', () => {
    const p = { ...rich(), upgrades: { owned: ['upgrade.contract_board'] } };
    expect(nodeStatus(p, 'upgrade.hardy_recruits')).toBe('excluded');
  });
});

describe('respec', () => {
  it('gives up the chosen node, refunds it less a fee of half its cost, and frees the group', () => {
    const p = buy(rich(1000), 'upgrade.second_berth', 'upgrade.contract_board');
    expect(p.currencies.renown).toBe(830);
    const plan = respecPlan(p, 'guild_hall.tier2');
    expect(plan).toMatchObject({ chosen: 'upgrade.contract_board', removed: ['upgrade.contract_board'] });
    expect(plan?.refund.renown).toBe(120);
    expect(plan?.fee.renown).toBe(60);

    const after = respec(p, 'guild_hall.tier2');
    expect(after.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(after.currencies.renown).toBe(890);
    expect(nodeStatus(after, 'upgrade.hardy_recruits')).toBe('available');
    expect(purchase(after, 'upgrade.hardy_recruits').upgrades.owned).toContain('upgrade.hardy_recruits');
  });

  it('also gives up owned nodes that need the chosen one, directly or not, refunding them in full', () => {
    const p = buy(rich(1000), 'upgrade.test_left', 'upgrade.test_after', 'upgrade.test_last');
    expect(p.currencies.renown).toBe(1000 - 7 - 20 - 30);
    const plan = respecPlan(p, 'test_shrine.t1');
    expect(plan?.removed).toEqual(['upgrade.test_left', 'upgrade.test_after', 'upgrade.test_last']);
    const after = respec(p, 'test_shrine.t1');
    expect(after.upgrades.owned).toEqual([]);
    expect(after.currencies.renown).toBe(1000 - 4); // the fee: half of 7, rounded up
  });

  it('leaves owned nodes in other branches alone', () => {
    const p = buy(rich(), 'upgrade.second_berth', 'upgrade.roster_ledger', 'upgrade.third_berth', 'upgrade.drill_yard', 'upgrade.fourth_berth');
    expect(respecPlan(p, 'guild_hall.tier4')?.removed).toEqual(['upgrade.drill_yard']);
    expect(respec(p, 'guild_hall.tier4').upgrades.owned).toEqual([
      'upgrade.second_berth',
      'upgrade.roster_ledger',
      'upgrade.third_berth',
      'upgrade.fourth_berth',
    ]);
  });

  it('refuses when nothing in the group is owned', () => {
    expect(respecPlan(rich(), 'guild_hall.tier2')).toBeNull();
    expect(() => respec(rich(), 'guild_hall.tier2')).toThrow(/Nothing to respec/);
  });
});

describe('grants', () => {
  it('collects grants from owned nodes with their source, in purchase order', () => {
    const p = buy(rich(), 'upgrade.second_berth', 'upgrade.hardy_recruits');
    expect(profileGrants(p)).toEqual([
      { source: 'upgrade.second_berth', grant: { kind: 'capacity', key: 'partySize', amount: 1 } },
      {
        source: 'upgrade.hardy_recruits',
        grant: { kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 2 }] } },
      },
    ]);
  });

  it('adds capacity grants to a base', () => {
    let p = rich();
    expect(capacity(p, 'partySize', 1)).toBe(1);
    p = buy(p, 'upgrade.second_berth', 'upgrade.roster_ledger', 'upgrade.third_berth', 'upgrade.fourth_berth');
    expect(capacity(p, 'partySize', 1)).toBe(4);
    expect(capacity(p, 'rosterSize', 6)).toBe(8);
    expect(capacity(p, 'contractSlots', 1)).toBe(1);
  });

  it('derives unlocks from owned nodes and ignores ids no longer in content', () => {
    const p = { ...newProfile(), upgrades: { owned: ['upgrade.test_vow', 'upgrade.removed_long_ago'] } };
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
    expect(newProfile().upgrades).toEqual({ owned: [] });
    const p = buy(rich(), 'upgrade.second_berth');
    const decoded = decodeSave(encodeSave(p, 1));
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.upgrades).toEqual({ owned: ['upgrade.second_berth'] });
  });

  it('rejects a node listed twice', () => {
    const p = { ...newProfile(), upgrades: { owned: ['upgrade.second_berth', 'upgrade.second_berth'] } };
    expect(checkProfile(p)).toEqual(['upgrades.owned: must not list a node twice']);
  });
});
