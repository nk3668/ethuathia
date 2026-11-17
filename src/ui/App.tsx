import { useEffect } from 'react';
import type { SimHost } from '../sim';
import { DEMO_RUN } from './demoRun';
import { WorkerHost } from './host/workerHost';
import { AppShell } from './shell/AppShell';
import { bindHost, useSimStore } from './stores/simStore';

export interface AppProps {
  /** Makes the sim host. Defaults to a Web Worker; tests pass an `InlineHost`. */
  createHost?: () => SimHost;
  /** The run's seed. Defaults to a new one each launch. */
  seed?: number;
}

function createWorkerHost(): SimHost {
  return new WorkerHost();
}

/**
 * The app: starts a sim host, feeds it into `simStore` and shows the in-run shell. The UI only
 * reads snapshots and events from the store and talks to the run through the host (the speed
 * control sends through `simStore.setSpeed`, which `bindHost` connects to this host).
 */
export function App({ createHost = createWorkerHost, seed }: AppProps) {
  useEffect(() => {
    const host = createHost();
    useSimStore.getState().reset();
    const unbind = bindHost(host);
    // The worker pauses itself after an error; the speed control should then show paused.
    const offError = host instanceof WorkerHost ? host.onError(() => useSimStore.getState().hostPaused()) : undefined;
    host.start(DEMO_RUN, seed ?? Date.now() % 2 ** 31);
    // Runs at the speed the player last chose (1× at launch); the top bar's control changes it.
    host.setSpeed(useSimStore.getState().speed);
    return () => {
      offError?.();
      unbind();
      host.dispose();
    };
  }, [createHost, seed]);

  return <AppShell />;
}
