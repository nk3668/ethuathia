import { describe, expect, it } from 'vitest';
import {
  createRun,
  InlineHost,
  isSpeed,
  PacedRunner,
  readHostRequest,
  SNAPSHOT_INTERVAL_MS,
  SPEEDS,
  step,
  TURNS_PER_SECOND,
} from '../../src/sim';
import type { Command, EntityId, HostUpdate, RunConfig, SimEvent, Snapshot, Speed } from '../../src/sim';

const hero = (name: string) => ({ name, classId: 'class.test', raceId: 'race.test' });
/** Two adventurers on a generated floor, so there is plenty going on. */
const PARTY: RunConfig = { party: [hero('Brannoc'), hero('Ysolde')] };
const SEED = 3;

/** The id of the run's first party member, which `createRun` hands out first. */
const FIRST: EntityId = 1;
const BUMP: Command = { type: 'playerAction', actor: FIRST, action: { id: 'wait' } };

/** The events and last snapshot of `steps` steps on an inline host, with `BUMP` sent before step `at`. */
function inlineRun(steps: number, at: number[] = []): { events: SimEvent[]; last: Snapshot } {
  const host = new InlineHost();
  const events: SimEvent[] = [];
  let last: Snapshot | undefined;
  host.onEvents((batch) => events.push(...batch));
  host.onSnapshot((s) => (last = s));
  host.start(PARTY, SEED);
  let done = 0;
  for (const mark of [...at, steps]) {
    host.run(mark - done);
    done = mark;
    if (mark < steps) host.send(BUMP);
  }
  if (last === undefined) throw new Error('no snapshot');
  return { events, last };
}

/**
 * A clock under test control. Each reading moves it on by `drift` ms, as real time passes while
 * the runner works; `wait` jumps it forward, as a timer would.
 */
function fakeClock(drift: number) {
  let time = 0;
  return {
    now: () => (time += drift),
    wait: (ms: number) => (time += ms),
    get time() {
      return time;
    },
  };
}

/** A runner on a fake clock, recording every update with the clock time it was sent at. */
function pacedSetup(drift = 0.01) {
  const clock = fakeClock(drift);
  const updates: (HostUpdate & { at: number })[] = [];
  const runner = new PacedRunner((u) => updates.push({ ...u, at: clock.time }), clock.now);
  /** Pumps as a worker's timer would until the clock passes `ms` more, or the runner goes idle. */
  const drive = (ms: number) => {
    const end = clock.time + ms;
    while (clock.time < end) {
      const delay = runner.pump();
      if (delay === null) return;
      clock.wait(delay);
    }
  };
  return { clock, updates, runner, drive };
}

/** The most updates sent in any one-second window. */
function busiestSecond(updates: readonly { at: number }[]): number {
  return Math.max(0, ...updates.map((u, i) => updates.slice(i).filter((v) => v.at < u.at + 1000).length));
}

describe('InlineHost', () => {
  it('sends the first snapshot on start, and events then a snapshot for each run', () => {
    const host = new InlineHost();
    const calls: string[] = [];
    host.onEvents((batch) => calls.push(`events ${batch.length}`));
    host.onSnapshot((s) => calls.push(`snapshot ${s.turn}`));
    host.start(PARTY, SEED);
    expect(calls).toEqual(['snapshot 0']);

    expect(host.run(25)).toBe(25);
    expect(host.turn).toBe(25);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toMatch(/^events \d+$/);
    expect(calls[2]).toBe('snapshot 25');
  });

  it('gives the same events as calling step directly', () => {
    const state = createRun(PARTY, SEED);
    const direct: SimEvent[] = [];
    for (let i = 0; i < 60; i++) direct.push(...step(state, i === 10 ? [BUMP] : []));
    expect(inlineRun(60, [10]).events).toEqual(direct);
  });

  it('applies commands at the next step, and copies them when sent', () => {
    const host = new InlineHost();
    const events: SimEvent[] = [];
    host.onEvents((batch) => events.push(...batch));
    host.start(PARTY, SEED);
    const command = { type: 'playerAction', actor: 99, action: { id: 'wait' } } as Command;
    host.send(command);
    (command as { actor: number }).actor = FIRST;
    host.run(1);
    expect(events[0]).toMatchObject({ type: 'commandRejected', reason: 'No entity 99', turn: 0 });
  });

  it('stops listening when unsubscribed or disposed, and needs a run first', () => {
    const host = new InlineHost();
    expect(() => host.run(1)).toThrow('No run has been started');
    expect(() => host.send(BUMP)).toThrow('No run has been started');
    let count = 0;
    const stop = host.onSnapshot(() => count++);
    host.start(PARTY, SEED);
    stop();
    host.run(1);
    expect(count).toBe(1);
    host.setSpeed('max');
    expect(host.speed).toBe('max');
    host.dispose();
    expect(() => host.run(1)).toThrow();
  });
});

