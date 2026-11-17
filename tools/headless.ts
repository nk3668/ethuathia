/**
 * Headless runs (docs/ARCHITECTURE.md §10): runs seeded floors with no UI through `SimSession`,
 * the same loop the hosts use, and reports how each went. The seed of the balance harness: in M1
 * it grows depth, death causes and currency per hour. `tools/sim.ts` is the command line for it
 * (`npm run sim -- --seeds N`); `test/tools/headless.test.ts` runs it in the test suite.
 */
import { parseArgs } from 'node:util';
import { CLASS_VANGUARD, RACE_HUMAN } from '../src/content';
import { ACT_WAIT, DROP_TURNS, SimSession } from '../src/sim';
import type { AdventurerConfig, Explored, RunConfig, Snapshot } from '../src/sim';

/** Party turns a floor may take before the run is stopped. The slowest of seeds 1–100 takes about 280. */
export const DEFAULT_TURN_CAP = 1000;

/** The most adventurers a party can have (CLAUDE.md §2). */
export const MAX_PARTY = 4;

const NAMES = ['Brannoc', 'Mira', 'Oren', 'Tamsin'] as const;

/** A party of `size` adventurers. M0 has one class and one race, so they all share them. */
export function headlessParty(size: number): AdventurerConfig[] {
  return NAMES.slice(0, size).map((name) => ({ name, classId: CLASS_VANGUARD.id, raceId: RACE_HUMAN.id }));
}

export interface HeadlessOptions {
  /** Party turns before giving up on the floor. Default `DEFAULT_TURN_CAP`. */
  cap?: number;
  /** Default: one adventurer. */
  party?: AdventurerConfig[];
}

/**
 * How one seed's floor went.
 * - `done`: the party ran out of places to explore and settled.
 * - `cap`: still going after `cap` party turns.
 * - `stalled`: a step got nowhere because nobody could act.
 */
export type Outcome = 'done' | 'cap' | 'stalled';

export interface SeedResult {
  seed: number;
  outcome: Outcome;
  /**
   * Game turns (`RunState.turn`) taken: up to the turn the party settled when `done`, else up to
   * where the run stopped.
   */
  turns: number;
  /** Party turns (steps) run, including the ones spent confirming the party had settled. */
  steps: number;
  explored: Explored;
  /** How many times stuck detection dropped a goal, and the turn it first did. */
  stuck: { count: number; firstTurn: number | null };
  /** `stateHash` of where the run stopped, to tell whether a change altered behavior. */
  hash: string;
}

/**
 * Whether every living party member is on the baseline's `act.wait`, which it falls to when
 * there is nothing left to explore. It also waits while stuck detection has dropped its goal,
 * so `runSeed` only counts the party as settled once it has waited longer than a drop lasts.
 */
function idle(snap: Snapshot): boolean {
  const living = snap.party.filter((m) => m.alive);
  return living.length > 0 && living.every((m) => m.intent?.action === ACT_WAIT.id);
}

/** Runs one seed's first floor until the party settles, the cap is hit or the run stalls. */
export function runSeed(seed: number, options: HeadlessOptions = {}): SeedResult {
  const cap = options.cap ?? DEFAULT_TURN_CAP;
  const config: RunConfig = { party: options.party ?? headlessParty(1) };
  const session = new SimSession(config, seed);
  const stuck: SeedResult['stuck'] = { count: 0, firstTurn: null };
  let outcome: Outcome = 'cap';
  let idleSince: number | null = null;
  let steps = 0;
  let snap = session.snapshot();

  while (steps < cap) {
    const { events, progressed } = session.step();
    for (const e of events) {
      if (e.type !== 'stuck') continue;
      stuck.count++;
      stuck.firstTurn ??= e.turn;
    }
    if (!progressed) {
      outcome = 'stalled';
      break;
    }
    steps++;
    snap = session.snapshot();
    if (!idle(snap)) {
      idleSince = null;
      continue;
    }
    idleSince ??= snap.turn;
    // A dropped goal comes back after DROP_TURNS, so waiting longer than that means it is over.
    if (snap.turn - idleSince > DROP_TURNS) {
      outcome = 'done';
      break;
    }
  }

  return {
    seed,
    outcome,
    turns: outcome === 'done' && idleSince !== null ? idleSince : snap.turn,
    steps,
    explored: snap.floor.explored,
    stuck,
    hash: session.stateHash(),
  };
}

