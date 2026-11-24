/**
 * Console table formatting for headless run reports and `--party-sweep` tables.
 */
import { RUN_OUTCOMES, TURNS_PER_SECOND } from '../../src/sim';
import { DEFAULT_TURN_CAP, MAX_PARTY } from './config';
import { formatMixed } from './mixed';
import type { SeedResult } from './runner';
import { flagReason, PARTY_SWEEP_MIN_RATIO, partySweepWarnings, percent, summarizeReport } from './summary';
import type { PartySweepRow } from './summary';

function fmtWholeOrOne(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

  const s = summarizeReport(results);
  const summary = [
    `${s.runs} run${s.runs === 1 ? '' : 's'}: ${s.reachedBottom} reached the bottom`,
    ...(s.endedAbove > 0 ? [`${s.endedAbove} ended above it`] : []),
    ...(s.settledAbove > 0 ? [`${s.settledAbove} settled above it`] : []),
    `${s.hitCap} hit the turn cap`,
    ...(s.stalled > 0 ? [`${s.stalled} stalled`] : []),
    `${s.stuckRuns} triggered stuck detection`,
  ].join(', ');

  const ends = RUN_OUTCOMES.map((o) => [o, s.outcomes[o]] as const).filter(([, n]) => n > 0);
  const endLine = ends.length === 0 ? '' : `Run outcomes: ${ends.map(([o, n]) => `${n} ${o}`).join(', ')}.`;
  const returnTripPart =
    s.returnTripLethalityPct === null
      ? ''
      : ` Return-trip lethality (relic runs): ${s.returnTripLethalityPct.toFixed(1)}% (${s.relicReturnTripWipes}/${s.relicRuns}).`;
  const rateLine =
    s.runs === 0
      ? ''
      : `Outcome rates: win ${s.winRatePct.toFixed(1)}%, retreat ${s.retreatRatePct.toFixed(1)}%, wipe ${s.wipeRatePct.toFixed(1)}%.${returnTripPart}`;

  const turnLine =
    s.turnsDoneMean === null || s.turnsDoneMedian === null
      ? ''
      : `Turns to the bottom (done runs): mean ${Math.round(s.turnsDoneMean)}, min ${s.turnsDoneMin}, max ${s.turnsDoneMax}. Median: ${fmtWholeOrOne(s.turnsDoneMedian)}.`;
  const allTurnLine =
    s.turnsAllMean === null || s.turnsAllMedian === null
      ? ''
      : `Turns (all runs): mean ${Math.round(s.turnsAllMean)}, median ${fmtWholeOrOne(s.turnsAllMedian)}, min ${s.turnsAllMin}, max ${s.turnsAllMax}.`;

  const depthLine =
    s.depthMean === null || s.depthMedian === null || s.turnsPerFloorMean === null
      ? ''
      : `Depth reached: mean ${s.depthMean.toFixed(1)}, min ${s.depthMin}, max ${s.depthMax}. ` +
        `Turns per floor: mean ${Math.round(s.turnsPerFloorMean)}, max ${s.turnsPerFloorMax}. ` +
        `Median depth: ${s.depthMedian.toFixed(1)}, floor 3+: ${s.floor3PlusRatePct.toFixed(1)}% (${s.floor3PlusCount}/${s.runs}).`;

  const levelLine =
    s.levelMean === null || s.levelMedian === null
      ? ''
      : `Party level (highest member): mean ${s.levelMean.toFixed(2)}, median ${fmtWholeOrOne(s.levelMedian)} (min ${s.levelMin}, max ${s.levelMax}).` +
        (s.memberLevelMean === null ? '' : ` Member level (mean of members): mean ${s.memberLevelMean.toFixed(2)}.`);

  const lootLine =
    s.itemsMean === null || s.goldMean === null
      ? ''
      : `Items picked up per run: mean ${s.itemsMean.toFixed(1)}, max ${s.itemsMax}. ` +
        `Gold per run: mean ${s.goldMean.toFixed(1)}, max ${s.goldMax}.`;

  const masteryLine =
    s.masteryXpMean === null
      ? ''
      : `Class Mastery XP per run: mean ${s.masteryXpMean.toFixed(0)}` +
        (s.masteryXpWinMedian === null ? '.' : `, victory median ${fmtWholeOrOne(s.masteryXpWinMedian)}.`);

  const causeText = Object.entries(s.deathCauses)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([cause, n]) => `${cause} ${n}`)
    .join(', ');
  const combatLine =
    s.killsMean === null || s.deathsPerRun === null
      ? ''
      : `Kills per run: mean ${s.killsMean.toFixed(1)}. ` +
        `Deaths: ${s.deathsTotal}${s.deathsTotal === 0 ? '' : ` (${causeText})`}. Deaths per run: ${s.deathsPerRun.toFixed(2)}.`;

  const renownLine =
    s.renownBankedMean === null || s.renownPerHour1x === null
      ? ''
      : `Renown banked per run: mean ${s.renownBankedMean.toFixed(1)}, ${s.renownPerHour1x.toFixed(1)}/hr at 1x (${TURNS_PER_SECOND} steps/s).`;

  const mixedText = formatMixed(s.mixed);

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
    ...(rateLine === '' ? [] : [rateLine]),
    ...(turnLine === '' ? [] : [turnLine]),
    ...(allTurnLine === '' ? [] : [allTurnLine]),
    ...(depthLine === '' ? [] : [depthLine]),
    ...(levelLine === '' ? [] : [levelLine]),
    ...(lootLine === '' ? [] : [lootLine]),
    ...(combatLine === '' ? [] : [combatLine]),
    ...(renownLine === '' ? [] : [renownLine]),
    ...(masteryLine === '' ? [] : [masteryLine]),
    ...(mixedText === '' ? [] : [mixedText]),
    flagged.length === 0 ? 'Flagged seeds: none.' : `Flagged seeds:\n${flagged.join('\n')}`,
  ].join('\n');
}

/** The sweep as a table plus a warning line per broken rule (or "ordering holds"). */
export function formatPartySweep(rows: readonly PartySweepRow[]): string {
  const fmt = (n: number | null, digits = 1) => (n === null ? '-' : n.toFixed(digits));
  const header = ['party', 'runs', 'win %', 'retreat %', 'wipe %', 'level (highest)', 'level (member mean)', 'deaths/run'];
  const body = rows.map((r) => [
    String(r.size),
    String(r.runs),
    fmt(r.winRatePct),
    fmt(r.retreatRatePct),
    fmt(r.wipeRatePct),
    fmt(r.levelHighest, 2),
    fmt(r.levelMember, 2),
    fmt(r.deathsPerRun, 2),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => (row[i] as string).length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padStart(widths[i] as number)).join('  ');
  const warnings = partySweepWarnings(rows);
  return [
    line(header),
    ...body.map(line),
    '',
    ...(warnings.length === 0
      ? [`Party-size ordering holds: win rate rises with every adventurer and party ${MAX_PARTY} wins at least ${PARTY_SWEEP_MIN_RATIO}x as often as solo.`]
      : warnings.map((w) => `WARNING: ${w}`)),
  ].join('\n');
}
