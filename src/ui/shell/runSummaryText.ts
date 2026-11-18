/**
 * Wording and figures for the run summary (`RunSummary.tsx`), kept apart from the components so
 * they can be tested on their own.
 */
import { CURRENCY_INFO } from '../../meta';
import { DEITIES } from '../../content';
import { favorDeity, RENOWN, TROPHIES } from '../../sim';
import type { FallenRecord, RunOutcome, RunReport } from '../../sim';

/** Each outcome's heading and icon, so it never rests on color alone. */
export const OUTCOME_LOOK: Readonly<Record<RunOutcome, { title: string; icon: string }>> = {
  victory: { title: 'Victory', icon: '★' },
  retreat: { title: 'Retreat', icon: '⇡' },
  wipe: { title: 'Wipe', icon: '✝' },
};

/** A currency id's name: Renown, Trophies, or "Favor (Dawn)" for `favor:<deity>`. */
export function currencyName(key: string): string {
  if (key === RENOWN) return CURRENCY_INFO.renown.name;
  if (key === TROPHIES) return CURRENCY_INFO.trophies.name;
  const deity = favorDeity(key);
  if (deity === null) return key;
  return `${CURRENCY_INFO.favor.name} (${DEITIES.has(deity) ? DEITIES.get(deity).name : deity})`;
}

export interface CurrencyRow {
  key: string;
  /** Earned this run, before any wipe loss. */
  atRisk: number;
  /** Lost to a wipe (ETH-023). */
  lost: number;
  /** What went into the banked total. */
  banked: number;
}

/** One row per currency earned or lost. Renown and Trophies always show. */
export function currencyRows(report: RunReport): CurrencyRow[] {
  const { atRisk, lost } = report.result;
  const keys = [...new Set([RENOWN, TROPHIES, ...Object.keys(atRisk), ...Object.keys(lost)])];
  return keys.map((key) => {
    const earned = atRisk[key] ?? 0;
    const gone = lost[key] ?? 0;
    return { key, atRisk: earned, lost: gone, banked: earned - gone };
  });
}

/** Who fell this run, from the deaths tracker (`extras['track.deaths']`). */
export function fallenOf(report: RunReport): readonly FallenRecord[] {
  const deaths = report.result.extras['track.deaths'] as { fallen?: FallenRecord[] } | undefined;
  return deaths?.fallen ?? [];
}

/** The content ids the Codex tracker discovered this run (`extras['track.codex']`, ETH-065). */
export function discoveriesOf(report: RunReport): string[] {
  const codex = report.result.extras['track.codex'];
  return typeof codex === 'object' && codex !== null ? Object.keys(codex) : [];
}

/** A placeholder epitaph until the lineage system writes real ones (M5, CLAUDE.md §7). */
export function epitaph(report: RunReport): string {
  const last = fallenOf(report).at(-1);
  if (report.end.outcome === 'wipe' && last !== undefined) return `Here lies ${last.name}, who went no further than floor ${last.depth}.`;
  if (report.end.outcome === 'victory') return 'They went down, did what was asked, and came back up to tell of it.';
  return `They went as deep as floor ${report.end.depth} and lived to say so.`;
}
