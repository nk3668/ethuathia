// @vitest-environment jsdom
/**
 * Run end in the UI (ETH-062): the host reports the end, the profile banks the result, the run
 * summary shows and waits for the player; auto-restart (Options and the summary, saved in the
 * profile's settings) starts the next run after a countdown.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyRunResult, newProfile, runRecord } from '../../src/meta';
import { GOLD_PER_TROPHY } from '../../src/content';
import { createRun, depthRenown, emptyRunResult, favorKey, InlineHost, renownForFloor, turnsRenown } from '../../src/sim';
import type { RunConfig, RunReport } from '../../src/sim';
import { App } from '../../src/ui/App';
import { REMATCH_TOOLTIP, RunOverBanner, RunSummary } from '../../src/ui/shell/RunSummary';
import { OptionsPanel } from '../../src/ui/shell/OptionsPanel';
import {
  currencyName,
  currencyRows,
  epitaph,
  GOLD_CONVERSION_TOOLTIP,
  goldConversionOf,
  lossNote,
  NO_CAUSE,
  RENOWN_FORMULA_TEXT,
  renownBreakdown,
  reportFromRecord,
  unlockLines,
} from '../../src/ui/shell/runSummaryText';
import { describe as describe_ } from '../../src/ui/shell/text';
import { StatsPanel } from '../../src/ui/stats/StatsPanel';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { AUTO_RESTART_MS, setRunStarter, useRunStore, watchAutoRestart } from '../../src/ui/stores/runStore';
import type { RestartTimers, StartRunOptions } from '../../src/ui/stores/runStore';
import { useSimStore } from '../../src/ui/stores/simStore';

HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

const WIPE: RunReport = {
  result: {
    ...emptyRunResult('wipe'),
    atRisk: { renown: 120, trophies: 4, [favorKey('deity.dawn')]: 2 },
    lost: { renown: 30 },
    turns: 812,
    deepestDepth: 3,
    extras: {
      'track.deaths': { fallen: [{ actor: 1, name: 'Mira', depth: 3, turn: 800 }] },
      'track.codex': { 'class.vanguard': ['seen'], 'feature.door': ['used'] },
    },
  },
  end: { outcome: 'wipe', turn: 812, cause: 'Mira fell on floor 3.', depth: 3 },
};

function resetRunStore(): void {
  useRunStore.getState().runStarted();
  useRunStore.getState().showPastRun(null);
}

beforeEach(() => {
  resetProfileStore();
  resetRunStore();
  useSimStore.getState().reset();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetProfileStore();
  resetRunStore();
});

describe('run summary text', () => {
  it('breaks the currencies down into earned, lost and banked, naming Favor by deity', () => {
    expect(currencyRows(WIPE)).toEqual([
      { key: 'renown', atRisk: 120, lost: 30, banked: 90 },
      { key: 'trophies', atRisk: 4, lost: 0, banked: 4 },
      { key: 'favor:deity.dawn', atRisk: 2, lost: 0, banked: 2 },
    ]);
    expect(currencyName('renown')).toBe('Renown');
    expect(currencyName('favor:deity.unknown')).toBe('Favor (deity.unknown)');
    expect(epitaph(WIPE)).toBe('Here lies Mira, who went no further than floor 3.');
    expect(lossNote('retreat')).toBe('Everything earned this run is banked: only a wipe loses 25% of a run’s earnings.');
  });

  it('logs the wipe loss with each currency named (ETH-023)', () => {
    const lost = { type: 'earningsLost', lost: { renown: 30, trophies: 1 }, atRisk: { renown: 120, trophies: 4 }, share: 0.25, depth: 3, turn: 812 } as const;
    expect(describe_(lost, () => '?').text).toBe('The wipe costs 25% of this run’s earnings: 30 Renown and 1 Trophies lost. The rest is banked.');
  });

  it('breaks earned Renown down by floor, turns, completed contracts and other bonuses (ETH-085)', () => {
    expect(renownBreakdown(WIPE)).toEqual({
      floors: [
        { depth: 2, renown: renownForFloor(2) },
        { depth: 3, renown: renownForFloor(3) },
      ],
      depth: depthRenown(3),
      turns: turnsRenown(812),
      turnCount: 812,
      contracts: 0,
      other: 120 - (depthRenown(3) + turnsRenown(812)),
    });

    const withContract: RunReport = {
      result: {
        ...emptyRunResult('victory'),
        atRisk: { renown: depthRenown(4) + turnsRenown(500) + 100 },
        turns: 500,
        deepestDepth: 4,
        extras: {
          'track.contracts': [
            { contract: 'contract.recover_relic', complete: true, reward: { renown: 100 } },
            { contract: 'contract.other', complete: false, reward: { renown: 50 } },
          ],
        },
      },
      end: { outcome: 'victory', turn: 500, cause: 'Won.', depth: 4 },
    };
    expect(renownBreakdown(withContract)).toEqual({
      floors: [
        { depth: 2, renown: renownForFloor(2) },
        { depth: 3, renown: renownForFloor(3) },
        { depth: 4, renown: renownForFloor(4) },
      ],
      depth: depthRenown(4),
      turns: 10,
      turnCount: 500,
      contracts: 100,
      other: 0,
    });

    // A pre-ETH-085 past run whose earned Renown is below the new formula returns null rather than contradicting Earned.
    const legacyPast: RunReport = {
      result: {
        ...emptyRunResult('victory'),
        atRisk: { renown: 250 },
        turns: 3000,
        deepestDepth: 10,
      },
      end: { outcome: 'victory', turn: 3000, cause: 'Won.', depth: 10 },
    };
    expect(renownBreakdown(legacyPast)).toBeNull();
  });

  it('adds converted currencies into earned/banked rows and reads extras[run.gold] (ETH-083)', () => {
    const victoryWithGold: RunReport = {
      result: {
        ...emptyRunResult('victory'),
        atRisk: { renown: 50, trophies: 6 },
        converted: { trophies: 3 },
        turns: 200,
        deepestDepth: 2,
        extras: { 'run.gold': { gold: 35, trophies: 3, rate: GOLD_PER_TROPHY } },
      },
      end: { outcome: 'victory', turn: 200, cause: 'Won.', depth: 2 },
    };
    expect(currencyRows(victoryWithGold)).toEqual([
      { key: 'renown', atRisk: 50, lost: 0, banked: 50 },
      { key: 'trophies', atRisk: 9, lost: 0, banked: 9 },
    ]);
    expect(goldConversionOf(victoryWithGold)).toEqual({ gold: 35, trophies: 3, rate: GOLD_PER_TROPHY });
    expect(goldConversionOf(WIPE)).toBeNull();
  });
});

describe('RunSummary', () => {
  it('shows the outcome, cause, currencies, Codex discoveries and an epitaph, and waits for the player', async () => {
    const user = userEvent.setup();
    let started = 0;
    const off = setRunStarter(() => started++);
    render(<RunSummary />);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => useRunStore.getState().runEnded(WIPE));
    const dialog = screen.getByRole('dialog', { name: /Wipe/ });
    expect(dialog.textContent).toContain('Mira fell on floor 3.');
    expect(dialog.textContent).toContain('Floor 3 reached · 812 turns');
    const rows = within(dialog).getAllByRole('row').map((r) => r.textContent);
    expect(rows).toContain('Renown120−3090');
    expect(within(dialog).getByRole('columnheader', { name: 'Lost in the wipe' })).toBeTruthy();
    expect(dialog.textContent).toContain('The wipe took 25% of each currency earned this run');
    expect(within(dialog).getByRole('region', { name: 'Codex discoveries' }).textContent).toContain('Vanguard');
    expect(dialog.textContent).toContain('Here lies Mira');
    // Waiting is the default: no countdown.
    expect(within(dialog).queryByRole('status')).toBeNull();
    // Per-floor Renown breakdown and formula tooltip (ETH-085).
    const floorItems = within(dialog)
      .getByRole('list', { name: 'Renown per floor' })
      .querySelectorAll('li');
    expect([...floorItems].map((li) => li.textContent)).toEqual([
      `Floor 2+${renownForFloor(2)}`,
      `Floor 3+${renownForFloor(3)}`,
    ]);
    expect(dialog.textContent).toContain(`Depth: +${depthRenown(3)}`);
    expect(dialog.textContent).toContain(`Turns (812): +${turnsRenown(812)}`);
    // Continue (to the Prepare screen) is the default way on.
    expect(document.activeElement?.textContent).toBe('Continue');

    // Focusing the Renown label opens the tooltip explaining the formula; the breakdown heading is not a duplicate tab stop.
    const renownTrigger = within(dialog).getByText('Renown');
    expect(within(dialog).getByText('Renown breakdown').getAttribute('tabindex')).toBeNull();
    act(() => renownTrigger.focus());
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain(RENOWN_FORMULA_TEXT);
    expect(tooltip.textContent).toContain(`Floor 10: ${renownForFloor(10)}`);

    await user.click(within(dialog).getByRole('button', { name: 'Start next run' }));
    expect(started).toBe(1);
    off();
  });

  it('offers Rematch with an explanatory tooltip on the summary and run-over banner (ETH-084)', async () => {
    const user = userEvent.setup();
    const calls: (StartRunOptions | undefined)[] = [];
    const off = setRunStarter((options) => calls.push(options));
    render(
      <>
        <RunOverBanner />
        <RunSummary />
      </>,
    );

    act(() => useRunStore.getState().runEnded(WIPE));
    const dialog = screen.getByRole('dialog', { name: /Wipe/ });
    const buttons = within(dialog).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Review log', 'Rematch', 'Start next run', 'Continue']);

    const rematchBtn = within(dialog).getByRole('button', { name: 'Rematch' });
    act(() => rematchBtn.focus());
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe(REMATCH_TOOLTIP);
    expect(tip.textContent).toContain('layout repeats');
    expect(tip.textContent).toContain('outcomes may differ');

    // Pressing Escape while the tooltip is open dismisses only the tooltip, keeping the dialog open.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('dialog', { name: /Wipe/ })).toBeTruthy();

    await user.click(rematchBtn);
    await user.click(within(dialog).getByRole('button', { name: 'Start next run' }));
    expect(calls).toEqual([{ sameSeed: true }, undefined]);

    // Closing the summary leaves RunOverBanner with Rematch as well.
    await user.click(within(dialog).getByRole('button', { name: 'Review log' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const bannerRematch = screen.getByRole('button', { name: 'Rematch' });
    await user.click(bannerRematch);
    expect(calls).toEqual([{ sameSeed: true }, undefined, { sameSeed: true }]);
    off();
  });

  it('lists each fallen adventurer with their killer (ETH-075)', () => {
    render(<RunSummary />);
    const report: RunReport = {
      ...WIPE,
      result: {
        ...WIPE.result,
        extras: {
          'run.party': [
            { actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
            { actor: 2, name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
          ],
          'track.deaths': {
            fallen: [
              { actor: 2, name: 'Oren', depth: 2, turn: 700, killer: null, how: 'died poisoned by a mire toad' },
              { actor: 1, name: 'Mira', depth: 3, turn: 800, killer: null, how: 'was slain by a slate hound' },
            ],
          },
        },
      },
    };
    act(() => useRunStore.getState().runEnded(report));
    const items = within(screen.getByRole('region', { name: 'The party' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual(['Mira ✝ was slain by a slate hound on floor 3', 'Oren ✝ died poisoned by a mire toad on floor 2']);
  });

  it('mirrors the auto-restart toggle in Options, saved in the profile settings', async () => {
    const user = userEvent.setup();
    render(
      <>
        <OptionsPanel />
        <RunSummary />
      </>,
    );
    act(() => useRunStore.getState().runEnded(WIPE));
    const toggles = screen.getAllByRole('checkbox', { name: /Auto-restart/ });
    expect(toggles).toHaveLength(2);
    expect(newProfile().settings.autoRestart).toBe(false);
    await user.click(toggles[1] as HTMLElement);
    expect(useProfileStore.getState().profile.settings.autoRestart).toBe(true);
    expect((toggles[0] as HTMLInputElement).checked).toBe(true);
    expect(useProfileStore.getState().dirty).toBe(true);
  });

  it('shows Gold converted on victory/retreat and Gold lost on wipe with conversion-rate tooltips (ETH-083)', async () => {
    render(<RunSummary />);
    const victoryReport: RunReport = {
      result: {
        ...emptyRunResult('victory'),
        atRisk: { renown: 40, trophies: 6 },
        converted: { trophies: 3 },
        turns: 200,
        deepestDepth: 2,
        extras: { 'run.gold': { gold: 35, trophies: 3, rate: GOLD_PER_TROPHY } },
      },
      end: { outcome: 'victory', turn: 200, cause: 'Contract complete.', depth: 2 },
    };
    act(() => useRunStore.getState().runEnded(victoryReport));
    let dialog = screen.getByRole('dialog', { name: /Victory/ });
    expect(dialog.textContent).toContain('Gold converted: 35 gold → +3 Trophies');
    const rows = within(dialog).getAllByRole('row').map((r) => r.textContent);
    expect(rows).toContain('Trophies9–9');

    // Focusing Gold converted and Trophies reveals the conversion rate tooltip.
    act(() => within(dialog).getByText('Gold converted').focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe(GOLD_CONVERSION_TOOLTIP(GOLD_PER_TROPHY));

    act(() => within(dialog).getByText('Trophies').focus());
    const trophyTip = (await screen.findByRole('tooltip')).textContent ?? '';
    expect(trophyTip).toContain(`${GOLD_PER_TROPHY} gold = 1 Trophy`);
    expect(trophyTip).toContain('35 gold → +3 Trophies');

    // Retreat with singular Trophy.
    const retreatReport: RunReport = {
      result: {
        ...emptyRunResult('retreat'),
        atRisk: { renown: 20 },
        converted: { trophies: 1 },
        turns: 120,
        deepestDepth: 2,
        extras: { 'run.gold': { gold: 15, trophies: 1, rate: GOLD_PER_TROPHY } },
      },
      end: { outcome: 'retreat', turn: 120, cause: 'Retreated.', depth: 2 },
    };
    act(() => useRunStore.getState().runEnded(retreatReport));
    dialog = screen.getByRole('dialog', { name: /Retreat/ });
    expect(dialog.textContent).toContain('Gold converted: 15 gold → +1 Trophy');

    // Wipe loses all gold and shows Gold lost.
    const wipeWithGold: RunReport = {
      ...WIPE,
      result: {
        ...WIPE.result,
        extras: { ...WIPE.result.extras, 'run.gold': { gold: 28, trophies: 0, rate: GOLD_PER_TROPHY } },
      },
    };
    act(() => useRunStore.getState().runEnded(wipeWithGold));
    dialog = screen.getByRole('dialog', { name: /Wipe/ });
    expect(dialog.textContent).toContain('Gold lost: 28 gold');
    act(() => within(dialog).getByText('Gold lost').focus());
    expect((await screen.findByRole('tooltip')).textContent).toBe(GOLD_CONVERSION_TOOLTIP(GOLD_PER_TROPHY));
  });
});

describe('run history (ETH-048)', () => {
  const PARTY_WIPE: RunReport = {
    ...WIPE,
    result: {
      ...WIPE.result,
      extras: {
        ...WIPE.result.extras,
        'run.end': WIPE.end,
        'run.party': [
          { actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
          { actor: 2, name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
        ],
      },
    },
  };

  it('rebuilds a run report from its record', () => {
    const record = runRecord(4, PARTY_WIPE.result);
    const report = reportFromRecord(record);
    expect(report.end).toEqual(WIPE.end);
    expect(currencyRows(report)).toEqual(currencyRows(WIPE));
    expect(epitaph(report)).toBe(epitaph(WIPE));
    expect(reportFromRecord({ ...record, cause: '' }).end.cause).toBe(NO_CAUSE);

    // Preserves leftover gold conversion and splits converted trophies from atRisk (ETH-083).
    const victoryReport: RunReport = {
      result: {
        ...emptyRunResult('victory'),
        atRisk: { renown: 80, trophies: 4 },
        converted: { trophies: 3 },
        turns: 250,
        deepestDepth: 3,
        extras: {
          'run.end': { outcome: 'victory', turn: 250, cause: 'Won.', depth: 3 },
          'run.party': [{ actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }],
          'run.gold': { gold: 35, trophies: 3, rate: GOLD_PER_TROPHY },
        },
      },
      end: { outcome: 'victory', turn: 250, cause: 'Won.', depth: 3 },
    };
    const rebuiltVictory = reportFromRecord(runRecord(5, victoryReport.result));
    expect(rebuiltVictory.result.atRisk).toEqual({ renown: 80, trophies: 4 });
    expect(rebuiltVictory.result.converted).toEqual({ trophies: 3 });
    expect(goldConversionOf(rebuiltVictory)).toEqual({ gold: 35, trophies: 3, rate: GOLD_PER_TROPHY });
    expect(currencyRows(rebuiltVictory)).toEqual(currencyRows(victoryReport));
  });

  it('reopens past runs from StatsPanel with identical gold conversion lines (ETH-083)', async () => {
    const user = userEvent.setup();
    act(() => {
      useProfileStore.getState().applyRunResult({
        ...emptyRunResult('victory'),
        atRisk: { renown: 80, trophies: 4 },
        converted: { trophies: 3 },
        turns: 250,
        deepestDepth: 3,
        extras: {
          'run.end': { outcome: 'victory', turn: 250, cause: 'Won.', depth: 3 },
          'run.party': [{ actor: 1, name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }],
          'run.gold': { gold: 35, trophies: 3, rate: GOLD_PER_TROPHY },
        },
      });
    });
    render(
      <>
        <StatsPanel />
        <RunSummary />
      </>,
    );
    await user.click(screen.getByRole('button', { name: /Run 1 · Victory/ }));
    const dialog = screen.getByRole('dialog', { name: 'Run 1 · Victory' });
    expect(dialog.textContent).toContain('Gold converted: 35 gold → +3 Trophies');
    expect(within(dialog).getAllByRole('row').map((r) => r.textContent)).toContain('Trophies7–7');
  });

  it('lists past runs newest first in the Stats tab, and each reopens its summary', async () => {
    const user = userEvent.setup();
    act(() => {
      useProfileStore.getState().applyRunResult(PARTY_WIPE.result);
      useProfileStore.getState().applyRunResult({ ...emptyRunResult('retreat'), turns: 90, deepestDepth: 2 });
    });
    render(
      <>
        <StatsPanel />
        <RunSummary />
      </>,
    );
    const runs = within(screen.getByRole('list', { name: /Past runs/ })).getAllByRole('button');
    expect(runs.map((b) => b.textContent)).toEqual([
      expect.stringContaining('Run 2 · Retreat'),
      expect.stringContaining('Run 1 · Wipe'),
    ]);
    expect(runs[1]?.textContent).toContain('Mira ✝, Oren');

    await user.click(runs[1] as HTMLElement);
    const dialog = screen.getByRole('dialog', { name: 'Run 1 · Wipe' });
    expect(dialog.textContent).toContain('Mira fell on floor 3.');
    expect(within(dialog).getByRole('region', { name: 'The party' }).textContent).toContain('Oren survived');
    // Past runs reopened from Run History show the same per-floor Renown breakdown (ETH-085).
    const pastFloors = within(dialog)
      .getByRole('list', { name: 'Renown per floor' })
      .querySelectorAll('li');
    expect([...pastFloors].map((li) => li.textContent)).toEqual([
      `Floor 2+${renownForFloor(2)}`,
      `Floor 3+${renownForFloor(3)}`,
    ]);
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Rematch' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Start next run' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(runs[1]);

    // A pre-ETH-085 past run whose earned Renown is below the new formula omits the per-floor breakdown.
    await user.click(runs[0] as HTMLElement);
    const legacyDialog = screen.getByRole('dialog', { name: 'Run 2 · Retreat' });
    expect(within(legacyDialog).queryByRole('list', { name: 'Renown per floor' })).toBeNull();
  });

  it("shows a past run's own unlocks, not the latest run's", () => {
    let profile = applyRunResult(newProfile(), PARTY_WIPE.result);
    profile = applyRunResult(profile, { ...emptyRunResult('retreat'), turns: 10, deepestDepth: 1 });
    expect(unlockLines(profile, 1).map((l) => l.id)).toContain('building.smithy');
    expect(unlockLines(profile)).toEqual([]);
  });

  it('says so when no run has finished', () => {
    render(<StatsPanel />);
    expect(screen.getByText(/No runs finished yet/)).toBeTruthy();
  });
});

describe('watchAutoRestart', () => {
  function fakeTimers() {
    const pending = new Map<number, () => void>();
    let next = 1;
    const timers: RestartTimers = {
      now: () => 1000,
      setTimeout: (fn) => {
        pending.set(next, fn);
        return next++;
      },
      clearTimeout: (handle) => void pending.delete(handle as number),
    };
    const fire = () => {
      const fns = [...pending.values()];
      pending.clear();
      for (const fn of fns) fn();
    };
    return { timers, pending, fire };
  }

  it('starts the next run after the countdown while the setting is on, unless cancelled or switched off', () => {
    const { timers, pending, fire } = fakeTimers();
    const starts: (StartRunOptions | undefined)[] = [];
    const off = setRunStarter((options) => {
      starts.push(options);
      useRunStore.getState().runStarted();
    });
    const unwatch = watchAutoRestart(timers);

    // Off by default: the summary waits.
    useRunStore.getState().runEnded(WIPE);
    expect(pending.size).toBe(0);
    expect(useRunStore.getState().restartAt).toBeNull();

    // Turning it on starts the countdown at once; auto-restart rolls a fresh seed (not rematch).
    useProfileStore.getState().updateSettings({ autoRestart: true });
    expect(pending.size).toBe(1);
    expect(useRunStore.getState().restartAt).toBe(1000 + AUTO_RESTART_MS);
    fire();
    expect(starts).toEqual([undefined]);
    expect(useRunStore.getState().report).toBeNull();

    // Cancelling stops this run's countdown only.
    useRunStore.getState().runEnded(WIPE);
    expect(pending.size).toBe(1);
    useRunStore.getState().cancelRestart();
    expect(pending.size).toBe(0);
    expect(useRunStore.getState().restartAt).toBeNull();
    useRunStore.getState().runStarted();
    useRunStore.getState().runEnded(WIPE);
    expect(pending.size).toBe(1);

    // Switching it off drops the pending restart.
    useProfileStore.getState().updateSettings({ autoRestart: false });
    expect(pending.size).toBe(0);
    expect(starts).toHaveLength(1);

    unwatch();
    off();
  });
});

describe('App', () => {
  it('banks a finished run in the profile, shows the summary, and starts the next run on request', async () => {
    const user = userEvent.setup();
    let host: InlineHost | undefined;
    render(<App createHost={() => (host = new InlineHost())} seed={1} />);
    if (host === undefined) throw new Error('App did not create a host');
    const started = host;
    await user.click(screen.getByRole('button', { name: 'Descend' }));
    act(() => {
      started.run(6000);
    });
    // The baseline brings the relic up: Recover the relic is done, so walking out wins (ETH-024).
    const dialog = screen.getByRole('dialog', { name: /Victory/ });
    expect(dialog.textContent).toContain('walked out of the dungeon');
    expect(within(dialog).getByRole('region', { name: 'Contracts' }).textContent).toContain('Recover the relic');
    const { profile } = useProfileStore.getState();
    expect(profile.history.totals.runs).toBe(1);
    expect(profile.history.totals.victories).toBe(1);
    expect(profile.history.recent[0]?.contracts).toEqual([{ id: 'contract.recover_relic', complete: true, reward: { renown: 100, trophies: 0, favor: {} } }]);
    expect(profile.currencies.renown).toBeGreaterThan(0);
    // The Codex slice merged what the run met (ETH-065), the party's class among it.
    expect(profile.codex.entries['class.vanguard']).toEqual(['seen']);
    // The run history keeps who set out and why the run ended (ETH-048).
    expect(profile.history.recent[0]?.party.length).toBeGreaterThan(0);
    expect(profile.history.recent[0]?.cause).toContain('walked out of the dungeon');

    // Closing it leaves a banner over the map to bring it back.
    await user.click(within(dialog).getByRole('button', { name: 'Review log' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show summary' }));
    await user.click(screen.getByRole('button', { name: 'Start next run' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useRunStore.getState().report).toBeNull();
    expect(started.turn).toBe(0);

    // Continue goes back to the Prepare screen instead.
    act(() => {
      started.run(6000);
    });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useRunStore.getState().screen).toBe('prepare');
    expect(screen.getByRole('button', { name: 'Descend' })).toBeTruthy();
  });

  it('replays the same seed and dungeon layout on Rematch while applying upgrades bought between runs (ETH-084)', async () => {
    const user = userEvent.setup();
    const starts: { config: RunConfig; seed: number }[] = [];
    class RecordingHost extends InlineHost {
      override start(config: RunConfig, seed: number): void {
        starts.push({ config, seed });
        super.start(config, seed);
      }
    }

    const startAt = (index: number) => {
      const entry = starts[index];
      if (entry === undefined) throw new Error(`Expected start #${index}`);
      return entry;
    };

    const layoutOf = (config: RunConfig, seed: number) => {
      const state = createRun(config, seed);
      const floor = state.floors[state.dungeon.entry];
      if (floor === undefined) throw new Error('Missing entry floor');
      const features = floor.entities.flatMap((id) => {
        const entity = state.entities[id];
        return entity?.feature === undefined ? [] : [{ def: entity.def, pos: entity.pos, feature: entity.feature }];
      });
      return { terrain: floor.terrain, features };
    };

    let host: RecordingHost | undefined;
    render(<App createHost={() => (host = new RecordingHost())} seed={1} />);
    if (host === undefined) throw new Error('App did not create a host');
    const started = host;

    // First run starts with seed 1 and one adventurer.
    await user.click(screen.getByRole('button', { name: 'Descend' }));
    expect(starts).toHaveLength(1);
    const first = startAt(0);
    expect(first.seed).toBe(1);
    expect(first.config.party).toHaveLength(1);
    const firstHp = useSimStore.getState().snapshot?.party[0]?.maxHp ?? 0;
    const firstLayout = layoutOf(first.config, first.seed);

    act(() => {
      started.run(6000);
    });
    expect(screen.getByRole('dialog', { name: /Victory/ })).toBeTruthy();

    // Buy upgrades between runs (second party slot + Hardy Recruits +2 HP).
    act(() => {
      // Ensure enough Renown for both tier-1 and tier-2 Guild Hall upgrades.
      useProfileStore.getState().applyRunResult({ ...emptyRunResult('retreat'), atRisk: { renown: 200 } });
      expect(useProfileStore.getState().purchase('upgrade.second_berth')).toBe(true);
      expect(useProfileStore.getState().purchase('upgrade.hardy_recruits')).toBe(true);
    });

    // Rematch replays seed 1 with the exact same dungeon layout, while applying the new upgrades.
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Rematch' }));
    expect(starts).toHaveLength(2);
    const second = startAt(1);
    expect(second.seed).toBe(1);
    expect(useSimStore.getState().snapshot?.seed).toBe(1);
    expect(layoutOf(second.config, second.seed)).toEqual(firstLayout);
    expect(second.config.party).toHaveLength(2);
    expect(second.config.partyBundles).toContain('upgrade.hardy_recruits');
    expect(useSimStore.getState().snapshot?.party[0]?.maxHp).toBe(firstHp + 2);

    // Rematch from the closed-summary banner keeps replaying seed 1.
    act(() => {
      started.run(6000);
    });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Review log' }));
    await user.click(screen.getByRole('button', { name: 'Rematch' }));
    expect(starts).toHaveLength(3);
    const third = startAt(2);
    expect(third.seed).toBe(1);
    expect(layoutOf(third.config, third.seed)).toEqual(firstLayout);

    // Start next run rolls a fresh seed (2) and builds a different dungeon layout.
    act(() => {
      started.run(6000);
    });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Start next run' }));
    expect(starts).toHaveLength(4);
    const fourth = startAt(3);
    expect(fourth.seed).toBe(2);
    expect(layoutOf(fourth.config, fourth.seed).terrain).not.toEqual(firstLayout.terrain);
  });
});
