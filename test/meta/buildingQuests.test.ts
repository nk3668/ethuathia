/**
 * Building quests on the Prepare screen (ETH-093): when one is offered, one per run, and gone once
 * its building is open. Fixture buildings, nodes and contracts are registered in this file only
 * (Vitest isolates modules per file).
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDING_QUEST_SHARE,
  BUILDING_SMITHY,
  BUILDING_KIND,
  checkBuildingQuests,
  checkKinds,
  CONTENT_KINDS,
  CONTRACT_KIND,
  CONTRACT_COLD_ANVIL,
  CONTRACT_RECOVER_RELIC,
  CONTRACTS,
  defineBuilding,
  defineContract,
  defineUpgrade,
  ITEM_GUILD_ANVIL,
  UPGRADES,
  UPGRADE_CONTRACT_BOARD,
} from '../../src/content';
import type { ContractDef } from '../../src/content';
import {
  applyRunResult,
  availableContracts,
  buildRunConfig,
  checkRunConfig,
  chosenContracts,
  completeRunChoices,
  contractSlots,
  isMilestoneOpen,
  lockedBuildingQuests,
  newProfile,
  questOffer,
  upgradeShare,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import type { RunResult } from '../../src/sim';

const HALL = 'building.test_hall';
const LIB = 'building.test_library';
const TOME = 'contract.test_tome';

defineBuilding({ id: HALL, name: 'Test Hall', description: 'Fixture nodes.', tags: [], kind: 'foundations' });
// A later building: opens with a contract, asks for the default share of the open buildings' nodes.
defineBuilding({
  id: LIB,
  name: 'Test Library',
  description: 'A fixture building.',
  tags: [],
  kind: 'tactics',
  unlock: { kind: 'objectiveDone', owner: { kind: 'contract', id: TOME }, exited: true },
});
const TOME_QUEST = defineContract({
  id: TOME,
  name: 'The Test Tome',
  description: 'A fixture quest.',
  tags: [],
  objective: { kind: 'recover', item: 'item.mending_draught', depth: 2 },
  reward: { renown: 50 },
  opens: LIB,
});

const node = (id: string, extra: Partial<Parameters<typeof defineUpgrade>[0]> = {}) =>
  defineUpgrade({
    id: `upgrade.${id}`,
    name: id,
    description: 'A fixture node.',
    tags: [],
    building: HALL,
    tier: 1,
    column: 0,
    cost: { renown: 1 },
    requires: [],
    grants: [{ kind: 'capacity', key: 'partySize', amount: 0 }],
    ...extra,
  });
const plain = Array.from({ length: 10 }, (_, i) => node(`t_plain_${i}`));
const ranked = node('t_ranked', { ranks: { max: 4, costGrowth: 1 } });
const pickA = node('t_pick_a', { exclusiveGroup: 'test_pick' });
const pickB = node('t_pick_b', { exclusiveGroup: 'test_pick' });

const own = (profile: Profile, ids: string[], ranks: Record<string, number> = {}): Profile => ({
  ...profile,
  upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, ...ids], ranks: { ...profile.upgrades.ranks, ...ranks } },
});

const anvilResult = (outcome: RunResult['outcome'], id = CONTRACT_COLD_ANVIL.id): RunResult => ({
  ...emptyRunResult(outcome),
  extras: { 'quests.objectives': [{ key: `contract:${id}`, owner: { kind: 'contract', id }, status: 'complete' }] },
});

describe('the upgrade share', () => {
  const base = upgradeShare(newProfile());

  it('counts every node of the open buildings once, and nodes of a locked building not at all', () => {
    // The Smithy is locked and the Guild Hall's Tier II (rows 4 and up) is gated, so only its first three rows and the fixture hall count.
    const hallNodes = UPGRADES.all().filter((n) => (n.building === 'building.guild_hall' && n.tier < 4) || n.building === HALL);
    const groups = new Set(hallNodes.flatMap((n) => (n.exclusiveGroup === undefined ? [] : [n.exclusiveGroup])));
    const ungrouped = hallNodes.filter((n) => n.exclusiveGroup === undefined).length;
    expect(base.total).toBe(ungrouped + groups.size);
    expect(base.bought).toBe(0);
    expect(base.share).toBe(0);
  });

  it('counts a plain node as one, a ranked node by its ranks and a pick-one group once', () => {
    const p = newProfile();
    expect(upgradeShare(own(p, [plain[0]?.id ?? ''])).bought).toBe(1);
    expect(upgradeShare(own(p, [ranked.id], { [ranked.id]: 2 })).bought).toBe(0.5);
    expect(upgradeShare(own(p, [ranked.id], { [ranked.id]: 4 })).bought).toBe(1);
    expect(upgradeShare(own(p, [pickA.id])).bought).toBe(1);
    expect(upgradeShare(own(p, [pickB.id])).bought).toBe(1);
    // Two pick-one nodes are one slot in the total.
    expect(upgradeShare(p).total).toBe(base.total);
  });

  it('counts the nodes of a building once it opens', () => {
    const open: Profile = { ...newProfile(), milestones: { unlocked: [{ id: BUILDING_SMITHY.id, run: 1 }] } };
    // Rows behind the Smithy's closed tier gate (ETH-159) don't count yet.
    const gated = BUILDING_SMITHY.tierGates?.[0]?.fromTier ?? Infinity;
    const rows = UPGRADES.all().filter((n) => n.building === BUILDING_SMITHY.id && n.tier < gated);
    const groups = new Set(rows.flatMap((n) => (n.exclusiveGroup === undefined ? [] : [n.exclusiveGroup])));
    expect(upgradeShare(open).total).toBe(base.total + rows.filter((n) => n.exclusiveGroup === undefined).length + groups.size);
  });
});

describe('when a building quest is offered', () => {
  it('offers the Smithy quest from the first run (offerAt 0)', () => {
    const profile = newProfile();
    expect(CONTRACT_COLD_ANVIL.offerAt).toBe(0);
    expect(questOffer(profile, CONTRACT_COLD_ANVIL)).toEqual({ state: 'offered' });
    expect(availableContracts(profile).map((d) => d.id)).toEqual([CONTRACT_RECOVER_RELIC.id, CONTRACT_COLD_ANVIL.id]);
  });

  it('keeps a later quest locked below the share, offers it at the share, and says what is needed', () => {
    const p = newProfile();
    const total = upgradeShare(p).total;
    const need = Math.ceil(BUILDING_QUEST_SHARE * total);
    expect(BUILDING_QUEST_SHARE).toBe(0.3);
    const ids = plain.map((n) => n.id);
    const below = own(p, ids.slice(0, need - 1));
    expect(questOffer(below, TOME_QUEST)).toEqual({
      state: 'locked',
      need: `Buy 30% of the open buildings' upgrades: ${need - 1} of ${total}`,
    });
    expect(availableContracts(below).map((d) => d.id)).not.toContain(TOME);
    expect(lockedBuildingQuests(below).map((l) => l.def.id)).toContain(TOME);
    const at = own(p, ids.slice(0, need));
    expect(questOffer(at, TOME_QUEST)).toEqual({ state: 'offered' });
    expect(availableContracts(at).map((d) => d.id)).toContain(TOME);
    expect(lockedBuildingQuests(at).map((l) => l.def.id)).not.toContain(TOME);
  });

  it('drops the quest from the list once its building is open', () => {
    const open: Profile = { ...newProfile(), milestones: { unlocked: [{ id: BUILDING_SMITHY.id, run: 1 }] } };
    expect(questOffer(open, CONTRACT_COLD_ANVIL)).toEqual({ state: 'done' });
    expect(availableContracts(open).map((d) => d.id)).toEqual([CONTRACT_RECOVER_RELIC.id]);
    expect(lockedBuildingQuests(open).map((l) => l.def.id)).not.toContain(CONTRACT_COLD_ANVIL.id);
  });
});

describe('one building quest per run', () => {
  const two = (profile: Profile): Profile => ({ ...profile, upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, UPGRADE_CONTRACT_BOARD.id] } });
  const rich = (): Profile => own(newProfile(), plain.map((n) => n.id));

  it('takes only the first building quest picked, even with a slot to spare', () => {
    const p = two(rich());
    expect(contractSlots(p)).toBe(2);
    const ids = chosenContracts(p, { contractIds: [CONTRACT_COLD_ANVIL.id, TOME] }).map((d) => d.id);
    expect(ids).toEqual([CONTRACT_COLD_ANVIL.id]);
    // A building quest alongside the relic is fine, and still uses a slot.
    expect(chosenContracts(p, { contractIds: [TOME, CONTRACT_RECOVER_RELIC.id] }).map((d) => d.id)).toEqual([TOME, CONTRACT_RECOVER_RELIC.id]);
    expect(buildRunConfig(p, completeRunChoices({ contracts: { contractIds: [CONTRACT_COLD_ANVIL.id, TOME] } }), 1).contracts).toEqual([
      CONTRACT_COLD_ANVIL.id,
    ]);
  });

  it('refuses a config that lists two, with a reason', () => {
    const party = [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }];
    expect(checkRunConfig({ party, contracts: [CONTRACT_COLD_ANVIL.id, TOME] })).toContain('only one building quest may be taken per run');
    expect(checkRunConfig({ party, contracts: [CONTRACT_COLD_ANVIL.id, CONTRACT_RECOVER_RELIC.id] })).toEqual([]);
  });

  it('does not offer a locked quest in a run config either', () => {
    expect(chosenContracts(newProfile(), { contractIds: [TOME] }).map((d) => d.id)).toEqual([CONTRACT_RECOVER_RELIC.id]);
  });
});

describe('opening the building', () => {
  it('opens on a victory or a retreat with the quest done, not on a wipe', () => {
    const opened = (outcome: RunResult['outcome']) => isMilestoneOpen(applyRunResult(newProfile(), anvilResult(outcome)), BUILDING_SMITHY.id);
    expect(opened('victory')).toBe(true);
    expect(opened('retreat')).toBe(true);
    expect(opened('wipe')).toBe(false);
  });

  it('opens a fixture building with a quest the same way, without touching the Smithy', () => {
    const profile = applyRunResult(newProfile(), anvilResult('victory', TOME));
    expect(isMilestoneOpen(profile, LIB)).toBe(true);
    expect(isMilestoneOpen(profile, BUILDING_SMITHY.id)).toBe(false);
  });
});

/** Problems with the building and contract defs (their shapes, refs and cross-def checks). */
function contentProblems(): string[] {
  const kinds = CONTENT_KINDS.filter((k) => k === CONTRACT_KIND || k === BUILDING_KIND || ['item', 'dungeon', 'floor type', 'upgrade'].includes(k.registry.kind));
  return checkKinds(kinds, []).filter((p) => /contract "|building "/.test(p));
}

