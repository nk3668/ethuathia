import { useEffect } from 'react';
import { createSaveStore } from '../platform';
import type { SaveStore } from '../platform';
import type { EntityId, SimHost } from '../sim';
import { DEMO_RUN } from './demoRun';
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
  /** The run's seed. Defaults to a new one each launch. */
  seed?: number;
  /** Where the profile is saved. Defaults to IndexedDB (memory if unavailable); tests pass a `MemorySaveStore`. */
  createSaveStore?: () => SaveStore;
}

function createWorkerHost(): SimHost {
  return new WorkerHost();
}

/**
 * The app: starts a sim host, feeds it into `simStore` and shows the in-run shell. The UI only
 * reads snapshots and events from the store and talks to the run through the host (the speed
 * control sends through `simStore.setSpeed`, which `bindHost` connects to this host).
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
    // Each run uses the same config (the demo party until the Prepare screen); a fixed `seed`
    // (tests) counts up from there, otherwise every run gets a fresh one.
    let runSeed = seed ?? Date.now() % 2 ** 31;
    const startRun = () => {
      useSimStore.getState().reset();
      useRunStore.getState().runStarted();
      host.start(DEMO_RUN, runSeed);
      // Runs at the speed the player last chose (1× at launch); the top bar's control changes it.
      host.setSpeed(useSimStore.getState().speed);
    };
    const offStarter = setRunStarter(() => {
      runSeed = seed === undefined ? Date.now() % 2 ** 31 : (runSeed + 1) % 2 ** 31;
      startRun();
    });
    // Starts the next run by itself when the player has turned auto-restart on.
    const unwatchRestart = watchAutoRestart();
    startRun();
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
