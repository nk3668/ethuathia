/**
 * Headless runs (docs/ARCHITECTURE.md §10): runs seeded dungeons with no UI through `SimSession`,
 * the same loop the hosts use, and reports how each went: how deep the party got, the turns it
 * spent on each floor, and whether it settled at the bottom. The seed of the balance harness: in
 * M1 it grows death causes and currency per hour. `tools/sim.ts` is the command line for it
 * (`npm run sim -- --seeds N`); `test/tools/headless.test.ts` runs it in the test suite.
 */
import { parseArgs } from 'node:util';
import { CLASS_VANGUARD, RACE_HUMAN } from '../src/content';
import { ACT_WAIT, DROP_TURNS, floorIdAt, RUN_OUTCOMES, SimSession } from '../src/sim';
import type { AdventurerConfig, Explored, RewardAmounts, RunConfig, RunOutcome, Snapshot } from '../src/sim';

/**
 * Party turns a run may take before it is stopped. A lone adventurer takes about 200–300 party
 * turns a floor, so a ten-floor dungeon fits with room to spare.
 */
export const DEFAULT_TURN_CAP = 6000;

/** The most adventurers a party can have (CLAUDE.md §2). */
export const MAX_PARTY = 4;

const NAMES = ['Brannoc', 'Mira', 'Oren', 'Tamsin'] as const;

/** A party of `size` adventurers. M0 has one class and one race, so they all share them. */
export function headlessParty(size: number): AdventurerConfig[] {
  return NAMES.slice(0, size).map((name) => ({ name, classId: CLASS_VANGUARD.id, raceId: RACE_HUMAN.id }));
}

export interface HeadlessOptions {
  /** Party turns before giving up on the run. Default `DEFAULT_TURN_CAP`. */
  cap?: number;
  /** Default: one adventurer. */
  party?: AdventurerConfig[];
  /** Floors in the dungeon. Default: the run config's default (`DEFAULT_DEPTH`). */
  depth?: number;
}

/**
 * How one seed's run went.
 * - `done`: the party reached the bottom floor and the run ended (since ETH-062, by walking back
 *   out; before it, by settling on the bottom floor). `end` says how.
 * - `early`: the run ended without reaching the bottom (a wipe, or a retreat on the way down).
 * - `idle`: the party settled above the bottom floor, with nowhere left to go.
 * - `cap`: still going after `cap` party turns.
 * - `stalled`: a step got nowhere because nobody could act.
 */
export type Outcome = 'done' | 'early' | 'idle' | 'cap' | 'stalled';

/** One floor the party reached. */
export interface FloorResult {
  depth: number;
  /**
   * Game turns from the party's first arrival until the first member arrived on the next floor,
   * or until the run settled or stopped on the last floor reached.
   */
  turns: number;
  /** How much of it the party saw, from 0 to 1. */
  explored: number;
}

export interface SeedResult {
  seed: number;
  outcome: Outcome;
  /**
   * Game turns (`RunState.turn`) taken to get as deep as the party went: up to the turn it turned
   * back for the surface (or settled, before ETH-062), else up to where the run stopped. The
   * return trip is in `runTurns`.
   */
  turns: number;
  /** How the run ended (ETH-062), if it did. */
  end?: RunOutcome;
  /** Game turns until the run ended, return trip included. Only for runs that ended. */
  runTurns?: number;
  /** The run's at-risk currency when it stopped (currency id → amount). */
  atRisk?: RewardAmounts;
  /** What a wipe took from `atRisk` (ETH-023); empty otherwise. Missing from reports before ETH-023. */
  lost?: RewardAmounts;
  /** Party turns (steps) run, including the ones spent confirming the party had settled. */
  steps: number;
  /** How much of the last floor reached the party saw. */
  explored: Explored;
  /** The deepest floor reached. Missing from reports made before ETH-058 (one floor). */
  depth?: number;
  /** How many floors the dungeon has. */
  bottom?: number;
  /** Each floor reached, from the first. */
  floors?: FloorResult[];
  /** Items (stacks) the party picked up, gold piles not counted. Missing from reports before ETH-061. */
  items?: number;
  /** Gold in the party's purse at the end. Missing from reports before ETH-061. */
  gold?: number;
  /** How many times stuck detection dropped a goal, and the turn it first did. */
  stuck: { count: number; firstTurn: number | null };
  /** Monsters killed. Missing from reports made before ETH-060. */
  kills?: number;
  /** Party members who died. Missing from reports made before ETH-060. */
  deaths?: number;
  /** What killed them: the killer's def (`other` for a status or anything else) → deaths. */
  deathCauses?: Record<string, number>;
  /** Draughts drunk from fountains (ETH-072). */
  drinks?: number;
  /** The party's highest level where the run stopped (ETH-034). Missing from older reports. */
  level?: number;
  /** `stateHash` of where the run stopped, to tell whether a change altered behavior. */
  hash: string;
}

