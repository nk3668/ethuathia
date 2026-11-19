import { describe, expect, it } from 'vitest';
import { assertPlainData } from '../../src/core';
import { applyRunResult, checkProfile, currenciesFromRewards, HISTORY_LIMIT, newProfile } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult, favorKey } from '../../src/sim';
import type { RunResult } from '../../src/sim';

const DAWN = favorKey('deity.dawn');
const TIDE = favorKey('deity.tide');

function result(overrides: Partial<RunResult>): RunResult {
  return { ...emptyRunResult('retreat'), ...overrides };
}

describe('newProfile', () => {
  it('is plain data, passes its own checks and starts with nothing banked', () => {
    const profile = newProfile();
    assertPlainData(profile);
    expect(checkProfile(profile)).toEqual([]);
    expect(profile.currencies).toEqual({ renown: 0, trophies: 0, favor: {} });
    expect(profile.history.totals.runs).toBe(0);
  });

  it('returns a fresh object each call', () => {
    expect(newProfile()).not.toBe(newProfile());
    expect(newProfile().history.recent).not.toBe(newProfile().history.recent);
  });
});

describe('currenciesFromRewards', () => {
  it('reads renown, trophies and favor per deity from flat reward keys', () => {
    expect(currenciesFromRewards({ renown: 5, trophies: 2, [DAWN]: 3, [TIDE]: 0 })).toEqual({
      renown: 5,
      trophies: 2,
      favor: { 'deity.dawn': 3 },
    });
  });
});

describe('applyRunResult', () => {
  it('banks the whole at-risk total on a victory or retreat', () => {
    for (const outcome of ['victory', 'retreat'] as const) {
      const after = applyRunResult(newProfile(), result({ outcome, atRisk: { renown: 120, trophies: 7, [DAWN]: 4 } }));
      expect(after.currencies).toEqual({ renown: 120, trophies: 7, favor: { 'deity.dawn': 4 } });
    }
  });

  it('banks at-risk minus lost on a wipe and records the loss in the history', () => {
    const after = applyRunResult(
      newProfile(),
      result({ outcome: 'wipe', atRisk: { renown: 100, trophies: 9, [DAWN]: 8 }, lost: { renown: 25, trophies: 2, [DAWN]: 2 } }),
    );
    expect(after.currencies).toEqual({ renown: 75, trophies: 7, favor: { 'deity.dawn': 6 } });
    expect(after.history.recent[0]?.lost).toEqual({ renown: 25, trophies: 2, favor: { 'deity.dawn': 2 } });
    expect(after.history.totals.wipes).toBe(1);
  });

  it('adds to what is already banked, per deity', () => {
    let profile = applyRunResult(newProfile(), result({ atRisk: { renown: 10, [DAWN]: 1 } }));
    profile = applyRunResult(profile, result({ atRisk: { renown: 5, [DAWN]: 2, [TIDE]: 3 } }));
    expect(profile.currencies).toEqual({ renown: 15, trophies: 0, favor: { 'deity.dawn': 3, 'deity.tide': 3 } });
  });

  it('is pure: the input profile is unchanged and the output is plain data', () => {
    const before = newProfile();
    const snapshot = structuredClone(before);
    const after = applyRunResult(before, result({ atRisk: { renown: 3 }, turns: 40, deepestDepth: 2 }));
    expect(before).toEqual(snapshot);
    assertPlainData(after);
    expect(checkProfile(after)).toEqual([]);
  });

  it('keeps lifetime totals and only the last HISTORY_LIMIT runs', () => {
    let profile: Profile = newProfile();
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) {
      profile = applyRunResult(profile, result({ outcome: i % 2 ? 'victory' : 'wipe', turns: 10, deepestDepth: i }));
    }
    const { totals, recent } = profile.history;
    expect(totals).toEqual({
      runs: HISTORY_LIMIT + 5,
      victories: Math.ceil((HISTORY_LIMIT + 5) / 2),
      retreats: 0,
      wipes: Math.floor((HISTORY_LIMIT + 5) / 2),
      turns: (HISTORY_LIMIT + 5) * 10,
      deepestDepth: HISTORY_LIMIT + 5,
    });
    expect(recent).toHaveLength(HISTORY_LIMIT);
    // Newest first.
    expect(recent[0]?.run).toBe(HISTORY_LIMIT + 5);
    expect(recent.at(-1)?.run).toBe(6);
  });

  it('throws on a malformed result rather than banking it', () => {
    const profile = newProfile();
    expect(() => applyRunResult(profile, result({ atRisk: { renown: 5 }, lost: { renown: 6 } }))).toThrow(/more than was at risk/);
    expect(() => applyRunResult(profile, result({ atRisk: { renown: -1 } }))).toThrow(/finite amount/);
    expect(() => applyRunResult(profile, result({ atRisk: { gold: 1 } }))).toThrow(/not a currency id/);
    expect(() => applyRunResult(profile, result({ atRisk: { renown: Number.NaN } }))).toThrow(RangeError);
    expect(() => applyRunResult(profile, result({ turns: 1.5 }))).toThrow(/turns/);
  });
});

