/** The run history (ETH-048): compact run records, newest first, capped, and the v1 → v2 migration. */
import { describe, expect, it } from 'vitest';
import {
  applyRunResult,
  checkProfile,
  decodeSave,
  encodeSave,
  HISTORY_LIMIT,
  isMilestoneOpen,
  milestoneProgress,
  newProfile,
  runRecord,
  SAVE_FORMAT,
  SAVE_VERSION,
} from '../../src/meta';
import { emptyRunResult, favorKey } from '../../src/sim';
import type { RunResult } from '../../src/sim';

const WIPE: RunResult = {
  ...emptyRunResult('wipe'),
  atRisk: { renown: 120, trophies: 4, [favorKey('deity.dawn')]: 2 },
  lost: { renown: 30 },
  turns: 812,
  deepestDepth: 3,
  extras: {
    'run.end': { outcome: 'wipe', turn: 812, cause: 'Oren fell on floor 3.', depth: 3 },
    'run.party': [
      { actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
      { actor: 2, name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
    ],
    'track.deaths': {
      fallen: [
        { actor: 1, name: 'Mira', depth: 2, turn: 500 },
        // How they died (ETH-075); Mira's record predates it.
        { actor: 2, name: 'Oren', depth: 3, turn: 812, how: 'was slain by a slate hound' },
      ],
    },
    'track.codex': { 'class.vanguard': ['seen'], 'feature.door': ['used'] },
  },
};

describe('runRecord', () => {
  it('keeps the outcome, cause, party with their fates, currencies and Codex finds', () => {
    expect(runRecord(7, WIPE)).toEqual({
      run: 7,
      outcome: 'wipe',
      turns: 812,
      deepestDepth: 3,
      banked: { renown: 90, trophies: 4, favor: { 'deity.dawn': 2 } },
      lost: { renown: 30, trophies: 0, favor: {} },
      cause: 'Oren fell on floor 3.',
      party: [
        { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human', fell: { depth: 2, turn: 500 } },
        { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human', fell: { depth: 3, turn: 812, how: 'was slain by a slate hound' } },
      ],
      met: ['class.vanguard', 'feature.door'],
      contracts: [],
    });
  });

  it('leaves out parts the extras do not carry', () => {
    const record = runRecord(1, emptyRunResult('retreat'));
    expect(record).toMatchObject({ cause: '', party: [], met: [], contracts: [] });
  });
});

describe('the history slice', () => {
  it('records each run newest first and stays valid', () => {
    let profile = applyRunResult(newProfile(), WIPE);
    profile = applyRunResult(profile, { ...emptyRunResult('retreat'), turns: 40, deepestDepth: 1 });
    expect(profile.history.recent.map((r) => r.run)).toEqual([2, 1]);
    expect(profile.history.recent[1]?.party).toHaveLength(2);
    expect(checkProfile(profile)).toEqual([]);
    expect(decodeSave(encodeSave(profile, 1))).toMatchObject({ ok: true, profile });
  });

  it('caps the list at HISTORY_LIMIT, also when a save holds more', () => {
    const profile = applyRunResult(newProfile(), WIPE);
    const record = profile.history.recent[0];
    const many = Array.from({ length: HISTORY_LIMIT + 3 }, (_, i) => ({ ...record, run: HISTORY_LIMIT + 3 - i }));
    const text = JSON.stringify({
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      savedAt: 1,
      slices: { history: { version: 2, data: { totals: { ...profile.history.totals, runs: HISTORY_LIMIT + 3 }, recent: many } } },
    });
    const decoded = decodeSave(text);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.history.recent).toHaveLength(HISTORY_LIMIT);
    expect(decoded.profile.history.recent[0]?.run).toBe(HISTORY_LIMIT + 3);
  });

  it('migrates a v1 history (oldest first, no details) to v2', () => {
    const v1Record = (run: number) => ({
      run,
      outcome: 'retreat',
      turns: 10 * run,
      deepestDepth: run,
      banked: { renown: run, trophies: 0, favor: {} },
      lost: { renown: 0, trophies: 0, favor: {} },
    });
    const text = JSON.stringify({
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      savedAt: 1,
      slices: {
        history: {
          version: 1,
          data: { totals: { runs: 2, victories: 0, retreats: 2, wipes: 0, turns: 30, deepestDepth: 2 }, recent: [v1Record(1), v1Record(2)] },
        },
      },
    });
    const decoded = decodeSave(text);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.history.recent.map((r) => r.run)).toEqual([2, 1]);
    expect(decoded.profile.history.recent[0]).toMatchObject({ cause: '', party: [], met: [], contracts: [], turns: 20 });
  });

  it('keeps the lifetime totals through the migration, so milestones (ETH-074) still unlock from them', () => {
    const totals = { runs: 4, victories: 1, retreats: 2, wipes: 1, turns: 900, deepestDepth: 3 };
    const text = JSON.stringify({
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      savedAt: 1,
      slices: { history: { version: 1, data: { totals, recent: [] } } },
    });
    const decoded = decodeSave(text);
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.history.totals).toEqual(totals);
    expect(milestoneProgress(decoded.profile)).toEqual({ runs: 4, victories: 1, deepestDepth: 3 });
    // The save predates milestones: the next run banked opens what the old totals earned.
    expect(isMilestoneOpen(decoded.profile, 'building.smithy')).toBe(false);
    const after = applyRunResult(decoded.profile, { ...emptyRunResult('retreat'), turns: 10, deepestDepth: 1 });
    expect(isMilestoneOpen(after, 'building.smithy')).toBe(true);
    expect(after.history.totals).toMatchObject({ runs: 5, deepestDepth: 3 });
  });
});
