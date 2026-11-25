import { describe, expect, it } from 'vitest';
import {
  BUILDING_KIND,
  BUILDING_SMITHY,
  checkKinds,
  defineUpgrade,
  describeMilestone,
  describeMilestoneMet,
  describeProgress,
  milestoneMet,
  milestoneSchema,
  UPGRADES,
} from '../../src/content';
import type { BuildingDef, ContentKind, Milestone } from '../../src/content';
import { Registry } from '../../src/core';
import {
  applyRunResult,
  canPurchase,
  checkProfile,
  isMilestoneOpen,
  latestUnlocks,
  lockingMilestone,
  milestoneProgress,
  newProfile,
  unlockMilestones,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import type { RunResult } from '../../src/sim';

function run(overrides: Partial<RunResult> = {}): RunResult {
  return { ...emptyRunResult('retreat'), ...overrides };
}

/** A run that ended `outcome` with the Smithy's quest complete (or not). */
function anvilRun(outcome: RunResult['outcome'], complete = true): RunResult {
  const owner = { kind: 'contract', id: 'contract.cold_anvil' };
  const objectives = [{ key: 'contract:contract.cold_anvil', owner, status: complete ? 'complete' : 'active' }];
  return { ...emptyRunResult(outcome), extras: { 'quests.objectives': objectives } };
}

const SMITHY = BUILDING_SMITHY.id;

describe('milestone content', () => {
  const progress = { deepestDepth: 2, runs: 3, victories: 0, metInRun: [], objectivesDone: [], objectivesExited: [] };

  it('checks each kind against lifetime totals', () => {
    expect(milestoneMet({ kind: 'reachDepth', depth: 2 }, progress)).toBe(true);
    expect(milestoneMet({ kind: 'reachDepth', depth: 3 }, progress)).toBe(false);
    expect(milestoneMet({ kind: 'finishRuns', count: 3 }, progress)).toBe(true);
    expect(milestoneMet({ kind: 'winRuns', count: 1 }, progress)).toBe(false);
  });

  it('words each kind as a goal, as done and as progress', () => {
    const cases: [Milestone, string, string, string][] = [
      [{ kind: 'reachDepth', depth: 3 }, 'Reach floor 3', 'you reached floor 3', 'Deepest so far: floor 2'],
      [{ kind: 'finishRuns', count: 1 }, 'Finish a run', 'you finished a run', 'Runs finished: 1 of 1'],
      [{ kind: 'finishRuns', count: 5 }, 'Finish 5 runs', 'you finished 5 runs', 'Runs finished: 3 of 5'],
      [{ kind: 'winRuns', count: 2 }, 'Win 2 runs', 'you won 2 runs', 'Runs won: 0 of 2'],
    ];
    for (const [m, goal, done, now] of cases) {
      expect(describeMilestone(m)).toBe(goal);
      expect(describeMilestoneMet(m)).toBe(done);
      expect(describeProgress(m, progress)).toBe(now);
    }
  });

  it('validates a building unlock milestone', () => {
    const registry = new Registry<BuildingDef>('building');
    const kind: ContentKind<BuildingDef> = { ...BUILDING_KIND, registry };
    const base = { name: 'Hut', description: 'A hut.', tags: [], kind: 'foundations' as const };
    registry.register({ ...base, id: 'building.ok', unlock: { kind: 'winRuns', count: 1 } });
    registry.register({ ...base, id: 'building.none' });
    registry.register({ ...base, id: 'building.zero', unlock: { kind: 'reachDepth', depth: 0 } });
    registry.register({ ...base, id: 'building.odd', unlock: { kind: 'befriendRat', count: 1 } as unknown as Milestone });
    const problems = checkKinds([kind] as ContentKind[], []);
    expect(problems.some((p) => p.includes('building.zero') && p.includes('unlock.depth'))).toBe(true);
    expect(problems.some((p) => p.includes('building.odd'))).toBe(true);
    expect(problems.some((p) => p.includes('building.ok') || p.includes('building.none'))).toBe(false);
  });
});

describe('milestone unlocks', () => {
  it('starts the Smithy locked and the Guild Hall open', () => {
    const profile = newProfile();
    expect(isMilestoneOpen(profile, 'building.guild_hall')).toBe(true);
    expect(isMilestoneOpen(profile, SMITHY)).toBe(false);
    expect(lockingMilestone(profile, SMITHY)).toEqual({ kind: 'objectiveDone', owner: { kind: 'contract', id: 'contract.cold_anvil' }, exited: true });
    expect(profile.milestones).toEqual({ unlocked: [] });
  });

  it('unlocks in applyRunResult once a run meets the milestone, recording the run', () => {
    let profile: Profile = applyRunResult(newProfile(), run({ deepestDepth: 3 }));
    expect(isMilestoneOpen(profile, SMITHY)).toBe(false);
    expect(latestUnlocks(profile)).toEqual([]);

    profile = applyRunResult(profile, anvilRun('victory'));
    expect(isMilestoneOpen(profile, SMITHY)).toBe(true);
    // The win also reveals the Stonekin (ETH-036), recorded under its node's id.
    const opened = [{ id: SMITHY, run: 2 }, { id: 'upgrade.stonekin_recruitment', run: 2 }];
    expect(profile.milestones.unlocked).toEqual(opened);
    expect(latestUnlocks(profile)).toEqual(opened);
    expect(checkProfile(profile)).toEqual([]);

    // Stays open, recorded once; a later run opened nothing new.
    profile = applyRunResult(profile, anvilRun('retreat', false));
    expect(profile.milestones.unlocked).toEqual(opened);
    expect(latestUnlocks(profile)).toEqual([]);
  });

  it('opens a building quest only on a victory or a retreat with it done, never a wipe', () => {
    const open = (result: RunResult) => isMilestoneOpen(applyRunResult(newProfile(), result), SMITHY);
    expect(open(anvilRun('victory'))).toBe(true);
    expect(open(anvilRun('retreat'))).toBe(true);
    expect(open(anvilRun('wipe'))).toBe(false);
    expect(open(anvilRun('victory', false))).toBe(false);
    expect(open(run({ deepestDepth: 9 }))).toBe(false);
  });

  it('keeps a building an old profile already opened, whatever its milestone is now', () => {
    // A save from before ETH-093 opened the Smithy by reaching floor 3: the record is all that counts.
    const old: Profile = { ...newProfile(), milestones: { unlocked: [{ id: SMITHY, run: 3 }] } };
    expect(isMilestoneOpen(old, SMITHY)).toBe(true);
    expect(lockingMilestone(old, SMITHY)).toBeNull();
    expect(checkProfile(old)).toEqual([]);
    const after = applyRunResult(old, anvilRun('wipe', false));
    expect(after.milestones.unlocked).toEqual([{ id: SMITHY, run: 3 }]);
  });

  it('counts lifetime totals, not just the latest run', () => {
    const before = newProfile();
    const many: Profile = { ...before, history: { ...before.history, totals: { ...before.history.totals, runs: 4, deepestDepth: 5 } } };
    // A lifetime total no longer opens the Smithy; only its quest does.
    const opened = unlockMilestones(many).milestones.unlocked.map((u) => u.id);
    expect(opened).not.toContain(SMITHY);
    // The depth reveals (ETH-036) do read lifetime totals: floor 4 is reached (Outrider); Reaver now watches 40 kills in one run (ETH-184).
    expect(opened).toEqual(['upgrade.outrider_training']);
    expect(milestoneMet({ kind: 'finishRuns', count: 4 }, milestoneProgress(many))).toBe(true);
    expect(milestoneMet({ kind: 'reachDepth', depth: 6 }, milestoneProgress(many))).toBe(false);
  });

  it('can express the background quests with fixture content (Ossuary, Tavern)', () => {
    // Background quests are milestones, not contracts (ETH-093): they need no contract slot and no walk out.
    const bury: Milestone = { kind: 'objectiveDone', owner: { kind: 'quest', id: 'quest.first_burial' } };
    const veteran: Milestone = { kind: 'winRuns', count: 5 };
    expect(milestoneSchema.safeParse(bury).success).toBe(true);
    const progress = { deepestDepth: 1, runs: 1, victories: 5, metInRun: [], objectivesDone: ['quest:quest.first_burial'], objectivesExited: [] };
    expect(milestoneMet(bury, progress)).toBe(true);
    expect(milestoneMet(veteran, progress)).toBe(true);
  });

  it('words the exit rule for a building quest', () => {
    const m = BUILDING_SMITHY.unlock as Milestone;
    expect(describeMilestone(m)).toBe('Complete the contract contract.cold_anvil and walk out of the dungeon');
  });

  it('does not hold back nodes of an open building', () => {
    const node = UPGRADES.all().find((n) => n.building === 'building.guild_hall' && n.requires.length === 0);
    const rich = newProfile();
    const profile: Profile = { ...rich, currencies: { ...rich.currencies, renown: 1e6, trophies: 1e6 } };
    expect(canPurchase(profile, node?.id ?? '')).toEqual({ ok: true });
  });

  it('refuses nodes of a locked building, saying what opens it', () => {
    // Registered only in this test file (Vitest isolates modules per file).
    const anvil = defineUpgrade({
      id: 'upgrade.test_anvil',
      name: 'Test Anvil',
      description: 'For this test only.',
      tags: [],
      building: SMITHY,
      tier: 1,
      column: 0,
      cost: { trophies: 1 },
      requires: [],
      grants: [{ kind: 'capacity', key: 'partySize', amount: 1 }],
    });
    const rich = newProfile();
    const profile: Profile = { ...rich, currencies: { ...rich.currencies, trophies: 10 } };
    expect(canPurchase(profile, anvil.id)).toEqual({
      ok: false,
      status: 'locked',
      missing: [],
      reason: 'The Smithy opens when you complete the contract The Cold Anvil and walk out of the dungeon.',
    });
    const open: Profile = { ...profile, milestones: { unlocked: [{ id: SMITHY, run: 1 }] } };
    expect(canPurchase(open, anvil.id)).toEqual({ ok: true });
  });

  it('rejects a slice that lists an id twice', () => {
    const profile = newProfile();
    const bad = { ...profile, milestones: { unlocked: [{ id: SMITHY, run: 1 }, { id: SMITHY, run: 2 }] } };
    expect(checkProfile(bad).some((p) => p.startsWith('milestones.unlocked'))).toBe(true);
  });
});
