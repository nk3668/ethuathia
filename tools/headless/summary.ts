/**
 * Headless run aggregation: flags anomalous seeds, summarizes sweep metrics, and evaluates party-size sweeps.
 */
import { TURNS_PER_SECOND } from '../../src/sim';
import type { Explored, RunOutcome } from '../../src/sim';
import { DEFAULT_TURN_CAP, MAX_PARTY } from './config';
import { summarizeMixed } from './mixed';
import type { MixedSummary } from './mixed';
import type { Outcome, SeedResult } from './runner';

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

/** Formats an explored fraction as a one-decimal percentage (internal to `tools/headless/*`). */
export function percent(e: Explored): string {
  return `${(e.fraction * 100).toFixed(1)}%`;
}

/** Game turns per floor over every floor of every result (one floor per result for old reports). */
export function floorTurns(results: readonly SeedResult[]): number[] {
  return results.flatMap((r) => r.floors?.map((f) => f.turns) ?? [r.turns]);
}

/** Party turns (steps) per hour of real time at 1× speed (`TURNS_PER_SECOND` steps/s). */
export const STEPS_PER_HOUR_AT_1X = TURNS_PER_SECOND * 3600;

/** Banked Renown of one run (`atRisk - lost`), or `null` for reports made before ETH-023. */
export function bankedRenown(r: SeedResult): number | null {
  if (r.lost === undefined) return null;
  return (r.atRisk?.renown ?? 0) - (r.lost.renown ?? 0);
}

/**
 * Banked Trophies of one run (ETH-161): at-risk Trophies minus the wipe loss, plus the exit
 * conversions (leftover gold, sold items, salvage), or `null` for reports made before ETH-023.
 */
export function bankedTrophies(r: SeedResult): number | null {
  if (r.lost === undefined) return null;
  return (r.atRisk?.trophies ?? 0) - (r.lost.trophies ?? 0) + (r.convertedTrophies ?? 0);
}

/**
 * Banked Renown per hour at 1× speed (`TURNS_PER_SECOND` steps/s), computed over all runs that
 * report banked Renown and took at least one step: total banked Renown divided by total hours.
 * Returns `null` when no runs have both banked Renown and elapsed steps.
 */
export function renownPerHour(results: readonly SeedResult[]): number | null {
  return perHour(results, bankedRenown);
}

/** Banked Trophies per hour at 1× speed, as `renownPerHour` (ETH-161). */
export function trophiesPerHour(results: readonly SeedResult[]): number | null {
  return perHour(results, bankedTrophies);
}

function perHour(results: readonly SeedResult[], bankedOf: (r: SeedResult) => number | null): number | null {
  let total = 0;
  let totalSteps = 0;
  let count = 0;
  for (const r of results) {
    const banked = bankedOf(r);
    if (banked === null || r.steps <= 0) continue;
    total += banked;
    totalSteps += r.steps;
    count++;
  }
  if (count === 0 || totalSteps === 0) return null;
  return (total / totalSteps) * STEPS_PER_HOUR_AT_1X;
}

/** Median of `values`, or `null` when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/** Aggregate difficulty and economy summary over a sweep of `SeedResult`s (`DIFFICULTY_PHILOSOPHY.md` §2 & §9). */
export interface ReportSummary {
  runs: number;
  reachedBottom: number;
  endedAbove: number;
  settledAbove: number;
  hitCap: number;
  stalled: number;
  stuckRuns: number;
  outcomes: Record<RunOutcome, number>;
  winRatePct: number;
  retreatRatePct: number;
  wipeRatePct: number;
  floor3PlusCount: number;
  floor3PlusRatePct: number;
  relicRuns: number;
  relicReturnTripWipes: number;
  returnTripLethalityPct: number | null;
  turnsDoneMean: number | null;
  turnsDoneMedian: number | null;
  turnsDoneMin: number | null;
  turnsDoneMax: number | null;
  turnsAllMean: number | null;
  turnsAllMedian: number | null;
  turnsAllMin: number | null;
  turnsAllMax: number | null;
  turnsPerFloorMean: number | null;
  turnsPerFloorMax: number | null;
  depthMean: number | null;
  depthMedian: number | null;
  depthMin: number | null;
  depthMax: number | null;
  levelMean: number | null;
  /** Mean over runs of the mean member level (ETH-145). */
  memberLevelMean: number | null;
  levelMedian: number | null;
  levelMin: number | null;
  levelMax: number | null;
  killsMean: number | null;
  deathsTotal: number;
  deathsPerRun: number | null;
  deathCauses: Record<string, number>;
  itemsMean: number | null;
  itemsMax: number | null;
  goldMean: number | null;
  goldMax: number | null;
  renownBankedMean: number | null;
  renownPerHour1x: number | null;
  /** Mean banked Trophies per run, exit conversions included (ETH-161). */
  trophiesBankedMean: number | null;
  trophiesPerHour1x: number | null;
  /** Median Class Mastery XP of a victory (ETH-087), the number its curve is calibrated on. */
  masteryXpWinMedian: number | null;
  masteryXpMean: number | null;
  /** Per-class and per-race breakdown; only when the party was mixed (`--recruits`, ETH-178). */
  mixed?: MixedSummary;
}

