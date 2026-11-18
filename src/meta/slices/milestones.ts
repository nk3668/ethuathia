/**
 * The `milestones` slice (ETH-074): content opened by a milestone (CLAUDE.md §4), such as a Town
 * building, and the run that opened it. This is the unlock log: once recorded, an unlock stays
 * even if the milestone's content changes later.
 *
 * It has no `onRunResult` step of its own: milestones read lifetime totals from other slices, so
 * `applyRunResult` checks them after every slice has taken the run (`src/meta/milestones.ts`).
 */
import { z } from 'zod';
import { defineSlice } from '../slice';

/** One unlock: a content id and the run (as `history.totals.runs` counts them) that opened it. */
export interface MilestoneUnlock {
  readonly id: string;
  readonly run: number;
}

export interface Milestones {
  /** Oldest first. Each id at most once. */
  readonly unlocked: readonly MilestoneUnlock[];
}

const milestonesSchema = z.object({
  unlocked: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'must be a content id'),
        run: z.number().int().positive(),
      }),
    )
    .refine((list) => new Set(list.map((u) => u.id)).size === list.length, 'must not list an id twice'),
});

export const milestonesSlice = defineSlice<Milestones>({
  version: 1,
  schema: milestonesSchema,
  init: () => ({ unlocked: [] }),
});
