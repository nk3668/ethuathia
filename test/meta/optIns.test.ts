/**
 * Opt-in upgrade nodes (ETH-187): owned but off by default, switched on per run on the Prepare
 * screen, and filtered out of the run config unless on. Fixture nodes stand in for the real ones.
 */
import { describe, expect, it } from 'vitest';
import { checkUpgradeTrees, defineUpgrade, ITEM_MENDING_DRAUGHT } from '../../src/content';
import type { UpgradeNodeDef } from '../../src/content';
import {
  buildRunConfig,
  completeRunChoices,
  decodeSave,
  defaultRunChoices,
  encodeSave,
  enabledOptIns,
  newProfile,
  optInNodes,
  withOptIns,
} from '../../src/meta';
import type { Profile } from '../../src/meta';

const base = { tags: [], building: 'building.guild_hall', column: 0, cost: { renown: 1 }, requires: [] } as const;
const STOCK = defineUpgrade({
  ...base,
  id: 'upgrade.test_optin_stock',
  name: 'Test Opt-in Stock',
  description: 'An opt-in node with a start perk.',
  tier: 20,
  optIn: true,
  grants: [{ kind: 'start', start: { perk: 'stock', item: ITEM_MENDING_DRAUGHT.id, qty: 2 } }],
});
const BUNDLE = defineUpgrade({
  ...base,
  id: 'upgrade.test_optin_bundle',
  name: 'Test Opt-in Bundle',
  description: 'An opt-in node with a party bundle.',
  tier: 21,
  optIn: true,
  grants: [{ kind: 'bundle', scope: 'party', bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 5 }] } }],
});

const own = (profile: Profile, ...ids: string[]): Profile => ({ ...profile, upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, ...ids] } });
const owner = (): Profile => own(newProfile(), STOCK.id, BUNDLE.id);

describe('the optIns choice', () => {
  it('starts with nothing switched on, and old choices that lack it fill in the default', () => {
    expect(defaultRunChoices().optIns).toEqual({ enabled: [] });
    expect(completeRunChoices({}).optIns).toEqual({ enabled: [] });
  });

  it('is remembered in a save and falls back to the default when it is damaged', () => {
    const profile: Profile = {
      ...owner(),
      prepare: { choices: { ...defaultRunChoices(), optIns: { enabled: [STOCK.id] } } },
    };
    expect(decodeSave(encodeSave(profile, 1))).toMatchObject({ ok: true, profile: { prepare: { choices: { optIns: { enabled: [STOCK.id] } } } } });
    const damaged = JSON.parse(encodeSave(profile, 1)) as { slices: { prepare: { data: { choices: { optIns: unknown } } } } };
    damaged.slices.prepare.data.choices.optIns = 'nope';
    expect(decodeSave(JSON.stringify(damaged))).toMatchObject({ ok: true, profile: { prepare: { choices: { optIns: { enabled: [] } } } } });
  });
});

describe('withOptIns', () => {
  it('lists the owned opt-in nodes and the ones switched on', () => {
    expect(optInNodes(newProfile())).toEqual([]);
    expect(optInNodes(owner()).map((n) => n.id)).toEqual([STOCK.id, BUNDLE.id]);
    expect(enabledOptIns(owner(), { enabled: [BUNDLE.id, 'upgrade.not_owned'] }).map((n) => n.id)).toEqual([BUNDLE.id]);
  });

  it('drops owned opt-in nodes that are off, with their ranks, and keeps everything else', () => {
    const profile = own({ ...owner(), upgrades: { owned: [...owner().upgrades.owned], ranks: { [STOCK.id]: 2 } } }, 'upgrade.second_berth');
    const off = withOptIns(profile, { enabled: [] });
    expect(off.upgrades.owned).toEqual(['upgrade.second_berth']);
    expect(off.upgrades.ranks).toEqual({});
    expect(withOptIns(profile, { enabled: [STOCK.id] }).upgrades.owned).toEqual([STOCK.id, 'upgrade.second_berth']);
    expect(withOptIns(profile, { enabled: [STOCK.id, BUNDLE.id] })).toBe(profile);
  });
});

describe('buildRunConfig with opt-ins', () => {
  it('adds nothing for an owned opt-in node that is off', () => {
    const config = buildRunConfig(owner(), defaultRunChoices(), 3);
    expect(config.startStock).toBeUndefined();
    expect(config.partyBundles).toBeUndefined();
    expect(config).toEqual(buildRunConfig(newProfile(), defaultRunChoices(), 3));
  });

  it('adds a start perk and a party bundle once switched on', () => {
    const choices = { ...defaultRunChoices(), optIns: { enabled: [STOCK.id, BUNDLE.id] } };
    const config = buildRunConfig(owner(), choices, 3);
    expect(config.startStock).toEqual([{ item: ITEM_MENDING_DRAUGHT.id, qty: 2 }]);
    expect(config.partyBundles).toEqual([BUNDLE.id]);
    expect(buildRunConfig(owner(), { ...defaultRunChoices(), optIns: { enabled: [BUNDLE.id] } }, 3).startStock).toBeUndefined();
  });

  it('ignores an id the profile does not own', () => {
    const config = buildRunConfig(newProfile(), { ...defaultRunChoices(), optIns: { enabled: [STOCK.id] } }, 3);
    expect(config.startStock).toBeUndefined();
  });
});

describe('the content rule', () => {
  it('refuses an opt-in node with a capacity or unlock grant', () => {
    const bad = (grants: UpgradeNodeDef['grants']): UpgradeNodeDef => ({ ...STOCK, id: 'upgrade.test_bad_optin', column: 3, tier: 22, grants });
    expect(checkUpgradeTrees([bad([{ kind: 'capacity', key: 'partySize', amount: 1 }])]).join()).toContain('opt-in node may only have bundle and start grants');
    expect(checkUpgradeTrees([bad([{ kind: 'unlock', id: 'class.outrider' }])]).join()).toContain('opt-in node');
    expect(checkUpgradeTrees([bad(STOCK.grants)])).toEqual([]);
  });
});
