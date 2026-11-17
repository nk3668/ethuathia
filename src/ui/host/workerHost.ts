/**
 * `WorkerHost` (docs/ARCHITECTURE.md §7): runs the sim in a Web Worker, so the UI stays
 * responsive at any speed. The worker steps on a timer by speed (`PacedRunner`) and posts at most
 * about 30 updates a second, each a batch of events and then a snapshot.
 */
import { deliver, Listeners } from '../../sim';
import type { Command, HostMessage, HostRequest, RunConfig, SimEvent, SimHost, Snapshot, Speed, Unsubscribe } from '../../sim';

/** The part of a `Worker` (or `MessagePort`) the host needs. */
export interface WorkerPort {
  postMessage(message: HostRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<HostMessage>) => void): void;
  /** A `MessagePort` needs starting; a `Worker` has no `start`. */
  start?(): void;
  /** `Worker.terminate`, or `MessagePort.close`. */
  terminate?(): void;
  close?(): void;
}

/** Starts the sim worker. */
export function createSimWorker(): Worker {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'sim' });
}

export class WorkerHost implements SimHost {
  private readonly events = new Listeners<readonly SimEvent[]>();
  private readonly snapshots = new Listeners<Snapshot>();
  private readonly errors = new Listeners<string>();
  private started = false;
  private disposed = false;

  /** `worker` defaults to a new sim worker; tests pass one end of a `MessageChannel`. */
  constructor(private readonly worker: WorkerPort = createSimWorker()) {
    worker.addEventListener('message', (event) => this.receive(event.data));
    worker.start?.();
  }

  start(config: RunConfig, seed: number): void {
    this.post({ type: 'start', config, seed });
    this.started = true;
  }

  send(command: Command): void {
    if (!this.started) throw new Error('No run has been started');
    this.post({ type: 'command', command });
  }

  setSpeed(speed: Speed): void {
    this.post({ type: 'setSpeed', speed });
  }

  onSnapshot(listener: (snapshot: Snapshot) => void): Unsubscribe {
    return this.snapshots.add(listener);
  }

  onEvents(listener: (events: readonly SimEvent[]) => void): Unsubscribe {
    return this.events.add(listener);
  }

  /** Called when the worker reports an error. The worker pauses the run when it does. */
  onError(listener: (message: string) => void): Unsubscribe {
    return this.errors.add(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.clear();
    this.snapshots.clear();
    this.errors.clear();
    this.worker.terminate?.();
    this.worker.close?.();
  }

  private post(request: HostRequest): void {
    if (this.disposed) throw new Error('This host has been disposed');
    this.worker.postMessage(request);
  }

  private receive(message: HostMessage): void {
    if (this.disposed) return;
    switch (message.type) {
      case 'update':
        deliver(message, this.events, this.snapshots);
        break;
      case 'error':
        console.error(`Sim worker: ${message.message}`);
        this.errors.emit(message.message);
        break;
    }
  }
}
