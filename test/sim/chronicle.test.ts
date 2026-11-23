/**
 * The run chronicle (ETH-120): which events are moments, the cap that drops the least notable
 * first, `track.chronicle` in the run state and `RunResult.extras`, its invariant, and a fixed-seed
 * run long enough that its first highlight falls out of the UI's event buffer but not the chronicle.
 */
import { describe, expect, it } from 'vitest';
import {
  addChronicleEntry,
  CHRONICLE_KINDS,
  CHRONICLE_LIMIT,
  CHRONICLE_RULES,
  CHRONICLE_TRACKER,
  chronicleEntriesOf,
  checkInvariants,
  createRun,
  depthOfFloor,
  runResult,
  step,
  topMoments,
} from '../../src/sim';
import type { Chronicle, ChronicleEntry, ChronicleRules, RunConfig, RunState, SimEvent } from '../../src/sim';
import { EVENT_BUFFER_SIZE, useSimStore } from '../../src/ui/stores/simStore';

const entry = (kind: string, turn: number): ChronicleEntry => ({
  kind,
  turn,
  floor: 'd1',
  pos: { x: 1, y: 1 },
  depth: 1,
  actors: [1],
  ids: [],
});

const CONFIG: RunConfig = {
  party: [
    { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
    { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
  ],
  depth: 4,
  floorTurnCap: 200,
};

/** Steps a run to its end (or `cap` steps), checking the invariants now and then. */
function playOut(state: RunState, cap = 4000): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < cap && state.domains.run.end === null; i++) {
    all.push(...step(state, []));
    if (i % 100 === 0) expect(checkInvariants(state)).toEqual([]);
  }
  expect(checkInvariants(state)).toEqual([]);
  return all;
}

const chronicleOf = (state: RunState) => state.domains.run.trackers[CHRONICLE_TRACKER.id] as Chronicle;

describe('chronicle rules', () => {
  it('register every kind once, with a priority, and a rule for each highlighted event type', () => {
    expect([...CHRONICLE_KINDS.keys()].sort()).toEqual(
      ['adventurerFell', 'contractComplete', 'earningsLost', 'leveledUp', 'nearDeath', 'oodSighted', 'stuck', 'valuableFind'].sort(),
    );
    for (const kind of CHRONICLE_KINDS.values()) expect(Number.isFinite(kind.priority)).toBe(true);
    for (const type of ['stuck', 'leveledUp', 'attacked', 'monsterSighted', 'pickedUp', 'contractCompleted', 'fell', 'earningsLost']) {
      expect(CHRONICLE_RULES.has(type), type).toBe(true);
    }
  });

  it('are typed per event type, so a rule only sees its own event', () => {
    const ok: ChronicleRules = { leveledUp: (e) => (e.level > 1 ? entry('leveledUp', e.turn) : null) };
    // @ts-expect-error: `waited` events have no `level`.
    const bad: ChronicleRules = { waited: (e) => (e.level > 1 ? null : null) };
    expect([ok, bad]).toHaveLength(2);
  });

  it('turn notable events into entries and leave the rest out', () => {
    const level: SimEvent = {
      type: 'leveledUp',
      turn: 40,
      actor: 1,
      name: 'Mira',
      classId: 'class.vanguard',
      level: 3,
      gains: {},
      floor: 'd2',
      pos: { x: 4, y: 5 },
    };
    expect(chronicleEntriesOf(level)).toEqual([
      { kind: 'leveledUp', turn: 40, floor: 'd2', pos: { x: 4, y: 5 }, depth: 2, actors: [1], ids: ['class.vanguard'], amount: 3 },
    ]);
    const cheap: SimEvent = { type: 'pickedUp', turn: 5, actor: 1, item: 'item.x', qty: 1, value: 1, floor: 'd1', pos: { x: 1, y: 1 } };
    expect(chronicleEntriesOf(cheap)).toEqual([]);
    expect(chronicleEntriesOf({ ...cheap, value: 500 })).toMatchObject([{ kind: 'valuableFind', amount: 500, ids: ['item.x'] }]);
    const blow = (hp: number, targetDef = 'adventurer'): SimEvent => ({
      type: 'attacked',
      turn: 9,
      actor: 5,
      actorDef: 'monster.x',
      target: 1,
      targetDef,
      damage: 3,
      hp,
      maxHp: 20,
      floor: 'd1',
      pos: { x: 2, y: 2 },
    });
    expect(chronicleEntriesOf(blow(10))).toEqual([]);
    expect(chronicleEntriesOf(blow(3))).toMatchObject([{ kind: 'nearDeath', actors: [1, 5], ids: ['monster.x'], amount: 3 }]);
    expect(chronicleEntriesOf({ type: 'waited', turn: 1, actor: 1 })).toEqual([]);
    const wipe: SimEvent = { type: 'earningsLost', turn: 99, lost: { renown: 3 }, atRisk: { renown: 12 }, share: 0.25, depth: 4 };
    expect(chronicleEntriesOf(wipe)).toEqual([
      { kind: 'earningsLost', turn: 99, floor: null, pos: null, depth: 4, actors: [], ids: [], amount: 25 },
    ]);
  });

  it('read the depth from a main-line floor id', () => {
    expect(depthOfFloor('d7')).toBe(7);
    expect(depthOfFloor('f1')).toBe(0);
  });
});

