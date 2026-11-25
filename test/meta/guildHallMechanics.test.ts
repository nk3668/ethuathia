/**
 * The Guild Hall nodes that needed new mechanics (ETH-187): where they sit, the pick-one pairs
 * with older nodes (and a save that already owns the older one), what each grants, and how they
 * reach the run config. The in-run behavior is in `test/sim/{guildHallGates,fieldRations,mysteryCrate}`.
 */
import { describe, expect, it } from 'vitest';
import {
  buildingNodes,
  ITEM_FIELD_RATION,
  UPGRADE_CONTRACT_BOARD,
  UPGRADE_EXTRACTION_DRILLS,
  UPGRADE_FIELD_RATIONS,
  UPGRADE_GUILD_CHRONICLES,
  UPGRADE_MYSTERY_CRATE,
  UPGRADE_SECOND_CONTRACT_BOARD,
  UPGRADE_WAYMARK_LANTERNS,
  UPGRADES,
  tierGateId,
  issuedItemIds,
} from '../../src/content';
import {
  buildRunConfig,
  canPurchase,
  capacity,
  decodeSave,
  defaultRunChoices,
  describeGrant,
  encodeSave,
  newProfile,
  nodeStatus,
  purchase,
  upgradeRunModifiers,
} from '../../src/meta';
import type { Profile } from '../../src/meta';

const GATE = tierGateId('building.guild_hall', 4);
const rich = (): Profile => ({
  ...newProfile(),
  currencies: { renown: 1_000_000, trophies: 0, favor: {} },
  milestones: { unlocked: [{ id: GATE, run: 2 }] },
});
const own = (profile: Profile, ids: string[], ranks: Record<string, number> = {}): Profile => ({
  ...profile,
  upgrades: { owned: [...profile.upgrades.owned, ...ids], ranks: { ...profile.upgrades.ranks, ...ranks } },
});
const config = (p: Profile, enabled: string[] = []) => buildRunConfig(p, { ...defaultRunChoices(), optIns: { enabled } }, 3);

