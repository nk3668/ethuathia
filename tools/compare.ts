/**
 * Before/after comparison of headless run reports (docs/ARCHITECTURE.md §11), for
 * `npm run sim -- --compare <git-ref>` and `--baseline <file>`.
 *
 * A report is saved as JSON (`--json <file>`): the arguments it ran with and every seed's
 * `SeedResult`. `--compare` makes the "before" report by checking the ref out into a temporary
 * git worktree under `.sim-compare/` in this checkout (so it finds this checkout's
 * `node_modules` by walking up), running that ref's own `tools/sim.ts` there, and removing the
 * worktree again. Refs from before `--json` existed are read from their printed table instead.
 *
 * To add a metric, add a row to `METRICS`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { floorTurns } from './headless';
import type { Outcome, SeedResult } from './headless';

/** Bumped when the shape of `SimReport` changes. */
export const REPORT_VERSION = 1;

/** The arguments a report was made with; only reports with equal ones compare seed by seed. */
export interface ReportArgs {
  from: number;
  seeds: number;
  cap: number;
  party: number;
}

/** What `--json` writes. */
export interface SimReport {
  version: number;
  args: ReportArgs;
  results: SeedResult[];
}

export function makeReport(args: ReportArgs, results: SeedResult[]): SimReport {
  return { version: REPORT_VERSION, args: { from: args.from, seeds: args.seeds, cap: args.cap, party: args.party }, results };
}

