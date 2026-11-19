/**
 * One running sim: the run state, the commands waiting for the next step, and the way both hosts
 * advance it. Sharing this is what makes the inline and worker hosts produce the same events
 * for the same seed and commands.
 */
import { clonePlain } from '../../core';
import type { Command } from '../commands';
import type { SimEvent } from '../events';
import { possessedMember } from '../ai/possession';
import { createRun } from '../createRun';
import { runOver, runReport } from '../run/end';
import type { RunReport } from '../run/end';
import { stateHash } from '../serialize';
import { snapshot } from '../snapshot';
import type { Snapshot, ViewOptions } from '../snapshot';
import type { EntityId, RunConfig, RunState } from '../state';
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
  step(): { events: SimEvent[]; progressed: boolean; ended: RunReport | null } {
    const commands = this.pending;
    this.pending = [];
    const turn = this.state.turn;
    const wasOver = runOver(this.state);
    const events = step(this.state, commands);
    const ended = !wasOver && runOver(this.state) ? runReport(this.state) : null;
    return { events, progressed: events.length > 0 || this.state.turn !== turn, ended };
  }

  /**
   * The living party member the player possesses (ETH-066), or `null`. The run holds at its turn
   * until a `playerAction` for it arrives.
   */
  possessed(): EntityId | null {
    const id = possessedMember(this.state);
    const hp = id === null ? 0 : (this.state.entities[id]?.actor?.hp ?? 0);
    return hp > 0 ? id : null;
  }

  /** True once the run has ended; later steps do nothing. */
  get over(): boolean {
    return runOver(this.state);
  }

  /** The finished run's report, or `null` while it goes on. */
  report(): RunReport | null {
    return runOver(this.state) ? runReport(this.state) : null;
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