describe('layout', () => {
  it('puts each node in its free cell, with no clash', () => {
    const cell = (n: { tier: number; column: number }) => [n.tier, n.column];
    expect(cell(UPGRADE_FIELD_RATIONS)).toEqual([2, 2]);
    expect(cell(UPGRADE_EXTRACTION_DRILLS)).toEqual([3, 1]);
    expect(cell(UPGRADE_WAYMARK_LANTERNS)).toEqual([5, 1]);
    expect(cell(UPGRADE_MYSTERY_CRATE)).toEqual([6, 2]);
    const cells = buildingNodes('building.guild_hall').map((n) => `${n.tier}/${n.column}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('keeps Rations and Drills in Tier I and Waymark and the Crate behind the Long Muster', () => {
    const fresh: Profile = { ...newProfile(), currencies: { renown: 1_000_000, trophies: 0, favor: {} } };
    expect(canPurchase(fresh, UPGRADE_FIELD_RATIONS.id).ok).toBe(true);
    expect(canPurchase(fresh, UPGRADE_EXTRACTION_DRILLS.id).ok).toBe(true);
    for (const id of [UPGRADE_WAYMARK_LANTERNS.id, UPGRADE_MYSTERY_CRATE.id]) {
      expect(canPurchase(fresh, id)).toMatchObject({ ok: false, status: 'locked' });
      expect(canPurchase(rich(), id).ok).toBe(true);
    }
  });
});

describe('the pick-one pairs', () => {
  it('make Drills and the Contract Board, and Waymark and Guild Chronicles, exclusive', () => {
    expect(UPGRADE_CONTRACT_BOARD.exclusiveGroup).toBe(UPGRADE_EXTRACTION_DRILLS.exclusiveGroup);
    expect(UPGRADE_GUILD_CHRONICLES.exclusiveGroup).toBe(UPGRADE_WAYMARK_LANTERNS.exclusiveGroup);
    const board = purchase(purchase(rich(), 'upgrade.second_berth'), UPGRADE_CONTRACT_BOARD.id);
    expect(nodeStatus(board, UPGRADE_EXTRACTION_DRILLS.id)).toBe('excluded');
    const chronicles = purchase(rich(), UPGRADE_GUILD_CHRONICLES.id);
    expect(nodeStatus(chronicles, UPGRADE_WAYMARK_LANTERNS.id)).toBe('excluded');
    const drills = purchase(rich(), UPGRADE_EXTRACTION_DRILLS.id);
    expect(nodeStatus(drills, UPGRADE_CONTRACT_BOARD.id)).toBe('excluded');
  });

  it('keep an old save that owns the Contract Board or Chronicles as it was', () => {
    const old = own(rich(), ['upgrade.second_berth', UPGRADE_CONTRACT_BOARD.id, UPGRADE_GUILD_CHRONICLES.id], { [UPGRADE_GUILD_CHRONICLES.id]: 2 });
    const loaded = decodeSave(encodeSave(old, 1));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.profile.upgrades.owned).toEqual(old.upgrades.owned);
    expect(capacity(loaded.profile, 'contractSlots', 1)).toBe(2);
    expect(nodeStatus(loaded.profile, UPGRADE_EXTRACTION_DRILLS.id)).toBe('excluded');
    expect(nodeStatus(loaded.profile, UPGRADE_WAYMARK_LANTERNS.id)).toBe('excluded');
  });

  it('no longer tie the Second Contract Board to the Contract Board', () => {
    expect(UPGRADE_SECOND_CONTRACT_BOARD.requires).toEqual([]);
    const withDrills = purchase(rich(), UPGRADE_EXTRACTION_DRILLS.id);
    expect(canPurchase(withDrills, UPGRADE_SECOND_CONTRACT_BOARD.id).ok).toBe(true);
  });
});

describe('what the nodes put in the run config', () => {
  it('Field Rations issue one ration a rank to each adventurer, merged with other stock', () => {
    expect(config(newProfile()).startStock).toBeUndefined();
    for (const rank of [1, 2, 3]) {
      const profile = own(newProfile(), [UPGRADE_FIELD_RATIONS.id], rank > 1 ? { [UPGRADE_FIELD_RATIONS.id]: rank } : {});
      expect(config(profile).startStock).toEqual([{ item: ITEM_FIELD_RATION.id, qty: rank, each: true }]);
    }
    const both = own(newProfile(), [UPGRADE_FIELD_RATIONS.id, 'upgrade.medics_satchel']);
    expect(config(both).startStock).toHaveLength(2);
  });

  it('Extraction Drills become one gated run modifier a rank', () => {
    const profile = own(newProfile(), [UPGRADE_EXTRACTION_DRILLS.id], { [UPGRADE_EXTRACTION_DRILLS.id]: 3 });
    const mods = upgradeRunModifiers(profile);
    expect(mods.map((m) => m.key)).toEqual([UPGRADE_EXTRACTION_DRILLS.id, `${UPGRADE_EXTRACTION_DRILLS.id}#2`, `${UPGRADE_EXTRACTION_DRILLS.id}#3`]);
    expect(mods.every((m) => m.when === 'fleeing' && m.scope === 'party')).toBe(true);
    expect(config(profile).runModifiers).toEqual(mods);
  });

  it('Waymark Lanterns become one run modifier gated on the return trip', () => {
    const mods = upgradeRunModifiers(own(newProfile(), [UPGRADE_WAYMARK_LANTERNS.id]));
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({ when: 'returning', source: { id: UPGRADE_WAYMARK_LANTERNS.id, label: 'Waymark Lanterns, on the return trip' } });
  });

  it('the Mystery Crate is in the config only when it is switched on', () => {
    const profile = own(newProfile(), [UPGRADE_MYSTERY_CRATE.id]);
    expect(config(profile).startCrate).toBeUndefined();
    expect(config(profile, [UPGRADE_MYSTERY_CRATE.id]).startCrate).toBe(true);
    expect(UPGRADE_MYSTERY_CRATE.optIn).toBe(true);
  });
});

describe('tooltip text', () => {
  it('describes each grant in words, naming the gate', () => {
    expect(describeGrant(UPGRADE_FIELD_RATIONS.grants[0] as never, 3)).toBe('Field rations +3');
    expect(describeGrant(UPGRADE_EXTRACTION_DRILLS.grants[0] as never, 2)).toBe('+20 speed for the run while fleeing');
    expect(describeGrant(UPGRADE_WAYMARK_LANTERNS.grants[0] as never)).toBe('+2 sight, +10 speed for the run on the return trip');
    expect(describeGrant(UPGRADE_MYSTERY_CRATE.grants[0] as never)).toContain('unidentified crate');
  });

  it('every node has a description that says what it does', () => {
    for (const node of [UPGRADE_FIELD_RATIONS, UPGRADE_EXTRACTION_DRILLS, UPGRADE_WAYMARK_LANTERNS, UPGRADE_MYSTERY_CRATE]) {
      expect(UPGRADES.get(node.id).description.length).toBeGreaterThan(60);
    }
  });
});

describe('issued items', () => {
  it('count the ration and the crate contents as reachable without loot entries', () => {
    const issued = issuedItemIds();
    expect(issued.has(ITEM_FIELD_RATION.id)).toBe(true);
    expect(issued.has('item.mending_draught')).toBe(true);
    expect(issued.has('item.copper_band')).toBe(true);
  });
});
