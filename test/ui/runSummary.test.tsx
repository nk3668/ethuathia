// @vitest-environment jsdom
/**
 * Run end in the UI (ETH-062): the host reports the end, the profile banks the result, the run
 * summary shows and waits for the player; auto-restart (Options and the summary, saved in the
 * profile's settings) starts the next run after a countdown.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProfile } from '../../src/meta';
import { emptyRunResult, favorKey, InlineHost } from '../../src/sim';
import type { RunReport } from '../../src/sim';
import { App } from '../../src/ui/App';
import { RunSummary } from '../../src/ui/shell/RunSummary';
import { OptionsPanel } from '../../src/ui/shell/OptionsPanel';
import { currencyName, currencyRows, epitaph } from '../../src/ui/shell/runSummaryText';
import { resetProfileStore, useProfileStore } from '../../src/ui/stores/profileStore';
import { AUTO_RESTART_MS, setRunStarter, useRunStore, watchAutoRestart } from '../../src/ui/stores/runStore';
import type { RestartTimers } from '../../src/ui/stores/runStore';
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
    expect(within(dialog).getByRole('region', { name: 'Codex discoveries' }).textContent).toContain('Vanguard');
    expect(dialog.textContent).toContain('Here lies Mira');
    // Waiting is the default: no countdown.
    expect(within(dialog).queryByRole('status')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Start next run');

    await user.click(within(dialog).getByRole('button', { name: 'Start next run' }));
    expect(started).toBe(1);
    off();
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
    let started = 0;
    const off = setRunStarter(() => {
      started++;
      useRunStore.getState().runStarted();
    });
    const unwatch = watchAutoRestart(timers);

    // Off by default: the summary waits.
    useRunStore.getState().runEnded(WIPE);
    expect(pending.size).toBe(0);
    expect(useRunStore.getState().restartAt).toBeNull();

    // Turning it on starts the countdown at once.
    useProfileStore.getState().updateSettings({ autoRestart: true });
    expect(pending.size).toBe(1);
    expect(useRunStore.getState().restartAt).toBe(1000 + AUTO_RESTART_MS);
    fire();
    expect(started).toBe(1);
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
    expect(started).toBe(1);

    unwatch();
    off();
  });
});

describe('App', () => {
  it('banks a finished run in the profile, shows the summary, and starts the next run on request', async () => {
    const user = userEvent.setup();
    let host: InlineHost | undefined;
    render(<App createHost={() => (host = new InlineHost())} seed={5} />);
    if (host === undefined) throw new Error('App did not create a host');
    const started = host;
    act(() => {
      started.run(6000);
    });
    const dialog = screen.getByRole('dialog', { name: /Retreat/ });
    expect(dialog.textContent).toContain('walked out of the dungeon');
    const { profile } = useProfileStore.getState();
    expect(profile.history.totals.runs).toBe(1);
    expect(profile.history.totals.retreats).toBe(1);
    expect(profile.currencies.renown).toBeGreaterThan(0);
    // The Codex slice merged what the run met (ETH-065), the party's class among it.
    expect(profile.codex.entries['class.vanguard']).toEqual(['seen']);

    // Closing it leaves a banner over the map to bring it back.
    await user.click(within(dialog).getByRole('button', { name: 'Review log' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show summary' }));
    await user.click(screen.getByRole('button', { name: 'Start next run' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useRunStore.getState().report).toBeNull();
    expect(started.turn).toBe(0);
  });
});
