import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineHost } from '../../src/sim';
import type { Command, RunConfig, SimEvent, Snapshot } from '../../src/sim';
import { serveSim } from '../../src/ui/host/serve';
import type { ServePort } from '../../src/ui/host/serve';
import { WorkerHost } from '../../src/ui/host/workerHost';
import type { WorkerPort } from '../../src/ui/host/workerHost';

const hero = (name: string) => ({ name, classId: 'class.vanguard', raceId: 'race.human' });
const PARTY: RunConfig = { party: [hero('Brannoc'), hero('Ysolde')] };
const SEED = 5;
const BUMP: Command = { type: 'playerAction', actor: 1, action: { id: 'wait' } };

/**
 * A `WorkerHost` talking to `serveSim` over a `MessageChannel`, which posts with structured clone
 * just as a real worker does. Node has no Web Workers; the browser build runs the same code in one.
 */
function connect() {
  const channel = new MessageChannel();
  serveSim(channel.port2 as unknown as ServePort);
  const host = new WorkerHost(channel.port1 as unknown as WorkerPort);
  const events: SimEvent[] = [];
  const snapshots: Snapshot[] = [];
  const errors: string[] = [];
  host.onEvents((batch) => events.push(...batch));
  host.onSnapshot((s) => snapshots.push(s));
  host.onError((message) => errors.push(message));
  open.push(() => {
    host.dispose();
    channel.port2.close();
  });
  const latest = () => snapshots.at(-1);
  return { host, events, snapshots, errors, latest };
}

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('WorkerHost', () => {
  it('starts paused with a first snapshot, runs at max and stops when paused', async () => {
    const { host, snapshots, latest } = connect();
    host.setSpeed(0);
    host.start(PARTY, SEED);
    await vi.waitFor(() => expect(snapshots).toHaveLength(1));
    expect(latest()?.turn).toBe(0);
    expect(latest()?.floor.terrain).toBeInstanceOf(Uint8Array);

    host.setSpeed('max');
    await vi.waitFor(() => expect(latest()?.turn).toBeGreaterThan(100));
    host.setSpeed(0);
    await sleep(50);
    const paused = latest()?.turn;
    const count = snapshots.length;
    await sleep(100);
    expect(latest()?.turn).toBe(paused);
    expect(snapshots).toHaveLength(count);
  });

  it('steps at a timed speed', async () => {
    const { host, latest } = connect();
    host.start(PARTY, SEED);
    host.setSpeed(8);
    await vi.waitFor(() => expect(latest()?.turn).toBeGreaterThanOrEqual(3), { timeout: 2000 });
    host.setSpeed(0);
  });

  it('gives the same events as the inline host for the same seed and commands', async () => {
    const { host, events, latest } = connect();
    host.start(PARTY, SEED);
    host.send(BUMP);
    host.setSpeed('max');
    await vi.waitFor(() => expect(latest()?.turn).toBeGreaterThan(150));
    host.setSpeed(0);
    await sleep(50);
    const last = latest() as Snapshot;

    const inline = new InlineHost();
    const expected: SimEvent[] = [];
    let inlineLast: Snapshot | undefined;
    inline.onEvents((batch) => expected.push(...batch));
    inline.onSnapshot((s) => (inlineLast = s));
    inline.start(PARTY, SEED);
    inline.send(BUMP);
    inline.run(last.turn);
    expect(events).toEqual(expected);
    expect(last).toEqual(inlineLast);
  });

  it('reports bad requests and sim errors without stopping', async () => {
    const { host, errors, snapshots } = connect();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (host as unknown as { worker: WorkerPort }).worker.postMessage({ type: 'nonsense' } as never);
    await vi.waitFor(() => expect(errors).toEqual(['Unknown message type "nonsense"']));
    host.start({ party: [] }, 1);
    await vi.waitFor(() => expect(errors).toContain('A run needs at least one adventurer'));
    host.start(PARTY, SEED);
    await vi.waitFor(() => expect(snapshots).toHaveLength(1));
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });

  it('pauses the run when it reports an error', async () => {
    const { host, errors, latest } = connect();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    host.start(PARTY, SEED);
    host.setSpeed('max');
    await vi.waitFor(() => expect(latest()?.turn).toBeGreaterThan(50));
    (host as unknown as { worker: WorkerPort }).worker.postMessage({ type: 'nonsense' } as never);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    await sleep(50);
    const stopped = latest()?.turn;
    await sleep(100);
    expect(latest()?.turn).toBe(stopped);
    logged.mockRestore();
  });

  it('refuses commands before a run and anything after dispose', () => {
    const { host } = connect();
    expect(() => host.send(BUMP)).toThrow('No run has been started');
    host.dispose();
    expect(() => host.setSpeed(1)).toThrow('This host has been disposed');
  });
});