/**
 * Whether every living party member is on the baseline's `act.wait`, which it falls to when
 * there is nothing left to explore and no way further down. It also waits while stuck detection
 * has dropped its goal, so `runSeed` only counts the party as settled once it has waited longer
 * than a drop lasts.
 */
function idle(snap: Snapshot): boolean {
  const living = snap.party.filter((m) => m.alive);
  return living.length > 0 && living.every((m) => m.intent?.action === ACT_WAIT.id);
}

/** Runs one seed until the party settles, the cap is hit or the run stalls. */
export function runSeed(seed: number, options: HeadlessOptions = {}): SeedResult {
  const cap = options.cap ?? DEFAULT_TURN_CAP;
  const config: RunConfig = { party: options.party ?? headlessParty(1), ...(options.depth === undefined ? {} : { depth: options.depth }) };
  const session = new SimSession(config, seed);
  const stuck: SeedResult['stuck'] = { count: 0, firstTurn: null };
  /** The game turn each depth was first reached on. */
  const reached = new Map<number, number>([[1, 0]]);
  let outcome: Outcome = 'cap';
  let idleSince: number | null = null;
  let turnedBack: number | null = null;
  let end: { outcome: RunOutcome; turn: number } | null = null;
  let steps = 0;
  let items = 0;
  let snap = session.snapshot();

  let kills = 0;
  let deaths = 0;
  let drinks = 0;
  const deathCauses: Record<string, number> = {};
  /** Who killed each party member struck down, until their `fell` event. */
  const slain = new Map<number, string>();

  while (steps < cap) {
    const { events, progressed } = session.step();
    for (const e of events) {
      if (e.type === 'floorEntered' && !reached.has(e.depth)) reached.set(e.depth, e.turn);
      if (e.type === 'turnedBack') turnedBack ??= e.turn;
      if (e.type === 'runEnded') end = { outcome: e.outcome, turn: e.turn };
      if (e.type === 'pickedUp') items++;
      if (e.type === 'killed') {
        if (e.byParty) kills++;
        else slain.set(e.victim, e.killerDef);
      }
      if (e.type === 'drankFountain') drinks++;
      if (e.type === 'fell') {
        deaths++;
        const cause = slain.get(e.actor) ?? 'other';
        deathCauses[cause] = (deathCauses[cause] ?? 0) + 1;
      }
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
    if (end !== null) {
      outcome = snap.domains.floors.deepest === snap.domains.floors.depth ? 'done' : 'early';
      break;
    }
    if (!idle(snap)) {
      idleSince = null;
      continue;
    }
    idleSince ??= snap.turn;
    // A dropped goal comes back after DROP_TURNS, so waiting longer than that means it is over.
    if (snap.turn - idleSince > DROP_TURNS) {
      outcome = snap.domains.floors.deepest === snap.domains.floors.depth ? 'done' : 'idle';
      break;
    }
  }

  const settled = end === null && (outcome === 'done' || outcome === 'idle');
  const turns = end !== null ? (turnedBack ?? end.turn) : settled && idleSince !== null ? idleSince : (turnedBack ?? snap.turn);
  const depths = [...reached.keys()].sort((a, b) => a - b);
  const floors = depths.map((depth, i): FloorResult => {
    const next = reached.get(depths[i + 1] ?? -1);
    const start = reached.get(depth) ?? 0;
    return {
      depth,
      turns: (next ?? turns) - start,
      explored: session.snapshot({ floor: floorIdAt(depth) }).floor.explored.fraction,
    };
  });
  return {
    seed,
    outcome,
    turns,
    steps,
    explored: snap.floor.explored,
    depth: snap.domains.floors.deepest,
    bottom: snap.domains.floors.depth,
    floors,
    items,
    gold: snap.domains.items.gold,
    stuck,
    kills,
    deaths,
    deathCauses,
    drinks,
    level: Math.max(1, ...Object.values(snap.domains.stats.members).map((m) => m.level.level)),
    hash: session.stateHash(),
    ...(end === null ? {} : { end: end.outcome, runTurns: end.turn }),
    atRisk: { ...snap.domains.run.atRisk },
    lost: { ...(session.report()?.result.lost ?? {}) },
  };
}

/** Runs `count` seeds in a row from `from`. */
export function runSeeds(from: number, count: number, options: HeadlessOptions = {}): SeedResult[] {
  return Array.from({ length: count }, (_, i) => runSeed(from + i, options));
}

/** Why a seed needs a look, or `null` if it went fine. */
export function flagReason(result: SeedResult, cap = DEFAULT_TURN_CAP): string | null {
  const reasons: string[] = [];
  const where = `floor ${result.depth ?? 1} of ${result.bottom ?? 1}`;
  if (result.outcome === 'cap') reasons.push(`hit the turn cap (${cap} party turns) on ${where} at ${percent(result.explored)} explored`);
  if (result.outcome === 'idle') reasons.push(`settled on ${where} with no way further down`);
  if (result.outcome === 'early') reasons.push(`ended (${result.end ?? '?'}) on turn ${result.runTurns ?? result.turns} without reaching the bottom (${where})`);
  if (result.outcome === 'stalled') reasons.push(`stalled on turn ${result.turns}: nobody could act`);
  const { count, firstTurn } = result.stuck;
  if (count > 0) reasons.push(`stuck detection fired ${count} time${count === 1 ? '' : 's'} (first on turn ${firstTurn})`);
  return reasons.length === 0 ? null : reasons.join('; ');
}

function percent(e: Explored): string {
  return `${(e.fraction * 100).toFixed(1)}%`;
}

/** Game turns per floor over every floor of every result (one floor per result for old reports). */
export function floorTurns(results: readonly SeedResult[]): number[] {
  return results.flatMap((r) => r.floors?.map((f) => f.turns) ?? [r.turns]);
}

/** The report as text, for the console: one row per seed, a summary, then the flagged seeds. */
export function formatReport(results: readonly SeedResult[], cap = DEFAULT_TURN_CAP): string {
  const header = ['seed', 'turns', 'depth', 'explored', 'stuck', 'result', 'state hash'];
  const rows = results.map((r) => [
    String(r.seed),
    String(r.turns),
    `${r.depth ?? 1}/${r.bottom ?? 1}`,
    percent(r.explored),
    r.stuck.count === 0 ? '-' : String(r.stuck.count),
    r.end === undefined ? r.outcome : `${r.outcome} (${r.end})`,
    r.hash,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => (row[i] as string).length)));
  // Numbers line up on the right, words on the left.
  const line = (cells: string[]) =>
    cells.map((c, i) => (i < 5 ? c.padStart(widths[i] as number) : c.padEnd(widths[i] as number))).join('  ').trimEnd();

  const done = results.filter((r) => r.outcome === 'done');
  const turns = done.map((r) => r.turns);
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const summary = [
    `${results.length} run${results.length === 1 ? '' : 's'}: ${done.length} reached the bottom`,
    ...(count('early') > 0 ? [`${count('early')} ended above it`] : []),
    ...(count('idle') > 0 ? [`${count('idle')} settled above it`] : []),
    `${count('cap')} hit the turn cap`,
    ...(count('stalled') > 0 ? [`${count('stalled')} stalled`] : []),
    `${results.filter((r) => r.stuck.count > 0).length} triggered stuck detection`,
  ].join(', ');
  const mean = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const turnLine =
    turns.length === 0
      ? ''
      : `Turns to the bottom (done runs): mean ${mean(turns)}, min ${Math.min(...turns)}, max ${Math.max(...turns)}.`;
  const perFloor = floorTurns(results);
  const depths = results.map((r) => r.depth ?? 1);
  const depthLine =
    `Depth reached: mean ${(depths.reduce((a, b) => a + b, 0) / Math.max(1, depths.length)).toFixed(1)}, ` +
    `min ${Math.min(...depths)}, max ${Math.max(...depths)}. ` +
    `Turns per floor: mean ${mean(perFloor)}, max ${Math.max(...perFloor)}.`;

  const ends = RUN_OUTCOMES.map((o) => [o, results.filter((r) => r.end === o).length] as const).filter(([, n]) => n > 0);
  const endLine = ends.length === 0 ? '' : `Run outcomes: ${ends.map(([o, n]) => `${n} ${o}`).join(', ')}.`;
  const picked = results.map((r) => r.items ?? 0);
  const gold = results.map((r) => r.gold ?? 0);
  const lootLine =
    `Items picked up per run: mean ${(picked.reduce((a, b) => a + b, 0) / Math.max(1, picked.length)).toFixed(1)}, ` +
    `max ${Math.max(0, ...picked)}. Gold per run: mean ${(gold.reduce((a, b) => a + b, 0) / Math.max(1, gold.length)).toFixed(1)}, max ${Math.max(0, ...gold)}.`;

  const kills = results.map((r) => r.kills ?? 0);
  const deaths = results.reduce((n, r) => n + (r.deaths ?? 0), 0);
  const causes = new Map<string, number>();
  for (const r of results) for (const [cause, n] of Object.entries(r.deathCauses ?? {})) causes.set(cause, (causes.get(cause) ?? 0) + n);
  const causeText = [...causes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cause, n]) => `${cause} ${n}`)
    .join(', ');
  const combatLine =
    `Kills per run: mean ${(kills.reduce((a, b) => a + b, 0) / Math.max(1, kills.length)).toFixed(1)}. ` +
    `Deaths: ${deaths}${deaths === 0 ? '' : ` (${causeText})`}.`;

  const flagged = results.flatMap((r) => {
    const reason = flagReason(r, cap);
    return reason === null ? [] : [`  seed ${r.seed}: ${reason}`];
  });

  return [
    line(header),
    ...rows.map(line),
    '',
    `${summary}.`,
    ...(endLine === '' ? [] : [endLine]),
    ...(turnLine === '' ? [] : [turnLine]),
    ...(results.length === 0 ? [] : [depthLine, lootLine, combatLine]),
    flagged.length === 0 ? 'Flagged seeds: none.' : `Flagged seeds:\n${flagged.join('\n')}`,
  ].join('\n');
}

