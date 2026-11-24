/**
 * The per-class and per-race breakdown for a mixed party (`--recruits`, ETH-178): who was
 * fielded, who died and what Mastery XP they earned. Only runs with `SeedResult.members` count.
 */
import type { SeedResult } from './runner';

/** One class's or race's row. */
export interface MixedRow {
  id: string;
  /** Party members of it over all runs. */
  fielded: number;
  /** How many of them died. */
  deaths: number;
  /**
   * Mastery XP. A class's is what its Mastery earned (members' shares plus the run-end bonus);
   * a race's is the sum of its members' shares, as the bonus belongs to the class.
   */
  masteryXp: number;
}

/** The breakdown, rows sorted by id. */
export interface MixedSummary {
  classes: MixedRow[];
  races: MixedRow[];
}

function rows(table: Map<string, MixedRow>): MixedRow[] {
  return [...table.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The breakdown over `results`, or `undefined` when no run fielded a mixed party (no `--recruits`). */
export function summarizeMixed(results: readonly SeedResult[]): MixedSummary | undefined {
  const classes = new Map<string, MixedRow>();
  const races = new Map<string, MixedRow>();
  const row = (table: Map<string, MixedRow>, id: string): MixedRow => {
    let r = table.get(id);
    if (r === undefined) table.set(id, (r = { id, fielded: 0, deaths: 0, masteryXp: 0 }));
    return r;
  };
  let any = false;
  for (const result of results) {
    if (result.members === undefined) continue;
    any = true;
    for (const m of result.members) {
      const c = row(classes, m.classId);
      const r = row(races, m.raceId);
      c.fielded++;
      r.fielded++;
      if (m.died) {
        c.deaths++;
        r.deaths++;
      }
      r.masteryXp += m.masteryXp;
    }
    for (const [classId, xp] of Object.entries(result.classXp ?? {})) row(classes, classId).masteryXp += xp;
  }
  return any ? { classes: rows(classes), races: rows(races) } : undefined;
}

function table(title: string, list: readonly MixedRow[]): string[] {
  const header = [title, 'fielded', 'deaths', 'deaths/member', 'Mastery XP', 'XP/member'];
  const body = list.map((r) => [
    r.id,
    String(r.fielded),
    String(r.deaths),
    (r.deaths / r.fielded).toFixed(2),
    String(r.masteryXp),
    (r.masteryXp / r.fielded).toFixed(1),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => (row[i] as string).length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] as number) : c.padStart(widths[i] as number))).join('  ').trimEnd();
  return [line(header), ...body.map(line)];
}

/** The breakdown as console text (empty when there is none). */
export function formatMixed(summary: MixedSummary | undefined): string {
  if (summary === undefined) return '';
  return [
    'Mixed party breakdown (members over all runs):',
    ...table('class', summary.classes),
    '',
    ...table('race', summary.races),
    "Class Mastery XP includes the run-end bonus; race Mastery XP is the members' shares only.",
  ].join('\n');
}
