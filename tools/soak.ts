/**
 * The soak (docs/ARCHITECTURE.md §11): many seeded runs played to a turn cap, with every state
 * invariant (`checkInvariants`) checked after every step, a mid-run save and load that must carry
 * on exactly like the original, and limits on how often stuck detection may fire. It fails on any
 * throw. `test/sim/soak.test.ts` runs a small soak in `npm test`; `tools/run-soak.ts` is the
 * command line for bigger ones (`npm run soak -- --seeds N --cap T`).
 */
import { checkInvariants, createRun, deserialize, serialize, stateHash, step } from '../src/sim';
import type { RunState, SimEvent } from '../src/sim';
import { HEADLESS_CONTRACTS, headlessParty, MAX_PARTY } from './headless';

/**
 * The most `stuck` events one run may have before the soak calls it a stuck storm. When it was
 * set (ETH-056), seeds 1-200 at a 2000-step cap never fired stuck detection at all, so a few is
 * normal bad luck and more means the AI is looping on a goal it can't reach.
 */
export const MAX_STUCK_PER_RUN = 5;

/** Party turns per seed in the `npm test` soak: enough to explore most of a first floor. */
export const TEST_SOAK_CAP = 150;

/** Default party turns per seed on the command line: long past the point where a floor is done. */
export const DEFAULT_SOAK_CAP = 2000;

/**
 * Steps the saved-and-loaded copy is played alongside the original, comparing every step's
 * events. Its state hash is compared every `HASH_EVERY` steps and at the end of the window. A
 * window rather than the rest of the run keeps the soak fast; `test/sim/determinism.test.ts`
 * covers whole-run continuation.
 */
export const ROUND_TRIP_STEPS = 50;

/** How often, in steps, the copy's state hash is compared with the original's. */
export const HASH_EVERY = 25;

export interface SoakOptions {
  /** Party turns per seed. */
  cap: number;
  /** The step after which the run is saved and loaded. Default: half the cap. */
  roundTripAt?: number;
}

export interface SoakResult {
  seed: number;
  /** Party size: the soak cycles 1 to `MAX_PARTY` by seed. */
  party: number;
  /** Steps run. */
  steps: number;
  /** `RunState.turn` where the run stopped. */
  turn: number;
  /**
   * - `cap`: ran the full cap.
   * - `stalled`: a step got nowhere because nobody could act (not a failure: later, a wiped
   *   party ends the run this way).
   * - `ended`: the run ended (victory, retreat or wipe, ETH-062) before the cap.
   * - `failed`: see `failures`.
   */
  outcome: 'cap' | 'stalled' | 'ended' | 'failed';
  stuck: number;
  /** Monsters the party killed (ETH-060). */
  kills: number;
  /** Party members who fell (ETH-060). */
  deaths: number;
  /** Why the seed failed, as readable lines. Empty when it passed. */
  failures: string[];
  hash: string;
}

/** The party size the soak gives `seed`: 1, 2, 3, 4, 1, ... */
export function soakPartySize(seed: number): number {
  return 1 + (((seed - 1) % MAX_PARTY) + MAX_PARTY) % MAX_PARTY;
}

