/** Class Mastery (ETH-087): the `mastery` slice, the curve, and what a run gives each class. */
import { describe, expect, it } from 'vitest';
import {
  applyRunResult,
  checkProfile,
  classMastery,
  decodeSave,
  encodeSave,
  MASTERY_BONUS_PER_DEPTH,
  MASTERY_BONUS_PER_OBJECTIVE,
  MASTERY_COMPANION_SHARE,
  MASTERY_CURVE,
  masteryGain,
  masteryGainBanked,
  masteryLevel,
  masteryOf,
  masteryProgress,
  masteryStepCost,
  masteryXpForLevel,
  newProfile,
} from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';
import type { RunResult } from '../../src/sim';
import { SAVE_FORMAT } from '../../src/meta';

interface Member {
  actor: number;
  xp: number;
  classId?: string;
  companion?: true;
}

/** A finished run's result: the party with each member's run XP, how deep it got and objectives done. */
function run(members: readonly Member[], opts: { outcome?: RunResult['outcome']; deepest?: number; contracts?: number } = {}): RunResult {
  return {
    ...emptyRunResult(opts.outcome ?? 'victory'),
    deepestDepth: opts.deepest ?? 0,
    extras: {
      'run.party': members.map((m) => ({
        actor: m.actor,
        name: `M${m.actor}`,
        classId: m.classId ?? 'class.vanguard',
        raceId: 'race.human',
        ...(m.companion ? { companion: true } : {}),
      })),
      'track.xp': {
        byActor: Object.fromEntries(members.map((m) => [m.actor, { classId: m.classId ?? 'class.vanguard', xp: m.xp, level: 1 }])),
        byClass: {},
      },
      'quests.objectives': Array.from({ length: opts.contracts ?? 0 }, (_, i) => ({
        key: `contract:contract.c${i}`,
        owner: { kind: 'contract', id: `contract.c${i}` },
        status: 'complete',
      })),
    },
  };
}

/** `result` with one extra replaced. */
const withExtras = (result: RunResult, key: string, value: unknown): RunResult => ({ ...result, extras: { ...result.extras, [key]: value } });

const gainOf = (result: RunResult, classId = 'class.vanguard') => masteryGain(newProfile(), result).find((g) => g.classId === classId);

describe('the Mastery curve', () => {
  it('starts at level 0 and costs base × (1 + growth × L) per level', () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryStepCost(0)).toBe(MASTERY_CURVE.base);
    expect(masteryStepCost(10)).toBe(Math.round(MASTERY_CURVE.base * (1 + MASTERY_CURVE.growth * 10)));
  });

  it('puts level boundaries exactly on the cumulative cost, with no cap', () => {
    for (const level of [1, 2, 5, 10, 40, 100, 500]) {
      const need = masteryXpForLevel(level);
      expect(masteryLevel(need)).toBe(level);
      expect(masteryLevel(need - 1)).toBe(level - 1);
    }
    expect(masteryLevel(1e9)).toBeGreaterThan(1000);
  });

  it('reports the XP into the level and to the next', () => {
    const into = 30;
    const xp = masteryXpForLevel(3) + into;
    expect(masteryProgress(xp)).toEqual({ level: 3, into, toNext: masteryStepCost(3) - into });
  });
});

describe('what a run gives a class', () => {
  it('counts a living and a fallen member alike (both are in track.xp)', () => {
    const g = gainOf(run([{ actor: 1, xp: 400 }, { actor: 2, xp: 300 }]));
    expect(g?.members.map((m) => m.gained)).toEqual([400, 225]);
  });

  it('gives the highest earner 100%, then 75%, 50% and 25%, by XP order', () => {
    const two = gainOf(run([{ actor: 1, xp: 100 }, { actor: 2, xp: 400 }]));
    expect(two?.members.map((m) => [m.actor, m.share, m.gained])).toEqual([
      [1, 0.75, 75],
      [2, 1, 400],
    ]);
    const four = gainOf(run([{ actor: 1, xp: 100 }, { actor: 2, xp: 400 }, { actor: 3, xp: 200 }, { actor: 4, xp: 300 }]));
    expect(four?.members.map((m) => m.share)).toEqual([0.25, 1, 0.5, 0.75]);
    expect(four?.xp).toBe(25 + 400 + 100 + 225);
  });

  it('keeps a fifth member at 25%', () => {
    const g = gainOf(run([1, 2, 3, 4, 5].map((actor) => ({ actor, xp: 1000 - actor }))));
    expect(g?.members.map((m) => m.share)).toEqual([1, 0.75, 0.5, 0.25, 0.25]);
  });

  it('gives a companion 50%, outside the ordering', () => {
    const g = gainOf(run([{ actor: 1, xp: 200 }, { actor: 9, xp: 1000, companion: true }, { actor: 2, xp: 100 }]));
    const by = Object.fromEntries((g?.members ?? []).map((m) => [m.actor, m.share]));
    expect(by).toEqual({ 1: 1, 2: 0.75, 9: MASTERY_COMPANION_SHARE });
  });

  it('keeps each class to its own ordering', () => {
    const gains = masteryGain(newProfile(), run([{ actor: 1, xp: 100 }, { actor: 2, xp: 100, classId: 'class.other' }]));
    expect(gains.map((g) => [g.classId, g.members[0]?.share])).toEqual([
      ['class.vanguard', 1],
      ['class.other', 1],
    ]);
  });

  it('pays a run-end bonus that grows with depth and objectives, once per class', () => {
    const shallow = gainOf(run([{ actor: 1, xp: 0 }, { actor: 2, xp: 0 }], { deepest: 2 }));
    const deep = gainOf(run([{ actor: 1, xp: 0 }, { actor: 2, xp: 0 }], { deepest: 6, contracts: 2 }));
    expect(shallow?.xp).toBe(2 * MASTERY_BONUS_PER_DEPTH);
    expect(deep?.xp).toBe(6 * MASTERY_BONUS_PER_DEPTH + 2 * MASTERY_BONUS_PER_OBJECTIVE);
    expect(deep?.bonus).toMatchObject({ depth: 6, objectives: 2 });
    // Two classes each get the whole bonus.
    const both = masteryGain(newProfile(), run([{ actor: 1, xp: 0 }, { actor: 2, xp: 0, classId: 'class.other' }], { deepest: 3 }));
    expect(both.map((g) => g.xp)).toEqual([3 * MASTERY_BONUS_PER_DEPTH, 3 * MASTERY_BONUS_PER_DEPTH]);
  });

  it('counts only contract and bounty objectives, and only complete ones', () => {
    const result = withExtras(run([{ actor: 1, xp: 0 }]), 'quests.objectives', [
      { key: 'a', owner: { kind: 'contract', id: 'contract.a' }, status: 'complete' },
      { key: 'b', owner: { kind: 'bounty', id: 'bounty.b' }, status: 'complete' },
      { key: 'c', owner: { kind: 'contract', id: 'contract.c' }, status: 'active' },
      { key: 'd', owner: { kind: 'conduct', id: 'conduct.d' }, status: 'complete' },
    ]);
    expect(gainOf(result)?.bonus.objectives).toBe(2);
  });

  it('survives missing or odd extras', () => {
    expect(masteryGain(newProfile(), emptyRunResult('wipe'))).toEqual([]);
    const result = withExtras(withExtras(run([{ actor: 1, xp: 50 }]), 'track.xp', 'nope'), 'quests.objectives', 7);
    expect(gainOf(result)?.xp).toBe(0);
  });
});

