/**
 * The worker side of `WorkerHost`: answers `HostRequest`s on a message port and drives a
 * `PacedRunner` with timers. `sim.worker.ts` calls it on the worker's own scope; tests call it
 * on one end of a `MessageChannel`.
 */
import { PacedRunner, readHostRequest } from '../../sim';
import type { Clock, HostMessage, HostRequest } from '../../sim';

/** The part of a worker scope or `MessagePort` this needs. */
export interface ServePort {
  postMessage(message: HostMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  /** `MessagePort`s need starting; a worker scope has no `start`. */
  start?(): void;
}

/** Serves a sim on `port` until the worker is terminated or the port closed. */
export function serveSim(port: ServePort, now: Clock = () => performance.now()): void {
  const runner = new PacedRunner((update) => port.postMessage({ type: 'update', ...update }), now);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fail = (error: unknown) => {
    runner.setSpeed(0);
    port.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  };

  const schedule = (delay: number | null) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = delay === null ? undefined : setTimeout(pump, delay);
  };

  function pump(): void {
    timer = undefined;
    try {
      schedule(runner.pump());
    } catch (error) {
      fail(error);
    }
  }

  const handle = (request: HostRequest) => {
    switch (request.type) {
      case 'start':
        runner.start(request.config, request.seed);
        break;
      case 'command':
        runner.send(request.command);
        break;
      case 'setSpeed':
        runner.setSpeed(request.speed);
        break;
    }
  };

  port.addEventListener('message', (event) => {
    const request = readHostRequest(event.data);
    if (typeof request === 'string') {
      // A bad request pauses too, so the run is always paused when the host reports an error.
      fail(request);
      return;
    }
    try {
      handle(request);
    } catch (error) {
      fail(error);
      return;
    }
    // Something changed, so look again now rather than at the old timer.
    schedule(0);
  });
  port.start?.();
}
