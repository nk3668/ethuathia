/**
 * `simStore` (docs/ARCHITECTURE.md §8): what the UI knows about the running sim. It holds the
 * latest snapshot and a ring buffer of recent events, both delivered by a `SimHost`, and the speed
 * the UI last asked for. The UI only reads the run; it changes it by sending commands through the
 * host, never by touching state.
 */
import { create } from 'zustand';
import type { SimEvent, SimHost, Snapshot, Speed, Unsubscribe } from '../../sim';

/** How many recent events the store keeps. Older ones drop off the front. */
export const EVENT_BUFFER_SIZE = 500;

/** A speed that runs the sim: any speed but paused. */
export type RunningSpeed = Exclude<Speed, 0>;

/** The speed the app starts at. */
export const DEFAULT_SPEED: RunningSpeed = 1;

/** The host `bindHost` connected, which `setSpeed` sends to. */
let boundHost: SimHost | null = null;

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
  /** The speed last sent to the host. 0 is paused. */
  speed: Speed;
  /** The speed resuming goes back to: the last running speed chosen. */
  resumeSpeed: RunningSpeed;
  /**
   * Why the host stopped the run, or `null` while it is fine. While set, the run stays paused:
   * `setSpeed` and `togglePause` refuse to resume it.
   */
  error: string | null;
  receiveSnapshot(snapshot: Snapshot): void;
  receiveEvents(events: readonly SimEvent[]): void;
  /**
   * Records `speed` and sends it to the bound host, if there is one. Does nothing but pause
   * after a host error.
   */
  setSpeed(speed: Speed): void;
  /** Pauses a running sim, or resumes a paused one at `resumeSpeed`. */
  togglePause(): void;
  /** Records that the host stopped the run on an error and paused it. Sends nothing. */
  hostFailed(message: string): void;
  /** Forgets the snapshot, events and error, e.g. when a new run starts. The speed is kept. */
  reset(): void;
}

export const useSimStore = create<SimStoreState>()((set, get) => ({
  snapshot: null,
  events: [],
  nextSeq: 0,
  speed: DEFAULT_SPEED,
  resumeSpeed: DEFAULT_SPEED,
  error: null,
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
  setSpeed: (speed) => {
    if (speed !== 0 && get().error !== null) return;
    set(speed === 0 ? { speed } : { speed, resumeSpeed: speed });
    boundHost?.setSpeed(speed);
  },
  togglePause: () => {
    const { speed, resumeSpeed, setSpeed } = get();
    setSpeed(speed === 0 ? resumeSpeed : 0);
  },
  hostFailed: (message) => set({ speed: 0, error: message }),
  reset: () => set({ snapshot: null, events: [], nextSeq: 0, error: null }),
}));

/**
 * Feeds a host's snapshots, events and errors into `simStore`, and makes `setSpeed` send to it, until the
 * returned function is called. Binding sends nothing: the caller sends the store's speed once the
 * run has started.
 */
export function bindHost(host: SimHost): Unsubscribe {
  const { receiveSnapshot, receiveEvents, hostFailed } = useSimStore.getState();
  const offEvents = host.onEvents(receiveEvents);
  const offSnapshots = host.onSnapshot(receiveSnapshot);
  // The host pauses itself on an error; the store records why, so the UI can say so.
  const offErrors = host.onError(hostFailed);
  boundHost = host;
  return () => {
    offEvents();
    offSnapshots();
    offErrors();
    if (boundHost === host) boundHost = null;
  };
}