describe('the chronicle cap', () => {
  it('drops the earliest lowest-priority entry, never the first or the newest', () => {
    let c: Chronicle = { entries: [] };
    c = addChronicleEntry(c, entry('stuck', 1), 4);
    c = addChronicleEntry(c, entry('leveledUp', 2), 4);
    c = addChronicleEntry(c, entry('stuck', 3), 4);
    c = addChronicleEntry(c, entry('adventurerFell', 4), 4);
    const before = c;
    c = addChronicleEntry(c, entry('nearDeath', 5), 4);
    // The first stuck (turn 1) is the run's first entry, so the stuck on turn 3 goes.
    expect(c.entries.map((e) => e.turn)).toEqual([1, 2, 4, 5]);
    expect(before.entries).toHaveLength(4);
    // A new low-priority entry is kept; the older one of its kind goes.
    c = addChronicleEntry(c, entry('stuck', 6), 4);
    expect(c.entries.map((e) => e.turn)).toEqual([1, 2, 4, 6]);
    c = addChronicleEntry(c, entry('adventurerFell', 7), 4);
    expect(c.entries.map((e) => e.kind)).toEqual(['stuck', 'leveledUp', 'adventurerFell', 'adventurerFell']);
  });

  it('keeps at most CHRONICLE_LIMIT entries', () => {
    let c: Chronicle = CHRONICLE_TRACKER.init();
    for (let t = 0; t < CHRONICLE_LIMIT + 50; t++) c = addChronicleEntry(c, entry(t === 10 ? 'adventurerFell' : 'stuck', t));
    expect(c.entries).toHaveLength(CHRONICLE_LIMIT);
    expect(c.entries[0]?.turn).toBe(0);
    expect(c.entries.at(-1)?.turn).toBe(CHRONICLE_LIMIT + 49);
    expect(c.entries.some((e) => e.kind === 'adventurerFell')).toBe(true);
  });

  it('picks the most notable moments, in the order they happened', () => {
    const entries = [entry('stuck', 1), entry('adventurerFell', 2), entry('leveledUp', 3), entry('nearDeath', 4), entry('leveledUp', 5)];
    expect(topMoments(entries, 3).map((e) => e.turn)).toEqual([2, 3, 5]);
    expect(topMoments(entries, 0)).toEqual([]);
  });
});

describe('track.chronicle in a run', () => {
  it('flags an out-of-order or unknown entry', () => {
    const state = createRun({ ...CONFIG, monsters: false }, 3);
    state.turn = 50;
    state.domains.run.trackers[CHRONICLE_TRACKER.id] = { entries: [entry('stuck', 9), entry('stuck', 4)] };
    expect(checkInvariants(state).join('\n')).toMatch(/out of order/);
    state.domains.run.trackers[CHRONICLE_TRACKER.id] = { entries: [entry('nonsense', 4)] };
    expect(checkInvariants(state).join('\n')).toMatch(/unknown kind/);
  });

  it(`keeps the first highlight of a run longer than ${EVENT_BUFFER_SIZE} events, in the result and in simStore`, () => {
    const state = createRun(CONFIG, 11);
    const events = playOut(state);
    const chronicle = chronicleOf(state);
    const first = chronicle.entries[0] as ChronicleEntry;
    expect(first).toBeDefined();
    // The moment's event is more than a buffer's length before the end.
    const firstIndex = events.findIndex((e) => chronicleEntriesOf(e).length > 0);
    expect(events.length - firstIndex).toBeGreaterThan(EVENT_BUFFER_SIZE);
    expect(chronicleEntriesOf(events[firstIndex] as SimEvent)[0]).toEqual(first);

    expect((runResult(state).extras[CHRONICLE_TRACKER.id] as ChronicleEntry[])[0]).toEqual(first);

    const store = useSimStore.getState();
    store.reset();
    for (let i = 0; i < events.length; i += 37) store.receiveEvents(events.slice(i, i + 37));
    const after = useSimStore.getState();
    expect(after.events.some((e) => e.event === events[firstIndex])).toBe(false);
    expect(after.chronicle.entries[0]).toEqual(first);
    expect(after.chronicle).toEqual(chronicle);
    store.reset();
  });
});
