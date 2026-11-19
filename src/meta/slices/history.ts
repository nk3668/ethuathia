/**
 * The `history` slice: lifetime run totals and the most recent runs, for the Stats tab's run
 * history (ETH-048) and the time-away estimate (docs/ARCHITECTURE.md §6.6).
 *
 * Each run is kept as a compact `RunRecord`, enough to show its run summary again: not the full
 * `RunResult`, whose extras grow with every tracker.
 */
import { z } from 'zod';
import { currenciesSchema, subtractCurrencies } from '../currencies';
import type { Currencies } from '../currencies';
import { CODEX_TRACKER, CONTRACTS_TRACKER } from '../../sim';
import type { RunOutcome, RunResult } from '../../sim';
import { currenciesFromRewards } from '../runResult';
import { defineSlice } from '../slice';

/**
 * How many recent runs the profile keeps (tunable). Older runs drop off the end; the lifetime
 * totals still count them. Lowering it trims saved lists on load.
 */
export const HISTORY_LIMIT = 50;

/** One adventurer in a recorded run. */
export interface RunRecordMember {
  readonly name: string;
  readonly classId: string;
  readonly raceId: string;
  /** Where and when they fell, or `null` if they survived the run. */
  readonly fell: { readonly depth: number; readonly turn: number } | null;
}

/** One contract of a recorded run (ETH-024). */
export interface RunRecordContract {
  /** The contract def id. */
  readonly id: string;
  readonly complete: boolean;
  /** What it paid (or would have paid) into the run's at-risk total. */
  readonly reward: Currencies;
}

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
  /** Why the run ended (`RunEnd.cause`); empty for runs recorded before ETH-048. */
  readonly cause: string;
  /** Who set out, in party order; empty for runs recorded before ETH-048. */
  readonly party: readonly RunRecordMember[];
  /** The content ids the Codex met this run. */
  readonly met: readonly string[];
  /** The contracts it took on; empty for runs recorded before ETH-024. */
  readonly contracts: readonly RunRecordContract[];
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
  /** The last `HISTORY_LIMIT` runs, newest first. */
  readonly recent: readonly RunRecord[];
}

const count = z.number().int().nonnegative();

/** Longest `cause` kept; longer ones are cut. */
const MAX_CAUSE = 500;

const memberSchema = z.object({
  name: z.string().max(80),
  classId: z.string().max(80),
  raceId: z.string().max(80),
  fell: z.object({ depth: count, turn: count }).nullable(),
});

const recordSchema = z.object({
  run: z.number().int().positive(),
  outcome: z.enum(['victory', 'retreat', 'wipe']),
  turns: count,
  deepestDepth: count,
  banked: currenciesSchema,
  lost: currenciesSchema,
  cause: z.string().max(MAX_CAUSE),
  party: z.array(memberSchema).max(16),
  met: z.array(z.string().max(80)).max(1000),
  contracts: z.array(z.object({ id: z.string().max(80), complete: z.boolean(), reward: currenciesSchema })).max(16),
});

const historySchema = z.object({
  totals: z.object({
    runs: count,
    victories: count,
    retreats: count,
    wipes: count,
    turns: count,
    deepestDepth: count,
  }),
  recent: z.array(recordSchema).transform((records) => records.slice(0, HISTORY_LIMIT)),
});

const OUTCOME_TOTAL = { victory: 'victories', retreat: 'retreats', wipe: 'wipes' } as const;

// What the record reads from `RunResult.extras`. A missing or odd value just leaves its part out:
// the record is for showing, not for banking.
const partyExtras = z.array(z.object({ actor: z.number(), name: z.string(), classId: z.string(), raceId: z.string() }));
const deathsExtras = z.object({ fallen: z.array(z.object({ actor: z.number(), depth: count, turn: count })) });
const endExtras = z.object({ cause: z.string() });
const contractsExtras = z.array(z.object({ contract: z.string(), complete: z.boolean(), reward: z.record(z.string(), z.number()) }));

/** The compact record of a finished run, numbered `run`. */
export function runRecord(run: number, result: RunResult): RunRecord {
  const party = partyExtras.safeParse(result.extras['run.party']);
  const deaths = deathsExtras.safeParse(result.extras['track.deaths']);
  const end = endExtras.safeParse(result.extras['run.end']);
  const codex = result.extras[CODEX_TRACKER.id];
  const contracts = contractsExtras.safeParse(result.extras[CONTRACTS_TRACKER.id]);
  const fallen = deaths.success ? deaths.data.fallen : [];
  return {
    run,
    outcome: result.outcome,
    turns: result.turns,
    deepestDepth: result.deepestDepth,
    banked: subtractCurrencies(currenciesFromRewards(result.atRisk), currenciesFromRewards(result.lost)),
    lost: currenciesFromRewards(result.lost),
    cause: end.success ? end.data.cause.slice(0, MAX_CAUSE) : '',
    party: party.success
      ? party.data.map((m) => {
          const fell = fallen.find((f) => f.actor === m.actor);
          return { name: m.name, classId: m.classId, raceId: m.raceId, fell: fell === undefined ? null : { depth: fell.depth, turn: fell.turn } };
        })
      : [],
    met: typeof codex === 'object' && codex !== null ? Object.keys(codex) : [],
    contracts: contracts.success
      ? contracts.data.map((c) => ({ id: c.contract, complete: c.complete, reward: currenciesFromRewards(c.reward) }))
      : [],
  };
}

export const historySlice = defineSlice<History>({
  version: 3,
  schema: historySchema,
  init: () => ({
    totals: { runs: 0, victories: 0, retreats: 0, wipes: 0, turns: 0, deepestDepth: 0 },
    recent: [],
  }),
  migrations: {
    // v2 (ETH-048): newest first, and each run keeps its cause, party and Codex finds.
    2: (old) => {
      const v1 = old as { totals: unknown; recent: Record<string, unknown>[] };
      return {
        totals: v1.totals,
        recent: [...v1.recent].reverse().map((r) => ({ ...r, cause: '', party: [], met: [] })),
      };
    },
    // v3 (ETH-024): each run keeps its contracts.
    3: (old) => {
      const v2 = old as { totals: unknown; recent: Record<string, unknown>[] };
      return { totals: v2.totals, recent: v2.recent.map((r) => ({ ...r, contracts: [] })) };
    },
  },
  onRunResult: (history, result) => {
    const { totals } = history;
    const run = totals.runs + 1;
    const outcomeKey = OUTCOME_TOTAL[result.outcome];
    return {
      totals: {
        ...totals,
        runs: run,
        [outcomeKey]: totals[outcomeKey] + 1,
        turns: totals.turns + result.turns,
        deepestDepth: Math.max(totals.deepestDepth, result.deepestDepth),
      },
      recent: [runRecord(run, result), ...history.recent].slice(0, HISTORY_LIMIT),
    };
  },
});