export interface SimArgs {
  /** The first seed. */
  from: number;
  /** How many seeds (one run each) to run. */
  seeds: number;
  cap: number;
  party: number;
  /** Write the report as JSON to this file (`--json`). */
  json: string | null;
  /** Compare with the report in this file (`--baseline`). */
  baseline: string | null;
  /** Compare with the same run on this git ref (`--compare`). */
  compare: string | null;
  help: boolean;
}

export const USAGE = `Usage: npm run sim -- [--seeds N] [--from S] [--cap T] [--party P]
                      [--json FILE] [--compare REF | --baseline FILE]

Runs N seeded runs headlessly, each until the party settles on the bottom floor or the cap is
hit, and reports per seed the turns taken, the depth reached, how much of the last floor was
explored and the final state hash, then the turns per floor. Seeds that hit the turn cap, settle
above the bottom or trigger stuck detection are listed at the end.

  --seeds N        how many seeds to run (default 10)
  --from S         the first seed (default 1)
  --cap T          party turns allowed per run (default ${DEFAULT_TURN_CAP})
  --party P        adventurers in the party, 1 to ${MAX_PARTY} (default 1)
  --json FILE      also write the report as JSON, to keep as a baseline
  --compare REF    run the same seeds on git ref REF (e.g. origin/main) and print a
                   before/after table of the report metrics
  --baseline FILE  print the before/after table against a report saved with --json
  --help           show this text`;

/** Reads the command line. Throws an `Error` with a readable message on a bad argument. */
export function parseSimArgs(argv: readonly string[]): SimArgs {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      seeds: { type: 'string', short: 'n' },
      from: { type: 'string' },
      cap: { type: 'string' },
      party: { type: 'string' },
      json: { type: 'string' },
      compare: { type: 'string' },
      baseline: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.compare !== undefined && values.baseline !== undefined) {
    throw new Error('Use --compare or --baseline, not both');
  }
  return {
    seeds: int('--seeds', values.seeds, 10, 1),
    from: int('--from', values.from, 1, 0),
    cap: int('--cap', values.cap, DEFAULT_TURN_CAP, 1),
    party: int('--party', values.party, 1, 1, MAX_PARTY),
    json: values.json ?? null,
    compare: values.compare ?? null,
    baseline: values.baseline ?? null,
    help: values.help ?? false,
  };
}

/** Reads a whole-number option, or `fallback` when absent. Throws a readable `Error` when out of range. */
export function int(name: string, raw: string | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be a whole number from ${min}${max === Number.MAX_SAFE_INTEGER ? ' up' : ` to ${max}`}, got "${raw}"`);
  }
  return n;
}