const avg = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Computes `ReportSummary` over `results`, leaving missing fields as `null`. */
export function summarizeReport(results: readonly SeedResult[]): ReportSummary {
  const runs = results.length;
  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const endCount = (o: RunOutcome) => results.filter((r) => r.end === o).length;
  const outcomes: Record<RunOutcome, number> = {
    victory: endCount('victory'),
    retreat: endCount('retreat'),
    wipe: endCount('wipe'),
  };
  const pct = (n: number) => (runs === 0 ? 0 : (n / runs) * 100);
  const floor3PlusCount = results.filter((r) => (r.depth ?? 1) >= 3).length;

  const tracksRelic = results.some((r) => r.relicTaken !== undefined);
  const relicRuns = tracksRelic ? results.filter((r) => r.relicTaken === true).length : 0;
  const relicReturnTripWipes = tracksRelic
    ? results.filter((r) => r.relicTaken === true && r.turnedBack === true && r.end === 'wipe').length
    : 0;
  const returnTripLethalityPct = relicRuns === 0 ? null : (relicReturnTripWipes / relicRuns) * 100;

  const doneTurns = results.filter((r) => r.outcome === 'done').map((r) => r.turns);
  const allTurns = results.map((r) => r.runTurns ?? r.turns);
  const perFloor = floorTurns(results);
  const depths = results.map((r) => r.depth ?? 1);
  const levels = results.flatMap((r) => (r.level === undefined ? [] : [r.level]));
  const picked = results.map((r) => r.items ?? 0);
  const gold = results.map((r) => r.gold ?? 0);
  const kills = results.map((r) => r.kills ?? 0);
  const deathsTotal = results.reduce((n, r) => n + (r.deaths ?? 0), 0);
  const deathCauses: Record<string, number> = {};
  for (const r of results) {
    for (const [cause, n] of Object.entries(r.deathCauses ?? {})) {
      deathCauses[cause] = (deathCauses[cause] ?? 0) + n;
    }
  }
  const banked = results.map(bankedRenown).filter((n): n is number => n !== null);
  const mixed = summarizeMixed(results);

  return {
    runs,
    reachedBottom: count('done'),
    endedAbove: count('early'),
    settledAbove: count('idle'),
    hitCap: count('cap'),
    stalled: count('stalled'),
    stuckRuns: results.filter((r) => r.stuck.count > 0).length,
    outcomes,
    winRatePct: pct(outcomes.victory),
    retreatRatePct: pct(outcomes.retreat),
    wipeRatePct: pct(outcomes.wipe),
    floor3PlusCount,
    floor3PlusRatePct: pct(floor3PlusCount),
    relicRuns,
    relicReturnTripWipes,
    returnTripLethalityPct,
    turnsDoneMean: avg(doneTurns),
    turnsDoneMedian: median(doneTurns),
    turnsDoneMin: doneTurns.length === 0 ? null : Math.min(...doneTurns),
    turnsDoneMax: doneTurns.length === 0 ? null : Math.max(...doneTurns),
    turnsAllMean: avg(allTurns),
    turnsAllMedian: median(allTurns),
    turnsAllMin: allTurns.length === 0 ? null : Math.min(...allTurns),
    turnsAllMax: allTurns.length === 0 ? null : Math.max(...allTurns),
    turnsPerFloorMean: avg(perFloor),
    turnsPerFloorMax: perFloor.length === 0 ? null : Math.max(...perFloor),
    depthMean: avg(depths),
    depthMedian: median(depths),
    depthMin: depths.length === 0 ? null : Math.min(...depths),
    depthMax: depths.length === 0 ? null : Math.max(...depths),
    levelMean: avg(levels),
    memberLevelMean: avg(results.flatMap((r) => (r.meanLevel === undefined ? [] : [r.meanLevel]))),
    levelMedian: median(levels),
    levelMin: levels.length === 0 ? null : Math.min(...levels),
    levelMax: levels.length === 0 ? null : Math.max(...levels),
    killsMean: avg(kills),
    deathsTotal,
    deathsPerRun: runs === 0 ? null : deathsTotal / runs,
    deathCauses,
    itemsMean: avg(picked),
    itemsMax: picked.length === 0 ? null : Math.max(0, ...picked),
    goldMean: avg(gold),
    goldMax: gold.length === 0 ? null : Math.max(0, ...gold),
    renownBankedMean: avg(banked),
    renownPerHour1x: renownPerHour(results),
    trophiesBankedMean: avg(results.map(bankedTrophies).filter((n): n is number => n !== null)),
    trophiesPerHour1x: trophiesPerHour(results),
    masteryXpWinMedian: median(results.flatMap((r) => (r.end === 'victory' && r.masteryXp !== undefined ? [r.masteryXp] : []))),
    masteryXpMean: avg(results.flatMap((r) => (r.masteryXp === undefined ? [] : [r.masteryXp]))),
    ...(mixed === undefined ? {} : { mixed }),
  };
}

