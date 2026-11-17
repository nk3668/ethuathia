/**
 * One running sim: the run state, the commands waiting for the next step, and the way both hosts
 * advance it. Sharing this is what makes the inline and worker hosts produce the same events
 * for the same seed and commands.
 */
import { clonePlain } from '../../core';
import type { Command } from '../commands';
import type { SimEvent } from '../events';
import { createRun } from '../createRun';
import { stateHash } from '../serialize';
import { snapshot } from '../snapshot';
import type { Snapshot, ViewOptions } from '../snapshot';
import type { RunConfig, RunState } from '../state';
import { step } from '../step';

export class SimSession {
  private readonly state: RunState;
  private pending: Command[] = [];
  private view: ViewOptions;

  constructor(config: RunConfig, seed: number, view: ViewOptions = {}) {
    this.state = createRun(config, seed);
    this.view = clonePlain(view);
  }

  /** The game turn the run has reached. */
  get turn(): number {
    return this.state.turn;
  }

  /** Queues a copy of `command` for the next step, so later changes to it make no difference. */
  send(command: Command): void {
    this.pending.push(clonePlain(command));
  }

  /**
   * One step (one party turn) with the queued commands. Returns its events, and whether it got
   * anywhere: false if the turn did not move and nothing happened, as when nobody can act.
   */
  step(): { events: SimEvent[]; progressed: boolean } {
    const commands = this.pending;
    this.pending = [];
    const turn = this.state.turn;
    const events = step(this.state, commands);
    return { events, progressed: events.length > 0 || this.state.turn !== turn };
  }

  /** What later snapshots show by default, e.g. `{ follow: selectedId }`. A copy is kept. */
  setView(view: ViewOptions): void {
    this.view = clonePlain(view);
  }

  /** A snapshot of `view`, or of the view last set with `setView`. */
  snapshot(view: ViewOptions = this.view): Snapshot {
    return snapshot(this.state, view);
  }

  /**
   * A fingerprint of the run state (`stateHash`), so headless callers such as the run report can
   * tell whether two runs ended up the same without reaching into the state.
   */
  stateHash(): string {
    return stateHash(this.state);
  }
}
