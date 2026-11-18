/**
 * Milestones (CLAUDE.md §4: "buildings are unlocked by milestones"): a small, closed vocabulary
 * of goals across all runs that content can name as its unlock condition. A Town building with
 * an `unlock` milestone starts locked and opens the first time a run ends with it met.
 *
 * The data here is pure and has no profile in it: meta (`src/meta/milestones.ts`) builds the
 * `MilestoneProgress` from the profile, checks milestones in `applyRunResult` and records each
 * unlock. A new milestone kind is one member of `Milestone`, one option in `milestoneSchema`
 * and one case in `milestoneMet` and `describeMilestone`.
 */
import { z } from 'zod';
import { positiveInt } from './schema';

export type Milestone =
  /** Some run reached floor `depth` (1 is the first floor). */
  | { readonly kind: 'reachDepth'; readonly depth: number }
  /** `count` runs have ended, however they ended. */
  | { readonly kind: 'finishRuns'; readonly count: number }
  /** `count` runs have ended in victory. */
  | { readonly kind: 'winRuns'; readonly count: number };

export type MilestoneKind = Milestone['kind'];

export const milestoneSchema: z.ZodType<Milestone> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('reachDepth'), depth: positiveInt }),
  z.strictObject({ kind: z.literal('finishRuns'), count: positiveInt }),
  z.strictObject({ kind: z.literal('winRuns'), count: positiveInt }),
]);

/** What milestones are checked against: lifetime totals over every finished run. */
export interface MilestoneProgress {
  /** The deepest floor any run has reached. */
  readonly deepestDepth: number;
  /** Runs finished, any outcome. */
  readonly runs: number;
  /** Runs won. */
  readonly victories: number;
}

/** Whether `progress` meets `milestone`. */
export function milestoneMet(milestone: Milestone, progress: MilestoneProgress): boolean {
  switch (milestone.kind) {
    case 'reachDepth':
      return progress.deepestDepth >= milestone.depth;
    case 'finishRuns':
      return progress.runs >= milestone.count;
    case 'winRuns':
      return progress.victories >= milestone.count;
  }
}

/** The milestone as an instruction, for tooltips and locked panels: "Reach floor 3". */
export function describeMilestone(milestone: Milestone): string {
  switch (milestone.kind) {
    case 'reachDepth':
      return `Reach floor ${milestone.depth}`;
    case 'finishRuns':
      return milestone.count === 1 ? 'Finish a run' : `Finish ${milestone.count} runs`;
    case 'winRuns':
      return milestone.count === 1 ? 'Win a run' : `Win ${milestone.count} runs`;
  }
}

/** The milestone as something done, for the run summary: "you reached floor 3". */
export function describeMilestoneMet(milestone: Milestone): string {
  switch (milestone.kind) {
    case 'reachDepth':
      return `you reached floor ${milestone.depth}`;
    case 'finishRuns':
      return milestone.count === 1 ? 'you finished a run' : `you finished ${milestone.count} runs`;
    case 'winRuns':
      return milestone.count === 1 ? 'you won a run' : `you won ${milestone.count} runs`;
  }
}

/** How far along the player is, in words: "Deepest so far: floor 2". */
export function describeProgress(milestone: Milestone, progress: MilestoneProgress): string {
  switch (milestone.kind) {
    case 'reachDepth':
      return progress.deepestDepth === 0 ? 'No floor reached yet' : `Deepest so far: floor ${progress.deepestDepth}`;
    case 'finishRuns':
      return `Runs finished: ${Math.min(progress.runs, milestone.count)} of ${milestone.count}`;
    case 'winRuns':
      return `Runs won: ${Math.min(progress.victories, milestone.count)} of ${milestone.count}`;
  }
}