/** Runs `count` seeds in a row from `from`. */
export function runSeeds(from: number, count: number, options: HeadlessOptions = {}): SeedResult[] {
  return Array.from({ length: count }, (_, i) => runSeed(from + i, options));
}

/** Why a seed needs a look, or `null` if it went fine. */
export function flagReason(result: SeedResult, cap = DEFAULT_TURN_CAP): string | null {
  const reasons: string[] = [];
  if (result.outcome === 'cap') reasons.push(`hit the turn cap (${cap} party turns) at ${percent(result.explored)} explored`);
  if (result.outcome === 'stalled') reasons.push(`stalled on turn ${result.turns}: nobody could act`);
  const { count, firstTurn } = result.stuck;
  if (count > 0) reasons.push(`stuck detection fired ${count} time${count === 1 ? '' : 's'} (first on turn ${firstTurn})`);
  return reasons.length === 0 ? null : reasons.join('; ');
}

function percent(e: Explored): string {
  return `${(e.fraction * 100).toFixed(1)}%`;
}

/** The report as text, for the console: one row per seed, a summary, then the flagged seeds. */
export function formatReport(results: readonly SeedResult[], cap = DEFAULT_TURN_CAP): string {
  const header = ['seed', 'turns', 'explored', 'stuck', 'result', 'state hash'];
  const rows = results.map((r) => [
    String(r.seed),
    String(r.turns),
    percent(r.explored),
    r.stuck.count === 0 ? '-' : String(r.stuck.count),
    r.outcome,
    r.hash,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] as string).length)));
  // Numbers line up on the right, words on the left.
  const line = (cells: string[]) =>
    cells.map((c, i) => (i < 4 ? c.padStart(widths[i] as number) : c.padEnd(widths[i] as number))).join('  ').trimEnd();

  const done = results.filter((r) => r.outcome === 'done');
  const turns = done.map((r) => r.turns);
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const summary = [
    `${results.length} floor${results.length === 1 ? '' : 's'}: ${done.length} done`,
    `${count('cap')} hit the turn cap`,
    ...(count('stalled') > 0 ? [`${count('stalled')} stalled`] : []),
    `${results.filter((r) => r.stuck.count > 0).length} triggered stuck detection`,
  ].join(', ');
  const turnLine =
    turns.length === 0
      ? ''
      : `Turns to explore (done floors): mean ${Math.round(turns.reduce((a, b) => a + b, 0) / turns.length)}, ` +
        `min ${Math.min(...turns)}, max ${Math.max(...turns)}.`;

  const flagged = results.flatMap((r) => {
    const reason = flagReason(r, cap);
    return reason === null ? [] : [`  seed ${r.seed}: ${reason}`];
  });

  return [
    line(header),
    ...rows.map(line),
    '',
    `${summary}.`,
    ...(turnLine === '' ? [] : [turnLine]),
    flagged.length === 0 ? 'Flagged seeds: none.' : `Flagged seeds:\n${flagged.join('\n')}`,
  ].join('\n');
}

export interface SimArgs {
  /** The first seed. */
  from: number;
  /** How many seeds (one floor each) to run. */
  seeds: number;
  cap: number;
  party: number;
  help: boolean;
}

export const USAGE = `Usage: npm run sim -- [--seeds N] [--from S] [--cap T] [--party P]

Runs N seeded floors headlessly and reports, per seed, the turns taken, how much of the floor
was explored and the final state hash. Seeds that hit the turn cap or trigger stuck detection
are listed at the end.

  --seeds N   how many seeds to run (default 10)
  --from S    the first seed (default 1)
  --cap T     party turns allowed per floor (default ${DEFAULT_TURN_CAP})
  --party P   adventurers in the party, 1 to ${MAX_PARTY} (default 1)
  --help      show this text`;

/** Reads the command line. Throws an `Error` with a readable message on a bad argument. */
export function parseSimArgs(argv: readonly string[]): SimArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      seeds: { type: 'string', short: 'n' },
      from: { type: 'string' },
      cap: { type: 'string' },
      party: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  return {
    seeds: int('--seeds', values.seeds, 10, 1),
    from: int('--from', values.from, 1, 0),
    cap: int('--cap', values.cap, DEFAULT_TURN_CAP, 1),
    party: int('--party', values.party, 1, 1, MAX_PARTY),
    help: values.help ?? false,
  };
}

function int(name: string, raw: string | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be a whole number from ${min}${max === Number.MAX_SAFE_INTEGER ? ' up' : ` to ${max}`}, got "${raw}"`);
  }
  return n;
}
