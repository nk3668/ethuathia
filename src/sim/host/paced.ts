/**
 * `PacedRunner`: the timing half of the worker host (docs/ARCHITECTURE.md §7), kept free of
 * timers so it can be tested with a fake clock. The worker calls `pump` whenever the delay it
 * returned has passed (or a message arrives), and posts each update `pump` produces.
 *
 * - At 1×, 2×, 4× and 8× the run takes `TURNS_PER_SECOND × speed` steps per second of clock
 *   time. At `max` each pump steps for up to `MAX_SLICE_MS`, then yields so messages get in.
 * - Updates (a batch of events, then a snapshot) go out at most once per
 *   `SNAPSHOT_INTERVAL_MS`, however many steps ran, so about 30 a second at most.
 */
import { clonePlain } from '../../core';
import type { Command } from '../commands';
import type { ViewOptions } from '../snapshot';
import type { SimEvent } from '../events';
import type { RunConfig } from '../state';
import { SimSession } from './session';
import type { HostUpdate, Speed } from './types';

/** Party turns per second at 1×. */
export const TURNS_PER_SECOND = 5;

/** The shortest time between two updates: about 30 a second. */
export const SNAPSHOT_INTERVAL_MS = 1000 / 30;

/** How long one pump steps for at `max` before yielding. */
export const MAX_SLICE_MS = 12;

/** A cap on steps per pump at `max`, in case the clock is coarse or stopped. */
export const MAX_STEPS_PER_PUMP = 10_000;

/**
 * How far a timed speed may fall behind before the runner stops catching up and starts counting
 * again from now, in seconds of steps. A worker whose timers were throttled (a hidden window)
 * would otherwise run a burst of steps when it wakes.
 */
const MAX_LAG_SECONDS = 1;

/** Milliseconds from some fixed point, e.g. `performance.now`. */
export type Clock = () => number;

export class PacedRunner {
  private session: SimSession | null = null;
  private currentSpeed: Speed = 0;
  /** Events since the last update. */
  private events: SimEvent[] = [];
  /** True when a step has run since the last update. */
  private dirty = false;
  private lastUpdate = -Infinity;
  /** When the current speed was set, and the steps taken since, for timed speeds. */
  private anchor = 0;
  private stepsSinceAnchor = 0;
  /** True when the last step got nowhere (nobody can act), so `max` stops spinning. */
  private stalled = false;
  /** What snapshots show, kept across `start`. */
  private view: ViewOptions = {};

  constructor(
    private readonly onUpdate: (update: HostUpdate) => void,
    private readonly now: Clock,
  ) {}

  get speed(): Speed {
    return this.currentSpeed;
  }

  /** Starts a new run at the current speed and sends its first snapshot right away. */
  start(config: RunConfig, seed: number): void {
    this.session = new SimSession(config, seed, this.view);
    this.events = [];
    this.stalled = false;
    this.resetAnchor();
    this.flush(this.session);
  }

  /** Queues a command for the next step. Throws if no run has been started. */
  send(command: Command): void {
    if (this.session === null) throw new Error('No run has been started');
    this.session.send(command);
    this.stalled = false;
  }

  /**
   * Changes what snapshots show (`SimHost.setView`), and with a run going sends an update of the
   * new view at once, with any unsent events before it.
   */
  setView(view: ViewOptions): void {
    this.view = clonePlain(view);
    if (this.session === null) return;
    this.session.setView(this.view);
    this.flush(this.session);
  }

  /** Changes speed. Pausing sends any unsent events and a final snapshot at once. */
  setSpeed(speed: Speed): void {
    this.currentSpeed = speed;
    this.resetAnchor();
    if (speed === 0 && this.session !== null && this.dirty) this.flush(this.session);
  }

  /**
   * Runs the steps that are due, sends an update if one is due, and returns how many
   * milliseconds until it next has work, or `null` if it has none until a message arrives
   * (paused, or no run).
   */
  pump(): number | null {
    const session = this.session;
    if (session === null) return null;
    const speed = this.currentSpeed;

    if (speed === 'max') {
      const end = this.now() + MAX_SLICE_MS;
      for (let n = 0; n < MAX_STEPS_PER_PUMP && !this.stalled; n++) {
        this.advance(session);
        if (this.now() >= end) break;
      }
    } else if (speed !== 0) {
      const perMs = (TURNS_PER_SECOND * speed) / 1000;
      let due = Math.floor((this.now() - this.anchor) * perMs) - this.stepsSinceAnchor;
      if (due > TURNS_PER_SECOND * speed * MAX_LAG_SECONDS) {
        this.resetAnchor();
        due = 1;
      }
      for (let n = 0; n < due && !this.stalled; n++) this.advance(session);
    }

    const now = this.now();
    const nextUpdate = this.lastUpdate + SNAPSHOT_INTERVAL_MS;
    if (this.dirty && now >= nextUpdate) this.flush(session);

    if (speed === 0) return null;
    const updateWait = this.dirty ? Math.max(0, this.lastUpdate + SNAPSHOT_INTERVAL_MS - now) : Infinity;
    if (this.stalled) return Number.isFinite(updateWait) ? updateWait : null;
    if (speed === 'max') return 0;
    const nextStep = this.anchor + (this.stepsSinceAnchor + 1) / ((TURNS_PER_SECOND * speed) / 1000);
    return Math.min(Math.max(0, nextStep - now), updateWait);
  }

  private advance(session: SimSession): void {
    const { events, progressed } = session.step();
    for (const event of events) this.events.push(event);
    this.stepsSinceAnchor++;
    this.dirty = true;
    this.stalled = !progressed;
  }

  private flush(session: SimSession): void {
    const update: HostUpdate = { events: this.events, snapshot: session.snapshot() };
    this.events = [];
    this.dirty = false;
    this.lastUpdate = this.now();
    this.onUpdate(update);
  }

  private resetAnchor(): void {
    this.anchor = this.now();
    this.stepsSinceAnchor = 0;
  }
}