describe('checkProfile', () => {
  it('reports the slice and path of a bad value', () => {
    const bad = { ...newProfile(), currencies: { renown: -3, trophies: 0, favor: {} } };
    expect(checkProfile(bad)).toEqual([expect.stringMatching(/^currencies\.renown: /)]);
    expect(checkProfile(null)).toEqual(['profile is not an object']);
  });
});

describe('the codex slice', () => {
  const codex = (found: unknown) => result({ extras: { 'track.codex': found } });

  it('starts empty', () => {
    expect(newProfile().codex).toEqual({ entries: {}, kills: {} });
  });

  it('merges the run discovery tracker output and per-monster kill counts from extras', () => {
    let profile = applyRunResult(
      newProfile(),
      result({
        extras: {
          'track.codex': { 'feature.door': ['used'], 'monster.gloam_rat': ['killed'] },
          'track.kills': { kills: 3, trophies: 3, byMonster: { 'monster.gloam_rat': 3 } },
        },
      }),
    );
    profile = applyRunResult(
      profile,
      result({
        extras: {
          'track.codex': { 'feature.door': ['seen'], 'class.vanguard': ['seen'] },
          'track.kills': { kills: 7, trophies: 7, byMonster: { 'monster.gloam_rat': 7 } },
        },
      }),
    );
    expect(profile.codex.entries).toEqual({
      'feature.door': ['seen', 'used'],
      'monster.gloam_rat': ['killed'],
      'class.vanguard': ['seen'],
    });
    expect(profile.codex.kills).toEqual({ 'monster.gloam_rat': 10 });
    expect(checkProfile(profile)).toEqual([]);
  });

  it('is unchanged by a run without codex output', () => {
    const profile = applyRunResult(newProfile(), codex({ 'feature.door': ['used'] }));
    expect(applyRunResult(profile, result({})).codex).toBe(profile.codex);
  });

  it('throws on malformed codex output rather than keeping it', () => {
    expect(() => applyRunResult(newProfile(), codex({ 'feature.door': ['eaten'] }))).toThrow(RangeError);
    expect(() => applyRunResult(newProfile(), codex({ 'feature.door': ['used', 'seen'] }))).toThrow(/track\.codex/);
    expect(() => applyRunResult(newProfile(), codex(['feature.door']))).toThrow(RangeError);
  });

  it('rejects a saved codex with marks out of order', () => {
    const bad = { ...newProfile(), codex: { entries: { 'feature.door': ['used', 'used'] }, kills: {} } };
    expect(checkProfile(bad)).toEqual([expect.stringMatching(/^codex\.entries\.feature\.door: /)]);
  });
});
