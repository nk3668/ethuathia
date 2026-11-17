/**
 * Meta's side of the `RunResult` (defined by the sim's run domain, `src/sim/run/result.ts`):
 * checking one before it is banked, and turning its flat reward amounts into `Currencies`.
 */
import { favorDeity, RENOWN, RUN_OUTCOMES, TROPHIES } from '../sim';
import type { RewardAmounts, RunResult } from '../sim';
import type { Currencies } from './currencies';

/** `amounts` (keyed `renown`, `trophies`, `favor:<deity id>`) as `Currencies`. Unknown keys are ignored. */
export function currenciesFromRewards(amounts: Readonly<RewardAmounts>): Currencies {
  const favor: Record<string, number> = {};
  for (const [key, n] of Object.entries(amounts)) {
    const deity = favorDeity(key);
    if (deity !== null && n > 0) favor[deity] = (favor[deity] ?? 0) + n;
  }
  return { renown: amounts[RENOWN] ?? 0, trophies: amounts[TROPHIES] ?? 0, favor };
}

const DEITY_ID = /^deity\.[a-z][a-z0-9_]*$/;

/** Problems with a `RunResult`, one line each, or an empty list if it is sound. */
export function checkRunResult(result: RunResult): string[] {
  const problems: string[] = [];
  if (!RUN_OUTCOMES.includes(result.outcome)) problems.push(`outcome "${String(result.outcome)}" is not a run outcome`);
  for (const field of ['turns', 'deepestDepth'] as const) {
    const n = result[field];
    if (!Number.isInteger(n) || n < 0) problems.push(`${field} is ${n}, not a whole number of 0 or more`);
  }
  for (const field of ['atRisk', 'lost'] as const) {
    for (const [key, n] of Object.entries(result[field])) {
      const deity = favorDeity(key);
      if (key !== RENOWN && key !== TROPHIES && (deity === null || !DEITY_ID.test(deity))) {
        problems.push(`${field}.${key} is not a currency id (renown, trophies or favor:deity.<id>)`);
      }
      if (!Number.isFinite(n) || n < 0) problems.push(`${field}.${key} is ${n}, not a finite amount of 0 or more`);
    }
  }
  for (const [key, n] of Object.entries(result.lost)) {
    if (n > (result.atRisk[key] ?? 0)) problems.push(`lost.${key} (${n}) is more than was at risk`);
  }
  if (typeof result.extras !== 'object' || result.extras === null) problems.push('extras is not a record');
  return problems;
}