describe('banking Mastery', () => {
  it('adds each class gain and a run, in the profile', () => {
    const result = run([{ actor: 1, xp: 300 }], { deepest: 4, contracts: 1 });
    const profile = applyRunResult(newProfile(), result);
    const expected = 300 + 4 * MASTERY_BONUS_PER_DEPTH + MASTERY_BONUS_PER_OBJECTIVE;
    expect(classMastery(profile.mastery, 'class.vanguard')).toEqual({ xp: expected, runs: 1 });
    expect(masteryOf(profile, 'class.vanguard')).toMatchObject({ xp: expected, runs: 1, level: masteryLevel(expected), points: masteryLevel(expected) });
    expect(checkProfile(profile)).toEqual([]);
    const again = applyRunResult(profile, result);
    expect(classMastery(again.mastery, 'class.vanguard')).toEqual({ xp: expected * 2, runs: 2 });
  });

  it('banks a wipe in full: Mastery is not currency', () => {
    const won = applyRunResult(newProfile(), run([{ actor: 1, xp: 300 }], { outcome: 'victory', deepest: 3 }));
    const wiped = applyRunResult(newProfile(), run([{ actor: 1, xp: 300 }], { outcome: 'wipe', deepest: 3 }));
    expect(wiped.mastery).toEqual(won.mastery);
    expect(classMastery(wiped.mastery, 'class.vanguard').xp).toBe(300 + 3 * MASTERY_BONUS_PER_DEPTH);
  });

  it('reports levels before and after, from the profile before or after banking', () => {
    const start = applyRunResult(newProfile(), run([{ actor: 1, xp: masteryXpForLevel(3) }]));
    const result = run([{ actor: 1, xp: 2000 }], { deepest: 5 });
    const before = masteryGain(start, result)[0];
    const banked = masteryGainBanked(applyRunResult(start, result), result)[0];
    expect(before).toEqual(banked);
    expect(before?.levelBefore).toBe(masteryLevel(start.mastery.classes['class.vanguard']?.xp ?? 0));
    expect(before?.levelAfter).toBeGreaterThan(before?.levelBefore ?? 99);
  });

  it('does not change a run when it has no party', () => {
    const profile = applyRunResult(newProfile(), emptyRunResult('retreat'));
    expect(profile.mastery).toEqual({ classes: {} });
  });
});

describe('the mastery slice in saves', () => {
  it('rejects bad values', () => {
    const bad = { ...newProfile(), mastery: { classes: { 'class.vanguard': { xp: -1, runs: 0.5 } } } } as unknown as Profile;
    expect(checkProfile(bad).length).toBeGreaterThan(0);
  });

  it('keeps unknown class ids', () => {
    const profile: Profile = { ...newProfile(), mastery: { classes: { 'class.lost': { xp: 10, runs: 1 } } } };
    expect(checkProfile(profile)).toEqual([]);
  });

  it('loads an old save with no mastery slice as empty', () => {
    const loaded = decodeSave(JSON.stringify({ format: SAVE_FORMAT, version: 1, savedAt: 1, slices: {} }));
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.profile.mastery).toEqual({ classes: {} });
  });

  it('round-trips through a save', () => {
    const profile = applyRunResult(newProfile(), run([{ actor: 1, xp: 700 }], { deepest: 3 }));
    expect(decodeSave(encodeSave(profile, 5))).toEqual({ ok: true, profile, savedAt: 5, notes: [] });
  });
});