function message(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

const same = (a: readonly SimEvent[], b: readonly SimEvent[]) => JSON.stringify(a) === JSON.stringify(b);

/** Soaks one seed. Never throws: a throw from the sim becomes a failure. */
export function soakSeed(seed: number, options: SoakOptions): SoakResult {
  const party = soakPartySize(seed);
  const roundTripAt = options.roundTripAt ?? Math.floor(options.cap / 2);
  const failures: string[] = [];
  let outcome: SoakResult['outcome'] = 'cap';
  let stuck = 0;
  let kills = 0;
  let deaths = 0;
  let steps = 0;
  let state: RunState | null = null;
  /** The saved-and-loaded copy, stepped alongside `state` for `ROUND_TRIP_STEPS` from `roundTripAt`. */
  let twin: RunState | null = null;

  try {
    state = createRun({ party: headlessParty(party), contracts: [...HEADLESS_CONTRACTS] }, seed);
    const initial = checkInvariants(state);
    if (initial.length > 0) failures.push(...initial.map((p) => `after createRun: ${p}`));

    while (steps < options.cap && failures.length === 0) {
      if (steps === roundTripAt) {
        twin = deserialize(serialize(state));
        if (stateHash(twin) !== stateHash(state)) {
          failures.push(`step ${steps}: the loaded state hashes differently from the saved one`);
          break;
        }
      }
      const turn = state.turn;
      const events = step(state, []);
      steps++;
      if (events.length === 0 && state.turn === turn) {
        outcome = 'stalled';
        break;
      }
      stuck += events.filter((e) => e.type === 'stuck').length;
      kills += events.filter((e) => e.type === 'killed' && e.byParty).length;
      deaths += events.filter((e) => e.type === 'fell').length;
      const problems = checkInvariants(state);
      if (problems.length > 0) failures.push(...problems.map((p) => `step ${steps} (turn ${state?.turn}): ${p}`));

      if (twin !== null) {
        const twinEvents = step(twin, []);
        if (!same(events, twinEvents)) {
          failures.push(`step ${steps}: after a save and load at step ${roundTripAt}, the events differ`);
        } else {
          const along = steps - roundTripAt;
          const last = along >= ROUND_TRIP_STEPS;
          if ((along % HASH_EVERY === 0 || last) && stateHash(twin) !== stateHash(state)) {
            failures.push(`step ${steps}: after a save and load at step ${roundTripAt}, the state hash differs`);
          }
          if (last) twin = null;
        }
      }
      // The run is over (ETH-062): later steps do nothing.
      if (events.some((e) => e.type === 'runEnded')) {
        outcome = 'ended';
        break;
      }
    }
    if (twin !== null && failures.length === 0 && stateHash(twin) !== stateHash(state)) {
      failures.push(`step ${steps}: after a save and load at step ${roundTripAt}, the state hash differs`);
    }
  } catch (error) {
    failures.push(`step ${steps + 1} threw: ${message(error)}`);
  }

  if (stuck > MAX_STUCK_PER_RUN) {
    failures.push(`stuck storm: stuck detection fired ${stuck} times (the limit is ${MAX_STUCK_PER_RUN})`);
  }
  let hash = '-';
  try {
    if (state !== null) hash = stateHash(state);
  } catch {
    // Already reported: a state that won't serialize breaks core.plainData.
  }
  return {
    seed,
    party,
    steps,
    turn: state?.turn ?? 0,
    outcome: failures.length > 0 ? 'failed' : outcome,
    stuck,
    kills,
    deaths,
    failures,
    hash,
  };
}

/** Soaks `count` seeds in a row from `from`. */
export function soakSeeds(from: number, count: number, options: SoakOptions): SoakResult[] {
  return Array.from({ length: count }, (_, i) => soakSeed(from + i, options));
}

/** Every failure, one line each, prefixed with its seed. Empty when the soak passed. */
export function soakFailures(results: readonly SoakResult[]): string[] {
  return results.flatMap((r) => r.failures.map((f) => `seed ${r.seed} (party of ${r.party}): ${f}`));
}

/** The soak as text: a summary line, then every failure. */
export function formatSoakReport(results: readonly SoakResult[], cap: number): string {
  const failed = results.filter((r) => r.outcome === 'failed');
  const stalled = results.filter((r) => r.outcome === 'stalled');
  const stuckRuns = results.filter((r) => r.stuck > 0);
  const maxStuck = Math.max(0, ...results.map((r) => r.stuck));
  const steps = results.reduce((sum, r) => sum + r.steps, 0);
  const lines = [
    `${results.length} seeds at a cap of ${cap} party turns (${steps} steps): ${results.length - failed.length} passed, ${failed.length} failed.`,
    `Ended: ${results.filter((r) => r.outcome === 'ended').length}. Stalled: ${stalled.length}. Runs with stuck detection: ${stuckRuns.length} (most in one run: ${maxStuck}, limit ${MAX_STUCK_PER_RUN}).`,
    `Kills: ${results.reduce((n, r) => n + r.kills, 0)}. Party members fallen: ${results.reduce((n, r) => n + r.deaths, 0)}.`,
  ];
  const failures = soakFailures(results);
  lines.push(failures.length === 0 ? 'Failures: none.' : `Failures:\n${failures.map((f) => `  ${f}`).join('\n')}`);
  return lines.join('\n');
}