/** One party size's row in a `--party-sweep` (ETH-145). */
export interface PartySweepRow {
  size: number;
  runs: number;
  winRatePct: number;
  retreatRatePct: number;
  wipeRatePct: number;
  /** Mean over runs of the highest member level. */
  levelHighest: number | null;
  /** Mean over runs of the mean member level. */
  levelMember: number | null;
  deathsPerRun: number | null;
}

/** Summarizes one party size's runs as a sweep row. */
export function partySweepRow(size: number, results: readonly SeedResult[]): PartySweepRow {
  const s = summarizeReport(results);
  return {
    size,
    runs: s.runs,
    winRatePct: s.winRatePct,
    retreatRatePct: s.retreatRatePct,
    wipeRatePct: s.wipeRatePct,
    levelHighest: s.levelMean,
    levelMember: s.memberLevelMean,
    deathsPerRun: s.deathsPerRun,
  };
}

/** How many times the biggest party must win as often as a lone adventurer (a target ETH-080 owns). */
export const PARTY_SWEEP_MIN_RATIO = 2;

/**
 * What is wrong with the party-size ordering (`docs/DIFFICULTY_PHILOSOPHY.md` Principle 6): win rate
 * must rise with every extra adventurer ("ordering broken", which fails ETH-145), and a party of 4
 * should win at least `PARTY_SWEEP_MIN_RATIO` times as often as a solo adventurer ("ratio not met",
 * a standing warning that ETH-080 clears). Empty when both hold.
 */
export function partySweepWarnings(rows: readonly PartySweepRow[]): string[] {
  const warnings: string[] = [];
  const sorted = [...rows].sort((a, b) => a.size - b.size);
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1] as PartySweepRow;
    const hi = sorted[i] as PartySweepRow;
    if (!(hi.winRatePct > lo.winRatePct)) {
      warnings.push(
        `ordering broken: party ${hi.size} wins ${hi.winRatePct.toFixed(1)}%, not more than party ${lo.size} at ${lo.winRatePct.toFixed(1)}%`,
      );
    }
  }
  const solo = sorted.find((r) => r.size === 1);
  const four = sorted.find((r) => r.size === MAX_PARTY);
  if (solo !== undefined && four !== undefined && four.winRatePct < PARTY_SWEEP_MIN_RATIO * solo.winRatePct) {
    warnings.push(
      `ratio not met: party ${MAX_PARTY} wins ${four.winRatePct.toFixed(1)}%, under ${PARTY_SWEEP_MIN_RATIO}x solo's ${solo.winRatePct.toFixed(1)}% (ETH-080 owns clearing this; it does not fail ETH-145)`,
    );
  }
  return warnings;
}
