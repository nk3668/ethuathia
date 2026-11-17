/**
 * `InlineHost` (docs/ARCHITECTURE.md §7): runs the sim on the calling thread with no timers.
 * Nothing happens until `run` is called, which steps synchronously. For tests, the balance
 * harness and time-away catch-up.
 */
import type { Command } from '../commands';
import type { SimEvent } from '../events';
import type { Snapshot } from '../snapshot';
import type { RunConfig } from '../state';
import { SimSession } from './session';
import { deliver, Listeners } from './types';
import type { SimHost, Speed, Unsubscribe } from './types';

export class InlineHost implements SimHost {
  private session: SimSession | null = null;
  private readonly events = new Listeners<readonly SimEvent[]>();
  private readonly snapshots = new Listeners<Snapshot>();
  private currentSpeed: Speed = 1;

  /**
   * The speed last set. An inline host has no clock, so it only records it for callers that
   * share code with a timed host.
   */
  get speed(): Speed {
    return this.currentSpeed;
  }

  /** The game turn the run has reached. Throws before `start`. */
  get turn(): number {
    return this.current().turn;
  }

  start(config: RunConfig, seed: number): void {
    this.session = new SimSession(config, seed);
    this.snapshots.emit(this.session.snapshot());
  }

  send(command: Command): void {
    this.current().send(command);
  }

  setSpeed(speed: Speed): void {
    this.currentSpeed = speed;
  }

  /**
   * Runs `steps` steps (party turns) now, then delivers their events as one batch and a single
   * snapshot of where the run ended up. Stops early if a step gets nowhere (nobody can act).
   * Returns the number of steps that got somewhere.
   */
  run(steps: number): number {
    const session = this.current();
    const events: SimEvent[] = [];
    let done = 0;
    while (done < steps) {
      const result = session.step();
      events.push(...result.events);
      if (!result.progressed) break;
      done++;
    }
    deliver({ events, snapshot: session.snapshot() }, this.events, this.snapshots);
    return done;
  }

  onSnapshot(listener: (snapshot: Snapshot) => void): Unsubscribe {
    return this.snapshots.add(listener);
  }

  onEvents(listener: (events: readonly SimEvent[]) => void): Unsubscribe {
    return this.events.add(listener);
  }

  dispose(): void {
    this.session = null;
    this.events.clear();
    this.snapshots.clear();
  }

  private current(): SimSession {
    if (this.session === null) throw new Error('No run has been started');
    return this.session;
  }
}
