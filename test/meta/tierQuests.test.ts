/**
 * Tier quests (ETH-170): a contract that opens one of a building's tier gates. Fixture buildings,
 * nodes and contracts are registered in this file only (Vitest isolates modules per file); no
 * shipped building has gates yet.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDING_KIND,
  CONTENT_KINDS,
  CONTRACT_COLD_ANVIL,
  CONTRACT_KIND,
  CONTRACTS,
  checkBuildingQuests,
  checkKinds,
  defineBuilding,
  defineContract,
  defineUpgrade,
  offerShare,
  opensTarget,
  TIER_QUEST_SHARE,
  tierGateId,
  UPGRADE_CONTRACT_BOARD,
} from '../../src/content';
import type { ContractDef } from '../../src/content';
import {
  applyRunResult,
  availableContracts,
  checkRunConfig,
  chosenContracts,
  isMilestoneOpen,
  lockedBuildingQuests,
  newProfile,
  questOffer,
  upgradeShare,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import type { RunResult } from '../../src/sim';
import { tierOpenText, unlockLines } from '../../src/ui/shell/runSummaryText';

const FORGE = 'building.test_forge';
const FIRST = 'contract.test_tier_two';
const SECOND = 'contract.test_tier_three';

const quest = (id: string, depth: number, fromTier: number) =>
  defineContract({
    id,
    name: `Quest ${id}`,
    description: 'A fixture quest.',
    tags: [],
    objective: { kind: 'recover', item: 'item.mending_draught', depth },
    reward: { trophies: 50 },
    opens: { building: FORGE, fromTier },
  });
const gateOn = (id: string) => ({ kind: 'objectiveDone', owner: { kind: 'contract', id }, exited: true }) as const;

// Open from the start, with gates above rows 3 and 5.
defineBuilding({
  id: FORGE,
  name: 'Test Forge',
  description: 'A fixture building with two tier gates.',
  tags: [],
  kind: 'foundations',
  tierGates: [
    { fromTier: 3, unlock: gateOn(FIRST) },
    { fromTier: 5, unlock: gateOn(SECOND) },
  ],
});
const TIER_TWO = quest(FIRST, 4, 3);
const TIER_THREE = quest(SECOND, 5, 5);

const node = (id: string, tier: number, extra: Partial<Parameters<typeof defineUpgrade>[0]> = {}) =>
  defineUpgrade({
    id: `upgrade.${id}`,
    name: id,
    description: 'A fixture node.',
    tags: [],
    building: FORGE,
    tier,
    column: 0,
    cost: { renown: 1 },
    requires: [],
    grants: [{ kind: 'capacity', key: 'partySize', amount: 0 }],
    ...extra,
  });
// Open band (rows 1 and 2): two plain nodes, one ranked node and a pick-one pair = 4 nodes.
const plainA = node('tq_plain_a', 1);
const plainB = node('tq_plain_b', 1);
const ranked = node('tq_ranked', 2, { ranks: { max: 4, costGrowth: 1 } });
const pickA = node('tq_pick_a', 2, { exclusiveGroup: 'tq_pick' });
const pickB = node('tq_pick_b', 2, { exclusiveGroup: 'tq_pick' });
// Behind the first gate: must not count until it is open.
const deepA = node('tq_deep_a', 3);
const deepB = node('tq_deep_b', 4);
node('tq_deepest', 5);

const own = (profile: Profile, ids: string[], ranks: Record<string, number> = {}): Profile => ({
  ...profile,
  upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, ...ids], ranks: { ...profile.upgrades.ranks, ...ranks } },
});
const withUnlocked = (profile: Profile, ...ids: string[]): Profile => ({
  ...profile,
  milestones: { unlocked: [...profile.milestones.unlocked, ...ids.map((id) => ({ id, run: 1 }))] },
});
const doneResult = (outcome: RunResult['outcome'], id: string): RunResult => ({
  ...emptyRunResult(outcome),
  extras: { 'quests.objectives': [{ key: `contract:${id}`, owner: { kind: 'contract', id }, status: 'complete' }] },
});

const GATE_ONE = tierGateId(FORGE, 3);
const GATE_TWO = tierGateId(FORGE, 5);

describe('the offer share of one building', () => {
  it('counts only that building and only its open tiers', () => {
    const share = upgradeShare(newProfile(), FORGE);
    expect(share.total).toBe(4); // plain, plain, ranked, pick pair; rows 3 and below are gated
    expect(share.bought).toBe(0);
  });

  it('counts plain nodes, ranked nodes by their ranks and a pick-one group once', () => {
    const p = newProfile();
    expect(upgradeShare(own(p, [plainA.id]), FORGE).bought).toBe(1);
    expect(upgradeShare(own(p, [ranked.id], { [ranked.id]: 2 }), FORGE).bought).toBe(0.5);
    expect(upgradeShare(own(p, [pickA.id]), FORGE).bought).toBe(1);
    expect(upgradeShare(own(p, [pickB.id]), FORGE).bought).toBe(1);
  });

  it('counts the next band once its gate is open', () => {
    const open = withUnlocked(newProfile(), GATE_ONE);
    expect(upgradeShare(open, FORGE).total).toBe(4 + 2); // rows 3 and 4; row 5 is still gated
    expect(upgradeShare(withUnlocked(open, GATE_TWO), FORGE).total).toBe(4 + 3);
  });

  it('leaves the all-buildings share alone when no building is named', () => {
    const all = upgradeShare(newProfile());
    expect(all.total).toBeGreaterThanOrEqual(upgradeShare(newProfile(), FORGE).total);
  });
});

describe('when a tier quest is offered', () => {
  it('asks for TIER_QUEST_SHARE of its building by default', () => {
    expect(TIER_QUEST_SHARE).toBe(0.5);
    expect(offerShare(TIER_TWO)).toBe(0.5);
    expect(offerShare({ ...TIER_TWO, offerAt: 0.2 })).toBe(0.2);
    expect(opensTarget(TIER_TWO)).toBe(GATE_ONE);
  });

  it('is locked below the share (plain nodes), with progress text, and offered at it', () => {
    const p = newProfile();
    const below = own(p, [plainA.id]);
    expect(questOffer(below, TIER_TWO)).toEqual({ state: 'locked', need: "Buy 50% of the Test Forge's upgrades: 1 of 4" });
    expect(availableContracts(below).map((d) => d.id)).not.toContain(FIRST);
    expect(lockedBuildingQuests(below).map((l) => l.def.id)).toContain(FIRST);
    const at = own(p, [plainA.id, plainB.id]);
    expect(questOffer(at, TIER_TWO)).toEqual({ state: 'offered' });
    expect(availableContracts(at).map((d) => d.id)).toContain(FIRST);
    expect(lockedBuildingQuests(at).map((l) => l.def.id)).not.toContain(FIRST);
  });

  it('counts ranked nodes in proportion', () => {
    const p = newProfile();
    // 1 plain + 2 of 4 ranks (0.5) = 1.5 of 4: below.
    expect(questOffer(own(p, [plainA.id, ranked.id], { [ranked.id]: 2 }), TIER_TWO).state).toBe('locked');
    // 1 plain + 2 of 4 ranks (0.5) + a pick = 2.5: at or above half of 4.
    expect(questOffer(own(p, [plainA.id, ranked.id, pickA.id], { [ranked.id]: 2 }), TIER_TWO)).toEqual({ state: 'offered' });
    // A pick-one group is one node, not two.
    expect(questOffer(own(p, [plainA.id, pickA.id]), TIER_TWO)).toEqual({ state: 'offered' });
    expect(questOffer(own(p, [plainA.id, pickB.id]), TIER_TWO)).toEqual({ state: 'offered' });
  });

  it('is gone once its gate is open, and the next quest waits for the first', () => {
    const rich = own(newProfile(), [plainA.id, plainB.id, ranked.id, pickA.id], { [ranked.id]: 4 });
    expect(questOffer(rich, TIER_TWO)).toEqual({ state: 'offered' });
    expect(questOffer(rich, TIER_THREE)).toEqual({ state: 'hidden' });
    const open = withUnlocked(rich, GATE_ONE);
    expect(questOffer(open, TIER_TWO)).toEqual({ state: 'done' });
    // Tier three now counts rows 3 and 4 too: 4 of 6 bought is still over half.
    expect(questOffer(open, TIER_THREE)).toEqual({ state: 'offered' });
  });

  it('counts the newly opened band, so the next quest needs more buying', () => {
    const rich = own(newProfile(), [plainA.id, plainB.id, ranked.id, pickA.id], { [ranked.id]: 4 });
    const open = withUnlocked(rich, GATE_ONE);
    // 4 of 6; with rows 3 and 4 unbought a share of exactly 0.5 needs 3.
    expect(upgradeShare(open, FORGE).total).toBe(6);
    const thin = own(withUnlocked(newProfile(), GATE_ONE), [plainA.id, plainB.id]);
    expect(questOffer(thin, TIER_THREE)).toEqual({ state: 'locked', need: "Buy 50% of the Test Forge's upgrades: 2 of 6" });
    expect(questOffer(own(thin, [deepA.id]), TIER_THREE)).toEqual({ state: 'offered' });
    expect(deepB.id).toBeTruthy();
  });

  it('is hidden while its building is locked', () => {
    const LOCKED = 'building.test_sealed';
    const SEALED_QUEST = 'contract.test_sealed_tier';
    defineBuilding({
      id: LOCKED,
      name: 'Test Vault',
      description: 'A fixture building behind a milestone.',
      tags: [],
      kind: 'foundations',
      unlock: { kind: 'reachDepth', depth: 99 },
      tierGates: [{ fromTier: 2, unlock: gateOn(SEALED_QUEST) }],
    });
    const sealed = defineContract({
      id: SEALED_QUEST,
      name: 'Sealed Quest',
      description: 'A fixture quest.',
      tags: [],
      objective: { kind: 'recover', item: 'item.mending_draught', depth: 3 },
      reward: { renown: 10 },
      opens: { building: LOCKED, fromTier: 2 },
    });
    expect(questOffer(newProfile(), sealed)).toEqual({ state: 'hidden' });
    expect(availableContracts(newProfile()).map((d) => d.id)).not.toContain(SEALED_QUEST);
    expect(lockedBuildingQuests(newProfile()).map((l) => l.def.id)).not.toContain(SEALED_QUEST);
  });
});

describe('a tier quest is a building quest', () => {
  const rich = (): Profile =>
    own(
      { ...newProfile(), upgrades: { owned: [UPGRADE_CONTRACT_BOARD.id], ranks: {} } },
      [plainA.id, plainB.id],
    );

  it('takes only one building quest per run, a tier quest or the building one', () => {
    const p = rich();
    const ids = chosenContracts(p, { contractIds: [FIRST, CONTRACT_COLD_ANVIL.id] }).map((d) => d.id);
    expect(ids).toEqual([FIRST]);
    expect(chosenContracts(p, { contractIds: [CONTRACT_COLD_ANVIL.id, FIRST] }).map((d) => d.id)).toEqual([CONTRACT_COLD_ANVIL.id]);
  });

  it('is refused by the run config when listed with another, and uses a slot', () => {
    const party = [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }];
    expect(checkRunConfig({ party, contracts: [FIRST, CONTRACT_COLD_ANVIL.id] })).toContain('only one building quest may be taken per run');
    expect(checkRunConfig({ party, contracts: [FIRST] })).toEqual([]);
  });

  it('is not chosen while it is still locked', () => {
    expect(chosenContracts(newProfile(), { contractIds: [FIRST] }).map((d) => d.id)).not.toContain(FIRST);
  });
});

describe('opening the gate', () => {
  it('opens exactly its own gate on a victory or a retreat with the quest done', () => {
    for (const outcome of ['victory', 'retreat'] as const) {
      const p = applyRunResult(newProfile(), doneResult(outcome, FIRST));
      expect(isMilestoneOpen(p, GATE_ONE)).toBe(true);
      expect(isMilestoneOpen(p, GATE_TWO)).toBe(false);
    }
  });

  it('does not open on a wipe', () => {
    const p = applyRunResult(newProfile(), doneResult('wipe', FIRST));
    expect(isMilestoneOpen(p, GATE_ONE)).toBe(false);
  });

  it('does not open with another contract done, and opens the second gate separately', () => {
    expect(isMilestoneOpen(applyRunResult(newProfile(), doneResult('victory', SECOND)), GATE_ONE)).toBe(false);
    const p = applyRunResult(newProfile(), doneResult('victory', SECOND));
    expect(isMilestoneOpen(p, GATE_TWO)).toBe(true);
  });

  it('keeps a gate open once recorded, whatever happens later or to the content', () => {
    const opened = applyRunResult(newProfile(), doneResult('victory', FIRST));
    const later = applyRunResult(opened, emptyRunResult('wipe'));
    expect(isMilestoneOpen(later, GATE_ONE)).toBe(true);
    // A gate whose building or gate left the content reads as open: nothing locks it.
    expect(isMilestoneOpen(withUnlocked(newProfile(), tierGateId('building.test_gone', 2)), tierGateId('building.test_gone', 2))).toBe(true);
    expect(isMilestoneOpen(newProfile(), tierGateId('building.test_gone', 2))).toBe(true);
  });
});

describe('the run summary line', () => {
  it('says which tier opened', () => {
    expect(tierOpenText({ building: 'Smithy', band: 2 })).toBe("The Smithy's second tier is open");
    const p = applyRunResult(newProfile(), doneResult('victory', FIRST));
    const lines = unlockLines(p, 1).filter((l) => l.id === GATE_ONE);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.tier).toEqual({ building: 'Test Forge', band: 2 });
  });
});

describe('content checks', () => {
  it('pass for the fixtures and the shipped content', () => {
    expect(checkBuildingQuests(CONTRACTS.all())).toEqual([]);
    const kinds = CONTENT_KINDS.filter((k) => k === CONTRACT_KIND || k === BUILDING_KIND || ['item', 'dungeon', 'floor type', 'upgrade'].includes(k.registry.kind));
    expect(checkKinds(kinds, []).filter((p) => /contract "|building "/.test(p))).toEqual([]);
  });

  it('flags a tier quest whose gate is missing or unlocked by something else', () => {
    const noGate: ContractDef = { ...TIER_TWO, opens: { building: FORGE, fromTier: 4 } };
    expect(checkBuildingQuests([noGate]).join('\n')).toMatch(/opens tier 4 of "building.test_forge", which has no tier gate at that row/);
    const stray: ContractDef = { ...TIER_TWO, id: 'contract.test_stray' };
    expect(checkBuildingQuests([stray]).join('\n')).toMatch(/opens the tier 3 gate of "building.test_forge", whose unlock must be an objectiveDone milestone on this contract/);
  });

  it('flags a gate whose quest does not say it opens that tier', () => {
    const wrong: ContractDef = { ...TIER_TWO, opens: { building: FORGE, fromTier: 5 } };
    const asContracts = [wrong, TIER_THREE];
    // The forward check: the gate at row 5 is unlocked by the other quest, not this one.
    expect(checkBuildingQuests(asContracts).join('\n')).toMatch(/contract "contract.test_tier_two": opens the tier 5 gate/);
  });

  it('flags a tier quest that asks for no deeper a floor than the quest before it', () => {
    const flat: ContractDef = { ...TIER_THREE, objective: { kind: 'recover', item: 'item.mending_draught', depth: 4 } };
    expect(checkBuildingQuests([TIER_TWO, flat]).join('\n')).toMatch(
      /contract "contract.test_tier_three": asks for floor 4, which is not deeper than floor 4 asked by "contract.test_tier_two"/,
    );
    const shallower: ContractDef = { ...TIER_THREE, objective: { kind: 'recover', item: 'item.mending_draught', depth: 2 } };
    expect(checkBuildingQuests([TIER_TWO, shallower]).join('\n')).toMatch(/not deeper than floor 4/);
    expect(checkBuildingQuests([TIER_TWO, TIER_THREE])).toEqual([]);
  });

  it('puts the building quest before its tier quests in the depth order', () => {
    const OWN = 'building.test_chain';
    const OPENER = 'contract.test_chain_open';
    const NEXT = 'contract.test_chain_next';
    defineBuilding({
      id: OWN,
      name: 'Test Chain',
      description: 'A fixture building.',
      tags: [],
      kind: 'foundations',
      unlock: gateOn(OPENER),
      tierGates: [{ fromTier: 2, unlock: gateOn(NEXT) }],
    });
    const opener = defineContract({
      id: OPENER,
      name: 'Opener',
      description: 'A fixture quest.',
      tags: [],
      objective: { kind: 'recover', item: 'item.mending_draught', depth: 3 },
      reward: { renown: 10 },
      opens: OWN,
    });
    const next = defineContract({
      id: NEXT,
      name: 'Next',
      description: 'A fixture quest.',
      tags: [],
      objective: { kind: 'recover', item: 'item.mending_draught', depth: 3 },
      reward: { renown: 10 },
      opens: { building: OWN, fromTier: 2 },
    });
    const problems = checkBuildingQuests([opener, next]).join('\n');
    expect(problems).toMatch(/contract "contract.test_chain_next": asks for floor 3, which is not deeper than floor 3 asked by "contract.test_chain_open"/);
    expect(checkBuildingQuests([opener, { ...next, objective: { kind: 'recover', item: 'item.mending_draught', depth: 5 } }])).toEqual([]);
  });

  it('flags a tier quest floor deeper than the shallowest dungeon', () => {
    const deep: ContractDef = { ...TIER_TWO, objective: { kind: 'recover', item: 'item.mending_draught', depth: 99 } };
    expect(checkBuildingQuests([deep]).join('\n')).toMatch(/asks for floor 99, but a dungeon can be as shallow as/);
  });

  it('validates the opens shape', () => {
    CONTRACTS.register({ ...TIER_TWO, id: 'contract.test_bad_tier', opens: { building: FORGE, fromTier: 1 } });
    CONTRACTS.register({ ...TIER_TWO, id: 'contract.test_bad_ref', opens: { building: 'building.nope', fromTier: 2 } });
    const kinds = CONTENT_KINDS.filter((k) => k === CONTRACT_KIND || k === BUILDING_KIND || ['item', 'dungeon', 'floor type', 'upgrade'].includes(k.registry.kind));
    const problems = checkKinds(kinds, []).join('\n');
    expect(problems).toMatch(/contract.test_bad_tier[^\n]*opens/);
    expect(problems).toMatch(/contract.test_bad_ref[^\n]*building.nope/);
  });
});
