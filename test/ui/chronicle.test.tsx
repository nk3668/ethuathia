// @vitest-environment jsdom
/**
 * The run chronicle in the UI (ETH-120): every log highlight has a chronicle rule and every
 * chronicle kind has wording (so the two never drift), the Highlights feed reads the chronicle,
 * the run summary lists "Moments", and the run history keeps the top few per run.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { checkProfile, decodeSave, encodeSave, newProfile, recordMoments, RUN_RECORD_MOMENTS, runRecord } from '../../src/meta';
import { CHRONICLE_KINDS, CHRONICLE_RULES, CHRONICLE_TRACKER, emptyRunResult } from '../../src/sim';
import type { ChronicleEntry, RunReport, SimEvent } from '../../src/sim';
import { RunSummary } from '../../src/ui/shell/RunSummary';
import { momentsOf, reportFromRecord } from '../../src/ui/shell/runSummaryText';
import { HIGHLIGHT_KINDS, LOG_TEXT, MOMENT_TEXT, momentLine } from '../../src/ui/shell/text';
import { useRunStore } from '../../src/ui/stores/runStore';
import { useSimStore } from '../../src/ui/stores/simStore';

const moment = (kind: string, turn: number, extra: Partial<ChronicleEntry> = {}): ChronicleEntry => ({
  kind,
  turn,
  floor: 'd2',
  pos: { x: 3, y: 4 },
  depth: 2,
  actors: [1],
  ids: [],
  ...extra,
});
const names = (id: number) => (id === 1 ? 'Mira' : id === 2 ? 'Oren' : `#${id}`);

afterEach(() => {
  cleanup();
  useSimStore.getState().reset();
  useRunStore.setState({ report: null, summaryOpen: false, pastRun: null });
});

describe('chronicle and highlights stay in step', () => {
  it('gives every highlighted log-text event type a chronicle rule', () => {
    const missing = Object.entries(LOG_TEXT)
      .filter(([, entry]) => (entry as { highlight?: unknown }).highlight !== undefined)
      .map(([type]) => type)
      .filter((type) => !CHRONICLE_RULES.has(type));
    expect(missing).toEqual([]);
  });

  it('makes every highlight kind a chronicle kind', () => {
    expect(HIGHLIGHT_KINDS.map((k) => k.id).filter((id) => !CHRONICLE_KINDS.has(id))).toEqual([]);
  });

  it('words every chronicle kind, under its own id', () => {
    expect([...CHRONICLE_KINDS.keys()].filter((id) => MOMENT_TEXT[id] === undefined)).toEqual([]);
    for (const [id, text] of Object.entries(MOMENT_TEXT)) {
      expect(CHRONICLE_KINDS.has(id), id).toBe(true);
      expect(text.kind.id).toBe(id);
    }
  });
});

describe('moment wording', () => {
  it('words each kind from the entry alone', () => {
    const say = (m: ChronicleEntry) => momentLine(m, 0, names).text;
    expect(say(moment('leveledUp', 9, { amount: 3 }))).toBe('Mira reached level 3 on floor 2.');
    expect(say(moment('adventurerFell', 9, { actors: [2], ids: ['monster.slate_hound'] }))).toMatch(/^Oren fell on floor 2, slain by a /);
    expect(say(moment('adventurerFell', 9, { actors: [2], depth: 0 }))).toBe('Oren fell.');
    expect(say(moment('earningsLost', 9, { floor: null, pos: null, amount: 25 }))).toBe('The wipe cost 25% of the run’s earnings.');
    expect(say(moment('contractComplete', 9, { ids: ['contract.recover_relic'] }))).toMatch(/^Contract complete: .+ \(Mira\) on floor 2\.$/);
    expect(say(moment('mystery', 9))).toBe('Something notable happened on floor 2.');
  });

  it('places a moment on the map, or nowhere when it has no place', () => {
    expect(momentLine(moment('stuck', 1), 0, names).highlight?.place).toEqual({ floor: 'd2', pos: { x: 3, y: 4 } });
    expect(momentLine(moment('earningsLost', 1, { floor: null, pos: null }), 0, names).highlight?.place).toBeNull();
  });
});

describe('simStore.chronicle', () => {
  it('reduces every event it receives and forgets it on reset', () => {
    const stuck: SimEvent = {
      type: 'stuck',
      turn: 5,
      actor: 1,
      rule: { set: 'baseline', index: 1 },
      action: 'act.explore',
      turns: 12,
      detail: 'No progress.',
      floor: 'd1',
      pos: { x: 1, y: 1 },
    };
    act(() => useSimStore.getState().receiveEvents([stuck, { type: 'waited', turn: 6, actor: 1 }]));
    expect(useSimStore.getState().chronicle.entries.map((e) => e.kind)).toEqual(['stuck']);
    useSimStore.getState().reset();
    expect(useSimStore.getState().chronicle).toEqual(CHRONICLE_TRACKER.init());
  });
});

const ENTRIES: ChronicleEntry[] = [
  moment('stuck', 10),
  moment('leveledUp', 20, { amount: 2 }),
  moment('nearDeath', 30, { amount: 2, actors: [2, 77], ids: ['monster.slate_hound'] }),
  moment('valuableFind', 40, { ids: ['item.x'], amount: 60 }),
  moment('leveledUp', 50, { actors: [2], amount: 2 }),
  moment('adventurerFell', 60, { actors: [2, 77], ids: ['monster.slate_hound'] }),
  moment('earningsLost', 61, { floor: null, pos: null, actors: [], amount: 25 }),
];

const REPORT: RunReport = {
  result: {
    ...emptyRunResult('wipe'),
    turns: 61,
    deepestDepth: 2,
    extras: {
      'run.party': [
        { actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
        { actor: 2, name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
      ],
      [CHRONICLE_TRACKER.id]: ENTRIES,
    },
  },
  end: { outcome: 'wipe', turn: 61, cause: 'Oren fell on floor 2.', depth: 2 },
};

describe('Moments in the run summary and the history', () => {
  it('lists the most notable moments in the summary, in turn order', () => {
    expect(momentsOf(REPORT).map((m) => m.turn)).toEqual([20, 40, 50, 60, 61]);
    useRunStore.setState({ report: REPORT, summaryOpen: true, pastRun: null });
    render(<RunSummary />);
    const section = screen.getByRole('region', { name: 'Moments' });
    const items = within(section).getAllByRole('listitem');
    expect(items).toHaveLength(RUN_RECORD_MOMENTS);
    expect(items[0]?.textContent).toBe('Turn 20 Mira reached level 2 on floor 2.');
    expect(items[3]?.textContent).toMatch(/^Turn 60 Oren fell on floor 2, slain by a /);
  });

  it('keeps the top moments per run, party members renumbered by party place, and shows them again', () => {
    const record = runRecord(4, REPORT.result);
    expect(record.moments.map((m) => m.turn)).toEqual([20, 40, 50, 60, 61]);
    // Oren is party place 1; the monster (77) is left out.
    expect(record.moments[3]?.actors).toEqual([1]);
    expect(recordMoments(ENTRIES, [1, 2])[2]?.actors).toEqual([1]);
    expect(runRecord(5, emptyRunResult('retreat')).moments).toEqual([]);

    const past = reportFromRecord(record);
    expect(momentsOf(past).map((m) => m.turn)).toEqual([20, 40, 50, 60, 61]);
    useRunStore.setState({ pastRun: record });
    render(<RunSummary />);
    const items = within(screen.getByRole('region', { name: 'Moments' })).getAllByRole('listitem');
    expect(items[3]?.textContent).toMatch(/^Turn 60 Oren fell/);
  });

  it('saves the moments and migrates older histories to none', () => {
    const profile = newProfile();
    const record = runRecord(1, REPORT.result);
    const withRun = { ...profile, history: { ...profile.history, recent: [record] } };
    expect(checkProfile(withRun)).toEqual([]);
    const decoded = decodeSave(encodeSave(withRun, 1));
    if (!decoded.ok) throw new Error(decoded.error);
    expect(decoded.profile.history.recent[0]?.moments).toEqual(record.moments);
  });
});
