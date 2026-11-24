/**
 * The sim's core contract (docs/ARCHITECTURE.md §3.1 and §10): the same seed and the same commands
 * give the same state, and a save taken mid-run carries on exactly as if it had never been taken.
 */
import { describe, expect, it } from 'vitest';
import { createRun, deserialize, serialize, stateHash, step } from '../../src/sim';
import type { Command, EntityId, RunConfig, RunState, SimEvent } from '../../src/sim';

const CONFIG: RunConfig = {
  party: [
    { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
    { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
  ],
  // A short floor turn cap sends the party down the stairs within the run, so floors are built
  // mid-run and the party sometimes splits across them.
  depth: 3,
  floorTurnCap: 30,
  // Recover the relic (ETH-024): the relic placed on the bottom floor, its pickup and the contract state.
  contracts: ['contract.recover_relic'],
  // Timed statuses with triggers, stacking and a speed change, so their ticking, expiry and
  // effects are covered by the hash and save checks (ETH-057).
  partyStatuses: [
    { status: 'status.hasted', turns: 30 },
    { status: 'status.regenerating', turns: 12 },
    { status: 'status.poisoned', turns: 5 },
    { status: 'status.poisoned', turns: 8, potency: 2 },
    { status: 'status.dazzled', turns: 50 },
  ],
  // Run-wide modifiers (ETH-115): a monster-side one that ends when the party leaves the first
  // floor, and a party-side one with a reward bonus and a flag that ends on a turn.
  runModifiers: [
    { key: 'test.swift_dark', source: { id: 'status.hasted', label: 'Swift Dark' }, scope: 'monsters', bundle: 'status.hasted', until: { floor: 'd1' } },
    { key: 'test.boon', source: { id: 'status.regenerating', label: 'Boon' }, scope: 'party', bundle: 'status.regenerating', potency: 0.5, flags: ['test.flag'], rewardBonus: 0.3, until: { turn: 60 } },
  ],
};

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Party turns per run: long enough for two explorers to cover most of a floor. */
const STEPS = 100;

/** Take a state hash every this many steps, as well as at the end. */
const CHECK_EVERY = 20;

/**
 * The commands sent before step `i`: player actions for both members, one that may fail (a move
 * into whatever is east), and a malformed one that is rejected. The same for every seed.
 */
function commandsAt(state: RunState, i: number): Command[] {
  const [a, b] = state.party as [EntityId, EntityId];
  switch (i) {
    case 3:
      return [{ type: 'playerAction', actor: a, action: { id: 'wait' } }];
    case 8:
      return [{ type: 'playerAction', actor: b, action: { id: 'move', dir: { x: 1, y: 0 } } }];
    case 12:
      return [{ type: 'nonsense' } as unknown as Command];
    // Late enough that the party is below the first floor and can't walk out before the last check.
    case 85:
      return [{ type: 'retreat' }];
    case 20:
      return [{ type: 'playerAction', actor: a, action: { id: 'stairs', dir: 'down' } }];
    case 41:
      return [
        { type: 'playerAction', actor: a, action: { id: 'move', dir: { x: 0, y: 1 } } },
        { type: 'playerAction', actor: b, action: { id: 'wait' } },
      ];
    default:
      return [];
  }
}

interface Played {
  /** Every step's events, in order. */
  events: SimEvent[][];
  /** The state hash every `CHECK_EVERY` steps and after the last. */
  hashes: string[];
}

/** Runs steps `from` up to (not including) `to` on `state`, sending `commandsAt` before each. */
function play(state: RunState, from: number, to: number): Played {
  const played: Played = { events: [], hashes: [] };
  for (let i = from; i < to; i++) {
    played.events.push(step(state, commandsAt(state, i)));
    if ((i + 1) % CHECK_EVERY === 0 || i + 1 === to) played.hashes.push(stateHash(state));
  }
  return played;
}

describe('determinism', () => {
  it(`gives the same state hash for the same seed and commands, for ${SEEDS.length} seeds`, () => {
    const finals = new Set<string>();
    for (const seed of SEEDS) {
      const first = play(createRun(CONFIG, seed), 0, STEPS);
      const second = play(createRun(CONFIG, seed), 0, STEPS);
      expect(second.hashes, `seed ${seed}`).toEqual(first.hashes);
      expect(second.events, `seed ${seed}`).toEqual(first.events);
      // The run moved on between checks, so equal hashes are not just an unchanging state.
      expect(new Set(first.hashes).size, `seed ${seed}`).toBe(first.hashes.length);
      finals.add(first.hashes.at(-1) as string);
    }
    // Different seeds make different runs.
    expect(finals.size).toBe(SEEDS.length);
  });

  it('exercises the commands it sends', () => {
    const { events } = play(createRun(CONFIG, 3), 0, STEPS);
    const all = events.flat();
    expect(all.some((e) => e.type === 'commandRejected')).toBe(true);
    expect(all.some((e) => e.type === 'turnedBack' && e.reason === 'ordered')).toBe(true);
    // The run goes down the stairs, building a floor mid-run (seed 3: the party finds them within the steps).
    expect(all.some((e) => e.type === 'floorEntered' && e.firstVisit)).toBe(true);
    // A command changes the run: the same seed without them ends somewhere else.
    const quiet = createRun(CONFIG, 3);
    for (let i = 0; i < STEPS; i++) step(quiet, []);
    expect(stateHash(quiet)).not.toBe(play(createRun(CONFIG, 3), 0, STEPS).hashes.at(-1));
  });

  it('continues a run saved and loaded mid-run exactly like one never interrupted', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const whole = play(createRun(CONFIG, seed), 0, STEPS);
      // Before the first step, just before a step that sends commands, and late.
      for (const split of [0, 41, 83]) {
        const before = createRun(CONFIG, seed);
        play(before, 0, split);
        const loaded = deserialize(serialize(before));
        const after = play(loaded, split, STEPS);
        expect(after.events, `seed ${seed}, saved after ${split} steps`).toEqual(whole.events.slice(split));
        expect(after.hashes.at(-1), `seed ${seed}, saved after ${split} steps`).toBe(whole.hashes.at(-1));
      }
    }
  });
});
