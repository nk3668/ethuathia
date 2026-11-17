/**
 * The `SimHost` interface (docs/ARCHITECTURE.md §7): what the UI, tests, the balance harness and
 * time-away use to run a sim without touching `RunState`.
 */
import type { Command } from '../commands';
import type { SimEvent } from '../events';
import type { Snapshot } from '../snapshot';
import type { RunConfig } from '../state';

/** Sim speeds: 0 is paused, `max` runs as fast as the machine allows. */
export const SPEEDS = [0, 1, 2, 4, 8, 'max'] as const;
export type Speed = (typeof SPEEDS)[number];

export function isSpeed(value: unknown): value is Speed {
  return (SPEEDS as readonly unknown[]).includes(value);
}

/** Stops a listener added with `onSnapshot` or `onEvents`. */
export type Unsubscribe = () => void;

export interface SimHost {
  /** Starts a new run, replacing any current one, and delivers its first snapshot. */
  start(config: RunConfig, seed: number): void;
  /** Queues a command. It is applied, in the order sent, at the start of the next step. */
  send(command: Command): void;
  setSpeed(speed: Speed): void;
  /** Called with each new snapshot, after the events that led to it. */
  onSnapshot(listener: (snapshot: Snapshot) => void): Unsubscribe;
  /** Called with each batch of events, in the order they happened. Batches are never empty. */
  onEvents(listener: (events: readonly SimEvent[]) => void): Unsubscribe;
  /**
   * Called with a plain-language message when the host stops the run on an error (a bad request
   * or a thrown sim error). The host has paused the run by then. A host that reports errors by
   * throwing to the caller (`InlineHost`) never calls it.
   */
  onError(listener: (message: string) => void): Unsubscribe;
  /** Stops the host for good and drops every listener. */
  dispose(): void;
}

/** What a host delivers at once: the events since the last update, then a snapshot. */
export interface HostUpdate {
  events: SimEvent[];
  snapshot: Snapshot;
}

/** A small listener list for the hosts. */
export class Listeners<T> {
  private list: ((value: T) => void)[] = [];

  add(listener: (value: T) => void): Unsubscribe {
    this.list = [...this.list, listener];
    return () => {
      this.list = this.list.filter((l) => l !== listener);
    };
  }

  emit(value: T): void {
    for (const listener of this.list) listener(value);
  }

  clear(): void {
    this.list = [];
  }
}

/** Hands an update to the host's listeners: events first (if any), then the snapshot. */
export function deliver(update: HostUpdate, events: Listeners<readonly SimEvent[]>, snapshots: Listeners<Snapshot>): void {
  if (update.events.length > 0) events.emit(update.events);
  snapshots.emit(update.snapshot);
}
