/**
 * `runStore` (ETH-062): what the UI knows about the end of the current run, and starting the
 * next one (CLAUDE.md §2, "Core loop").
 *
 * When the host reports a run end, `App` banks the result in the profile and calls `runEnded`,
 * which opens the run summary. Waiting for the player is the default: the next run starts when
 * they press "Start next run". With the profile's `settings.autoRestart` on, `watchAutoRestart`
 * starts it after `AUTO_RESTART_MS` instead, unless the player cancels that countdown.
 */
import { create } from 'zustand';
import type { RunRecord } from '../../meta';
import type { RunReport, Unsubscribe } from '../../sim';
import { useProfileStore } from './profileStore';

/** How long the run summary counts down before an auto-restart. */
export const AUTO_RESTART_MS = 5000;

export interface RunStoreState {
  /** The run that just ended, until the next one starts; `null` while a run goes on. */
  report: RunReport | null;
  /** Whether the run summary modal is showing. */
  summaryOpen: boolean;
  /** When the pending auto-restart fires (ms since the epoch), or `null` if none is pending. */
  restartAt: number | null;
  /** The player cancelled this run's auto-restart countdown. */
  restartCancelled: boolean;
  /** A past run whose summary is open from the run history (ETH-048), or `null`. */
  pastRun: RunRecord | null;
  /** Records a finished run and opens the summary. */
  runEnded(report: RunReport): void;
  setSummaryOpen(open: boolean): void;
  /** Opens a past run's summary from the run history, or closes it with `null`. */
  showPastRun(record: RunRecord | null): void;
  /** Cancels the pending auto-restart for this run only (the setting stays on). */
  cancelRestart(): void;
  /** Starts the next run with the same settings, through the starter `App` registered. */
  startNext(): void;
  /** Forgets the finished run: a new run has started. */
  runStarted(): void;
}

/** Starts a new run; registered by `App`, which owns the host. */
let starter: (() => void) | null = null;

/** Registers what `startNext` calls, until the returned function is called. */
export function setRunStarter(start: () => void): Unsubscribe {
  starter = start;
  return () => {
    if (starter === start) starter = null;
  };
}

export const useRunStore = create<RunStoreState>()((set) => ({
  report: null,
  summaryOpen: false,
  restartAt: null,
  restartCancelled: false,
  pastRun: null,
  runEnded: (report) => set({ report, summaryOpen: true, restartCancelled: false }),
  setSummaryOpen: (summaryOpen) => set({ summaryOpen }),
  showPastRun: (pastRun) => set({ pastRun }),
  cancelRestart: () => set({ restartCancelled: true, restartAt: null }),
  startNext: () => starter?.(),
  runStarted: () => set({ report: null, summaryOpen: false, restartAt: null, restartCancelled: false }),
}));

/** Timers, injectable for tests. */
export interface RestartTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const REAL_TIMERS: RestartTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Starts the next run `AUTO_RESTART_MS` after a run ends while `settings.autoRestart` is on and
 * the countdown hasn't been cancelled. Turning the setting off (or on) takes effect at once.
 * Returns a function that stops watching and drops any pending timer.
 */
export function watchAutoRestart(timers: RestartTimers = REAL_TIMERS): Unsubscribe {
  let handle: unknown = null;

  const update = () => {
    const { report, restartCancelled } = useRunStore.getState();
    const wanted = report !== null && !restartCancelled && useProfileStore.getState().profile.settings.autoRestart;
    if (wanted && handle === null) {
      // The handle is set before the store changes, since that change calls `update` again.
      handle = timers.setTimeout(() => {
        handle = null;
        useRunStore.getState().startNext();
      }, AUTO_RESTART_MS);
      useRunStore.setState({ restartAt: timers.now() + AUTO_RESTART_MS });
    } else if (!wanted && handle !== null) {
      timers.clearTimeout(handle);
      handle = null;
      if (useRunStore.getState().restartAt !== null) useRunStore.setState({ restartAt: null });
    }
  };

  const offRun = useRunStore.subscribe(update);
  const offProfile = useProfileStore.subscribe((now, before) => {
    if (now.profile.settings.autoRestart !== before.profile.settings.autoRestart) update();
  });
  update();
  return () => {
    offRun();
    offProfile();
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
}