/** Reads a report written by `--json`. Throws a readable `Error` if it isn't one. */
export function parseReport(text: string, source: string): SimReport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${source} is not JSON: ${(error as Error).message}`, { cause: error });
  }
  const report = data as Partial<SimReport>;
  if (report.version !== REPORT_VERSION || !Array.isArray(report.results) || typeof report.args !== 'object') {
    throw new Error(`${source} is not a sim report (version ${REPORT_VERSION})`);
  }
  return report as SimReport;
}

const ROW = /^\s*(\d+)\s+(\d+)\s+(?:(\d+)\/(\d+)\s+)?(\d+(?:\.\d+)?)%\s+(-|\d+)\s+(done|idle|cap|stalled)\s+(\S+)\s*$/;

/**
 * Reads the per-seed rows of the printed report (`formatReport`), for refs made before `--json`.
 * Fields the table doesn't show (`steps`, the explored tile counts, the first stuck turn, the
 * per-floor results) are 0, null or left out; so is the depth column, missing before ETH-058.
 */
export function parseReportText(text: string): SeedResult[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const m = ROW.exec(line);
    if (m === null) return [];
    const [, seed, turns, depth, bottom, explored, stuck, outcome, hash] = m as unknown as (string | undefined)[];
    return [
      {
        seed: Number(seed),
        outcome: outcome as Outcome,
        turns: Number(turns),
        ...(depth === undefined ? {} : { depth: Number(depth), bottom: Number(bottom) }),
        steps: 0,
        explored: { seen: 0, total: 0, fraction: Number(explored) / 100 },
        stuck: { count: stuck === '-' ? 0 : Number(stuck), firstTurn: null },
        hash: hash as string,
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------
// Metrics

export interface Metric {
  name: string;
  /** The value over a whole report, or `null` when it has none (a mean of nothing). */
  value(results: readonly SeedResult[]): number | null;
  /** Decimal places to print. */
  digits: number;
}

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const doneTurns = (rs: readonly SeedResult[]) => rs.filter((r) => r.outcome === 'done').map((r) => r.turns);
const countOf = (o: Outcome) => (rs: readonly SeedResult[]) => rs.filter((r) => r.outcome === o).length;

/** The rows of the comparison table. Later items add deaths, currency per hour and so on. */
export const METRICS: Metric[] = [
  { name: 'runs', value: (rs) => rs.length, digits: 0 },
  { name: 'done (bottom)', value: countOf('done'), digits: 0 },
  { name: 'settled above bottom', value: countOf('idle'), digits: 0 },
  { name: 'hit turn cap', value: countOf('cap'), digits: 0 },
  { name: 'stalled', value: countOf('stalled'), digits: 0 },
  { name: 'runs with stuck', value: (rs) => rs.filter((r) => r.stuck.count > 0).length, digits: 0 },
  { name: 'stuck events', value: (rs) => rs.reduce((n, r) => n + r.stuck.count, 0), digits: 0 },
  { name: 'turns, mean (done)', value: (rs) => mean(doneTurns(rs)), digits: 1 },
  { name: 'turns, min (done)', value: (rs) => (doneTurns(rs).length === 0 ? null : Math.min(...doneTurns(rs))), digits: 0 },
  { name: 'turns, max (done)', value: (rs) => (doneTurns(rs).length === 0 ? null : Math.max(...doneTurns(rs))), digits: 0 },
  { name: 'explored %, mean', value: (rs) => mean(rs.map((r) => r.explored.fraction * 100)), digits: 1 },
  // Reports from before ETH-058 ran one floor, so their depth is 1.
  { name: 'depth, mean', value: (rs) => mean(rs.map((r) => r.depth ?? 1)), digits: 2 },
  { name: 'depth, max', value: (rs) => (rs.length === 0 ? null : Math.max(...rs.map((r) => r.depth ?? 1))), digits: 0 },
  { name: 'turns per floor, mean', value: (rs) => mean(floorTurns(rs)), digits: 1 },
];

function fmt(value: number | null, digits: number): string {
  return value === null ? '-' : value.toFixed(digits);
}

function delta(before: number | null, after: number | null, digits: number): string {
  if (before === null || after === null) return '-';
  const d = after - before;
  if (Number(d.toFixed(digits)) === 0) return '0';
  const sign = d > 0 ? '+' : '';
  const pct = before === 0 ? '' : ` (${sign}${((d / before) * 100).toFixed(1)}%)`;
  return `${sign}${d.toFixed(digits)}${pct}`;
}

/**
 * The before/after table: one row per metric with its delta, then which seeds ended in a
 * different state (by state hash). Warns when the two reports ran with different arguments.
 */
export function formatComparison(before: SimReport, after: SimReport, labels = { before: 'before', after: 'after' }): string {
  const header = ['metric', labels.before, labels.after, 'delta'];
  const rows = METRICS.map((m) => {
    const b = m.value(before.results);
    const a = m.value(after.results);
    return [m.name, fmt(b, m.digits), fmt(a, m.digits), delta(b, a, m.digits)];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] as string).length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] as number) : c.padStart(widths[i] as number))).join('  ').trimEnd();

  const beforeBySeed = new Map(before.results.map((r) => [r.seed, r]));
  const shared = after.results.filter((r) => beforeBySeed.has(r.seed));
  const changed = shared.filter((r) => beforeBySeed.get(r.seed)?.hash !== r.hash).map((r) => r.seed);
  const out = [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line), ''];
  out.push(
    changed.length === 0
      ? `State hashes: all ${shared.length} shared seeds end the same (no behavior change).`
      : `State hashes: ${changed.length} of ${shared.length} shared seeds end differently: ${changed.slice(0, 20).join(', ')}${changed.length > 20 ? ', ...' : ''}.`,
  );
  const a = JSON.stringify(before.args);
  const b = JSON.stringify(after.args);
  if (a !== b) out.push(`Warning: the reports ran with different arguments (${labels.before} ${a}, ${labels.after} ${b}).`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Running another git ref

/** This checkout's root: the folder above `tools/`. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where temporary worktrees go. Inside the checkout so they find its `node_modules`; git-ignored. */
export const COMPARE_DIR = join(REPO_ROOT, '.sim-compare');

function git(args: string[], cwd = REPO_ROOT): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error !== undefined) throw new Error(`Could not run git: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${r.stderr.trim()}`);
  return r.stdout.trim();
}

/** The arguments to pass the ref's `tools/sim.ts` for `args`. */
function simArgv(args: ReportArgs): string[] {
  return ['--seeds', String(args.seeds), '--from', String(args.from), '--cap', String(args.cap), '--party', String(args.party)];
}

/**
 * Runs the headless harness of git ref `ref` with `args` and returns its report. The ref is
 * checked out (detached) into a temporary worktree, run with this checkout's `tsx` and
 * `node_modules`, and the worktree is removed afterwards, even on failure. Throws a readable
 * `Error` if the ref doesn't exist or its harness fails.
 */
export function runRef(ref: string, args: ReportArgs): SimReport {
  const sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (sha === '') throw new Error(`Unknown git ref "${ref}"`);
  mkdirSync(COMPARE_DIR, { recursive: true });
  const dir = join(COMPARE_DIR, `${sha.slice(0, 12)}-${process.pid}`);
  git(['worktree', 'add', '--detach', dir, sha]);
  try {
    const tsx = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const out = join(dir, 'sim-report.json');
    const run = (extra: string[]) =>
      spawnSync(process.execPath, [tsx, 'tools/sim.ts', ...simArgv(args), ...extra], {
        cwd: dir,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
    const withJson = run(['--json', out]);
    if (withJson.status === 0 && existsSync(out)) return parseReport(readFileSync(out, 'utf8'), `${ref}'s report`);
    if (withJson.status === 2 && /--json/.test(withJson.stderr)) {
      // A ref from before --json: read its printed table instead.
      const plain = run([]);
      if (plain.status !== 0) throw new Error(`${ref}'s harness failed:\n${plain.stderr.trim()}`);
      const results = parseReportText(plain.stdout);
      if (results.length !== args.seeds) throw new Error(`Could not read ${ref}'s report table:\n${plain.stdout}`);
      return makeReport(args, results);
    }
    throw new Error(`${ref}'s harness failed (exit ${withJson.status}):\n${withJson.stderr.trim()}`);
  } finally {
    try {
      git(['worktree', 'remove', '--force', dir]);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      git(['worktree', 'prune']);
    }
    try {
      rmdirSync(COMPARE_DIR); // Only if empty: another compare may be running.
    } catch {
      // Not empty, or already gone.
    }
  }
}
