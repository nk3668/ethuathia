/**
 * The `history` slice: lifetime run totals and the most recent runs, for the Stats tab and the
 * time-away estimate (docs/ARCHITECTURE.md §6.6).
 */
import { z } from 'zod';
import { currenciesSchema, subtractCurrencies } from '../currencies';
import type { Currencies } from '../currencies';
import type { RunOutcome } from '../../sim';
import { currenciesFromRewards } from '../runResult';
import { defineSlice } from '../slice';

/** How many recent runs the profile keeps. */
export const HISTORY_LIMIT = 20;

/** One finished run, as the history keeps it. */
export interface RunRecord {
  /** 1 for the player's first run, counting every run ever finished. */
  readonly run: number;
  readonly outcome: RunOutcome;
  readonly turns: number;
  readonly deepestDepth: number;
  /** What went into the banked totals. */
  readonly banked: Currencies;
  /** What the wipe took. */
  readonly lost: Currencies;
}

export interface History {
  readonly totals: {
    readonly runs: number;
    readonly victories: number;
    readonly retreats: number;
    readonly wipes: number;
    readonly turns: number;
    readonly deepestDepth: number;
  };
  /** The last `HISTORY_LIMIT` runs, oldest first. */
  readonly recent: readonly RunRecord[];
}

const count = z.number().int().nonnegative();

const historySchema = z.object({
  totals: z.object({
    runs: count,
    victories: count,
    retreats: count,
    wipes: count,
    turns: count,
    deepestDepth: count,
  }),
  recent: z
    .array(
      z.object({
        run: z.number().int().positive(),
        outcome: z.enum(['victory', 'retreat', 'wipe']),
        turns: count,
        deepestDepth: count,
        banked: currenciesSchema,
        lost: currenciesSchema,
      }),
    )
    .max(HISTORY_LIMIT),
});

const OUTCOME_TOTAL = { victory: 'victories', retreat: 'retreats', wipe: 'wipes' } as const;

export const historySlice = defineSlice<History>({
  version: 1,
  schema: historySchema,
  init: () => ({
    totals: { runs: 0, victories: 0, retreats: 0, wipes: 0, turns: 0, deepestDepth: 0 },
    recent: [],
  }),
  onRunResult: (history, result) => {
    const { totals } = history;
    const run = totals.runs + 1;
    const record: RunRecord = {
      run,
      outcome: result.outcome,
      turns: result.turns,
      deepestDepth: result.deepestDepth,
      banked: subtractCurrencies(currenciesFromRewards(result.atRisk), currenciesFromRewards(result.lost)),
      lost: currenciesFromRewards(result.lost),
    };
    const outcomeKey = OUTCOME_TOTAL[result.outcome];
    return {
      totals: {
        ...totals,
        runs: run,
        [outcomeKey]: totals[outcomeKey] + 1,
        turns: totals.turns + result.turns,
        deepestDepth: Math.max(totals.deepestDepth, result.deepestDepth),
      },
      recent: [...history.recent, record].slice(-HISTORY_LIMIT),
    };
  },
});
