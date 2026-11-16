/**
 * `simStore` (docs/ARCHITECTURE.md §8): what the UI knows about the running sim. It holds the
 * latest snapshot and a ring buffer of recent events, both delivered by a `SimHost`. The UI only
 * reads them; it changes the run by sending commands through the host, never by touching state.
 */
import { create } from 'zustand';
import type { SimEvent, SimHost, Snapshot, Unsubscribe } from '../../sim';

/** How many recent events the store keeps. Older ones drop off the front. */
export const EVENT_BUFFER_SIZE = 500;

/** An event with a sequence number that stays unique as the buffer rolls, for list keys. */
export interface LoggedEvent {
  seq: number;
  event: SimEvent;
}

export interface SimStoreState {
  /** The latest snapshot, or `null` before the first one arrives. */
  snapshot: Snapshot | null;
  /** The most recent events, oldest first, at most `EVENT_BUFFER_SIZE`. */
  events: readonly LoggedEvent[];
  /** The sequence number the next event gets. */
  nextSeq: number;
  receiveSnapshot(snapshot: Snapshot): void;
  receiveEvents(events: readonly SimEvent[]): void;
  /** Forgets the snapshot and events, e.g. when a new run starts. */
  reset(): void;
}

export const useSimStore = create<SimStoreState>()((set) => ({
  snapshot: null,
  events: [],
  nextSeq: 0,
  receiveSnapshot: (snapshot) => set({ snapshot }),
  receiveEvents: (incoming) =>
    set((state) => {
      if (incoming.length === 0) return state;
      const kept = incoming.slice(-EVENT_BUFFER_SIZE);
      const skipped = incoming.length - kept.length;
      const added = kept.map((event, i) => ({ seq: state.nextSeq + skipped + i, event }));
      const events = [...state.events, ...added].slice(-EVENT_BUFFER_SIZE);
      return { events, nextSeq: state.nextSeq + incoming.length };
    }),
  reset: () => set({ snapshot: null, events: [], nextSeq: 0 }),
}));

/** Feeds a host's snapshots and events into `simStore` until the returned function is called. */
export function bindHost(host: SimHost): Unsubscribe {
  const { receiveSnapshot, receiveEvents } = useSimStore.getState();
  const offEvents = host.onEvents(receiveEvents);
  const offSnapshots = host.onSnapshot(receiveSnapshot);
  return () => {
    offEvents();
    offSnapshots();
  };
}