describe('PacedRunner', () => {
  it('sends a snapshot on start and does nothing while paused', () => {
    const { runner, updates, drive } = pacedSetup();
    expect(runner.pump()).toBeNull();
    runner.start(PARTY, SEED);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.snapshot.turn).toBe(0);
    expect(updates[0]?.events).toEqual([]);
    drive(5000);
    expect(updates).toHaveLength(1);
  });

  it.each([1, 2, 4, 8] as const)('takes %i× the base rate of steps', (speed) => {
    const { runner, updates, drive } = pacedSetup();
    runner.start(PARTY, SEED);
    runner.setSpeed(speed);
    drive(10_000);
    runner.setSpeed(0);
    const expected = 10 * TURNS_PER_SECOND * speed;
    const turn = updates.at(-1)?.snapshot.turn ?? 0;
    expect(turn).toBeGreaterThanOrEqual(expected - 1);
    expect(turn).toBeLessThanOrEqual(expected + 1);
    expect(busiestSecond(updates)).toBeLessThanOrEqual(31);
  });

  it('runs flat out at max but still sends about 30 updates a second', () => {
    const { runner, updates, drive } = pacedSetup(0.5);
    runner.start(PARTY, SEED);
    runner.setSpeed('max');
    drive(2000);
    runner.setSpeed(0);
    // Each pump steps for a whole slice, far beyond the 8× rate.
    expect(updates.at(-1)?.snapshot.turn).toBeGreaterThan(2 * TURNS_PER_SECOND * 8 * 10);
    expect(busiestSecond(updates)).toBeLessThanOrEqual(31);
    // Updates while running are at least an interval apart; only the one sent on pausing may be closer.
    for (let i = 1; i < updates.length - 1; i++) {
      expect((updates[i]?.at ?? 0) - (updates[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(SNAPSHOT_INTERVAL_MS - 1);
    }
  });

  it('sends events in order, in non-empty batches, each followed by the snapshot after them', () => {
    const { runner, updates, drive } = pacedSetup(0.5);
    runner.start(PARTY, SEED);
    runner.setSpeed(8);
    drive(3000);
    runner.setSpeed('max');
    drive(500);
    runner.setSpeed(0);
    const later = updates.slice(1);
    expect(later.length).toBeGreaterThan(10);
    let turn = 0;
    for (const { events, snapshot } of later) {
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.turn).toBeGreaterThanOrEqual(turn);
        turn = e.turn;
      }
      expect(snapshot.turn).toBeGreaterThanOrEqual(turn);
    }
  });

  it('gives the same events as the inline host for the same seed and commands', () => {
    const { runner, updates, drive } = pacedSetup(0.5);
    runner.start(PARTY, SEED);
    runner.setSpeed(4);
    drive(1000);
    runner.setSpeed(0);
    const first = updates.at(-1)?.snapshot.turn ?? 0;
    runner.send(BUMP);
    runner.setSpeed('max');
    drive(300);
    runner.setSpeed(0);
    const last = updates.at(-1)?.snapshot as Snapshot;

    const inline = inlineRun(last.turn, [first]);
    expect(updates.flatMap((u) => u.events)).toEqual(inline.events);
    expect(last).toEqual(inline.last);
  });

  it('waits for the next step or update, and catches up only a second after a stall', () => {
    const { runner, clock, updates } = pacedSetup(0);
    runner.start(PARTY, SEED);
    runner.setSpeed(1);
    // Nothing is due yet: the first step is 200 ms away.
    expect(runner.pump()).toBeCloseTo(1000 / TURNS_PER_SECOND);
    clock.wait(1000 / TURNS_PER_SECOND);
    runner.pump();
    expect(updates.at(-1)?.snapshot.turn).toBe(1);
    // A timer throttled for a minute runs one step on waking, not three hundred.
    clock.wait(60_000);
    runner.pump();
    expect(updates.at(-1)?.snapshot.turn).toBe(2);
  });

  it('needs a run before commands', () => {
    const { runner } = pacedSetup();
    expect(() => runner.send(BUMP)).toThrow('No run has been started');
  });
});

describe('host messages', () => {
  it('knows the speeds', () => {
    expect(SPEEDS).toEqual([0, 1, 2, 4, 8, 'max']);
    for (const speed of SPEEDS) expect(isSpeed(speed)).toBe(true);
    for (const bad of [3, 16, 'fast', null, undefined]) expect(isSpeed(bad)).toBe(false);
  });

  it('reads well-formed requests and says what is wrong with the rest', () => {
    expect(readHostRequest({ type: 'start', config: PARTY, seed: 4 })).toEqual({ type: 'start', config: PARTY, seed: 4 });
    expect(readHostRequest({ type: 'command', command: BUMP })).toEqual({ type: 'command', command: BUMP });
    const speed: Speed = 'max';
    expect(readHostRequest({ type: 'setSpeed', speed })).toEqual({ type: 'setSpeed', speed });
    expect(readHostRequest(null)).toBe('Not a message object');
    expect(readHostRequest({ type: 'start', seed: 1 })).toBe('start needs a config');
    expect(readHostRequest({ type: 'start', config: PARTY, seed: NaN })).toBe('start needs a numeric seed');
    expect(readHostRequest({ type: 'setSpeed', speed: 3 })).toBe('Unknown speed 3');
    expect(readHostRequest({ type: 'launch' })).toBe('Unknown message type "launch"');
  });
});
