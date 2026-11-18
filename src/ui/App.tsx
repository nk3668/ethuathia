import { useEffect } from 'react';
import { buildRunConfig } from '../meta';
import { createSaveStore } from '../platform';
import type { SaveStore } from '../platform';
import type { EntityId, RunConfig, SimHost } from '../sim';
import { WorkerHost } from './host/workerHost';
import { AppShell } from './shell/AppShell';
import { watchAutoPause } from './shell/autoPause';
import { bindSaveStore, useProfileStore } from './stores/profileStore';
import { setRunStarter, useRunStore, watchAutoRestart } from './stores/runStore';
import { bindHost, useSimStore } from './stores/simStore';
import { useUiStore } from './stores/uiStore';

export interface AppProps {
  /** Makes the sim host. Defaults to a Web Worker; tests pass an `InlineHost`. */
  createHost?: () => SimHost;
  /** The first run's seed; later runs count up from it. Defaults to a fresh seed for every run. */
  seed?: number;
  /** Where the profile is saved. Defaults to IndexedDB (memory if unavailable); tests pass a `MemorySaveStore`. */
  createSaveStore?: () => SaveStore;
}

function createWorkerHost(): SimHost {
  return new WorkerHost();
}

/**
 * The app: opens on the Prepare screen, starts each run on a sim host from the profile's
 * remembered Prepare choices (`buildRunConfig`), feeds the host into `simStore` and shows the
 * shell. The UI only reads snapshots and events from the store and talks to the run through the
 * host (the speed control sends through `simStore.setSpeed`, which `bindHost` connects to this
 * host).
 */
export function App({ createHost = createWorkerHost, seed, createSaveStore: makeSaveStore = createSaveStore }: AppProps) {
  // Loads the profile and autosaves it (on a timer and when the window closes).
  useEffect(() => bindSaveStore(makeSaveStore()).unbind, [makeSaveStore]);

  useEffect(() => {
    const host = createHost();
    useSimStore.getState().reset();
    // Also records a host error, which pauses the run and shows a banner over the map.
    const unbind = bindHost(host);
    // Pauses on the highlight kinds ticked in Options.
    const unwatch = watchAutoPause();
    // The map shows the selected adventurer's floor, so it follows them down the stairs.
    const follow = (id: EntityId | null) => host.setView(id === null ? {} : { follow: id });
    follow(useUiStore.getState().selected);
    const offSelect = useUiStore.subscribe((now, before) => {
      if (now.selected !== before.selected) follow(now.selected);
    });
    // A run ends (ETH-062): bank its result in the profile, save, and show the run summary.
    const offEnded = host.onRunEnded((report) => {
      const profile = useProfileStore.getState();
      profile.applyRunResult(report.result);
      void profile.save();
      useRunStore.getState().runEnded(report);
    });
    // Every run (Descend, Start next run, auto-restart, after a sim error) is built from the
    // profile's remembered Prepare choices. A fixed `seed` (tests) is the first run's and counts
    // up from there; otherwise every run gets a fresh one. The seed also draws random recruits.
    let nextSeed = seed;
    const startRun = () => {
      const runSeed = nextSeed ?? Date.now() % 2 ** 31;
      if (nextSeed !== undefined) nextSeed = (nextSeed + 1) % 2 ** 31;
      const { profile } = useProfileStore.getState();
      let config: RunConfig;
      try {
        config = buildRunConfig(profile, profile.prepare.choices, runSeed);
      } catch (error) {
        useRunStore.getState().startFailed(error instanceof Error ? error.message : String(error));
        return;
      }
      useSimStore.getState().reset();
      useRunStore.getState().runStarted();
      host.start(config, runSeed);
      // Runs at the speed the player last chose (1× at launch); the top bar's control changes it.
      host.setSpeed(useSimStore.getState().speed);
    };
    const offStarter = setRunStarter(startRun);
    // Starts the next run by itself when the player has turned auto-restart on.
    const unwatchRestart = watchAutoRestart();
    // The game waits on the Prepare screen until the player descends (CLAUDE.md §2).
    useRunStore.getState().openPrepare();
    return () => {
      offSelect();
      offEnded();
      offStarter();
      unwatchRestart();
      unbind();
      unwatch();
      host.dispose();
    };
  }, [createHost, seed]);

  return <AppShell />;
}
