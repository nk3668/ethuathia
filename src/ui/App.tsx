import { useEffect } from 'react';
import { createSaveStore } from '../platform';
import type { SaveStore } from '../platform';
import type { SimHost } from '../sim';
import { DEMO_RUN } from './demoRun';
import { WorkerHost } from './host/workerHost';
import { AppShell } from './shell/AppShell';
import { watchAutoPause } from './shell/autoPause';
import { bindSaveStore } from './stores/profileStore';
import { bindHost, useSimStore } from './stores/simStore';

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
    host.start(DEMO_RUN, seed ?? Date.now() % 2 ** 31);
    // Runs at the speed the player last chose (1× at launch); the top bar's control changes it.
    host.setSpeed(useSimStore.getState().speed);
    return () => {
      unbind();
      unwatch();
      host.dispose();
    };
  }, [createHost, seed]);

  return <AppShell />;
}