describe('content checks', () => {
  it('passes for the shipped content and the fixtures', () => {
    expect(checkBuildingQuests(CONTRACTS.all())).toEqual([]);
    expect(contentProblems()).toEqual([]);
  });

  it('flags a quest that asks for a floor deeper than the shallowest dungeon', () => {
    const deep: ContractDef = { ...CONTRACT_COLD_ANVIL, objective: { kind: 'recover', item: ITEM_GUILD_ANVIL.id, depth: 99 } };
    expect(checkBuildingQuests([deep]).join('\n')).toMatch(/contract "contract.cold_anvil": asks for floor 99, but a dungeon can be as shallow as \d+ floors/);
    const reach: ContractDef = { ...CONTRACT_COLD_ANVIL, objective: { kind: 'reach', depth: 99 } };
    expect(checkBuildingQuests([reach]).join('\n')).toMatch(/floor 99/);
    // A contract that opens nothing may ask for anything.
    expect(checkBuildingQuests([{ ...deep, opens: undefined }])).toEqual([]);
  });

  it('flags a building and its quest that do not name each other', () => {
    const lost: ContractDef = { ...CONTRACT_COLD_ANVIL, id: 'contract.test_other' };
    expect(checkBuildingQuests([lost]).join('\n')).toMatch(/opens "building.smithy", whose unlock must be an objectiveDone milestone on this contract/);
  });

  it('validates the new fields', () => {
    CONTRACTS.register({ ...CONTRACT_COLD_ANVIL, id: 'contract.test_bad_share', offerAt: 2 });
    CONTRACTS.register({ ...CONTRACT_COLD_ANVIL, id: 'contract.test_bad', opens: 'building.nope' });
    const problems = contentProblems().join('\n');
    expect(problems).toMatch(/contract.test_bad_share[^\n]*offerAt/);
    expect(problems).toMatch(/contract.test_bad[^\n]*building.nope/);
  });
});
