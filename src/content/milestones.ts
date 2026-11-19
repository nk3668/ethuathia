/**
 * Milestones (CLAUDE.md §4: "buildings are unlocked by milestones"): a small, closed vocabulary
 * of goals across all runs that content can name as its unlock condition. A Town building with
 * an `unlock` milestone starts locked and opens the first time a run ends with it met.
 *
 * The data here is pure and has no profile in it: meta (`src/meta/milestones.ts`) builds the
 * `MilestoneProgress` from the profile, checks milestones in `applyRunResult` and records each
 * unlock. A new milestone kind is one member of `Milestone`, one option in `milestoneSchema`
 * and one case in `milestoneMet` and `describeMilestone`.
 *
 * Lifetime totals are checked here against the profile. Anything that has to hold *during* a run
 * ("carrying a spellbook on floor 10") is a `metInRun` milestone (ETH-121): its run-scope
 * `Requirement` is watched by the sim's `track.requirements` and counts once some run met it.
 * An `objectiveDone` milestone (ETH-114) counts once some run ended with that owner's tracked
 * objective complete (a building quest, ETH-093).
 */
import { z } from 'zod';
import type { ContentRef } from './kind';
import { objectiveOwnerKey, objectiveOwnerRefs, objectiveOwnerSchema } from './objectives';
import type { ObjectiveOwner } from './objectives';
import { requirementKey, requirementRefs, requirementSchema, wordRequirementByIds } from './requirements';
import type { Requirement, RequirementWords } from './requirements';
import { positiveInt } from './schema';

export type Milestone =
  /** Some run reached floor `depth` (1 is the first floor). */
  | { readonly kind: 'reachDepth'; readonly depth: number }
  /** `count` runs have ended, however they ended. */
  | { readonly kind: 'finishRuns'; readonly count: number }
  /** `count` runs have ended in victory. */
  | { readonly kind: 'winRuns'; readonly count: number }
  /**
   * `requirement` (run scope) held at the end of some step of a run (ETH-121), checked by the
   * sim's `track.requirements`, which the run's `RunConfig.watchRequirements` asks for.
   */
  | { readonly kind: 'metInRun'; readonly requirement: Requirement }
  /**
   * Some run ended with `owner`'s tracked objective complete (ETH-114): read from the run's
   * `RunResult.extras['quests.objectives']`. The run has to track it (a building quest, ETH-093).
   */
  | { readonly kind: 'objectiveDone'; readonly owner: ObjectiveOwner };

export type MilestoneKind = Milestone['kind'];

export const milestoneSchema: z.ZodType<Milestone> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('reachDepth'), depth: positiveInt }),
  z.strictObject({ kind: z.literal('finishRuns'), count: positiveInt }),
  z.strictObject({ kind: z.literal('winRuns'), count: positiveInt }),
  z.strictObject({ kind: z.literal('metInRun'), requirement: requirementSchema }),
  z.strictObject({ kind: z.literal('objectiveDone'), owner: objectiveOwnerSchema }),
]);

/**
 * The content refs a milestone makes, for `ContentKind.refs` of a kind that embeds one: a
 * `metInRun` requirement's conditions, which must exist, take their params and be run-scope.
 */
export function milestoneRefs(path: string, milestone: Milestone): ContentRef[] {
  if (milestone.kind === 'metInRun') return requirementRefs(`${path}.requirement`, milestone.requirement, 'run');
  if (milestone.kind === 'objectiveDone') return objectiveOwnerRefs(`${path}.owner`, milestone.owner);
  return [];
}

/** What milestones are checked against: lifetime totals over every finished run. */
export interface MilestoneProgress {
  /** The deepest floor any run has reached. */
  readonly deepestDepth: number;
  /** Runs finished, any outcome. */
  readonly runs: number;
  /** Runs won. */
  readonly victories: number;
  /**
   * The `requirementKey`s of the watched requirements the run being banked met (from its
   * `RunResult.extras['track.requirements']`); empty between runs. A `metInRun` milestone met
   * here is recorded as unlocked at once, so it never has to be met again.
   */
  readonly metInRun: readonly string[];
  /**
   * The `objectiveOwnerKey`s of the objectives the run being banked ended with complete (from its
   * `RunResult.extras['quests.objectives']`, ETH-114); empty between runs. Like `metInRun`, an
   * `objectiveDone` milestone met here is recorded as unlocked at once.
   */
  readonly objectivesDone: readonly string[];
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
    case 'metInRun':
      return progress.metInRun.includes(requirementKey(milestone.requirement));
    case 'objectiveDone':
      return progress.objectivesDone.includes(objectiveOwnerKey(milestone.owner));
  }
}

/**
 * The milestone as an instruction, for tooltips and locked panels: "Reach floor 3". `words` words
 * a `metInRun` requirement; pass the sim's `describeRequirement` (content can't see the
 * conditions' own wording, so the default names them by id). `names` names an `objectiveDone`
 * owner's def (the default gives its id).
 */
export function describeMilestone(milestone: Milestone, words: RequirementWords = wordRequirementByIds, names: DefNames = byId): string {
  switch (milestone.kind) {
    case 'metInRun':
      return `Achieve in one run: ${words(milestone.requirement)}`;
    case 'objectiveDone':
      return `Complete ${ownerText(milestone.owner, names)}`;
    case 'reachDepth':
      return `Reach floor ${milestone.depth}`;
    case 'finishRuns':
      return milestone.count === 1 ? 'Finish a run' : `Finish ${milestone.count} runs`;
    case 'winRuns':
      return milestone.count === 1 ? 'Win a run' : `Win ${milestone.count} runs`;
  }
}

/** The milestone as something done, for the run summary: "you reached floor 3". `words` as for `describeMilestone`. */
export function describeMilestoneMet(milestone: Milestone, words: RequirementWords = wordRequirementByIds, names: DefNames = byId): string {
  switch (milestone.kind) {
    case 'metInRun':
      return `you achieved in one run: ${words(milestone.requirement)}`;
    case 'objectiveDone':
      return `you completed ${ownerText(milestone.owner, names)}`;
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
    case 'metInRun':
      return milestoneMet(milestone, progress) ? 'Achieved in the last run' : 'Not achieved in a run yet';
    case 'objectiveDone':
      return milestoneMet(milestone, progress) ? 'Completed in the last run' : 'Not completed yet';
    case 'reachDepth':
      return progress.deepestDepth === 0 ? 'No floor reached yet' : `Deepest so far: floor ${progress.deepestDepth}`;
    case 'finishRuns':
      return `Runs finished: ${Math.min(progress.runs, milestone.count)} of ${milestone.count}`;
    case 'winRuns':
      return `Runs won: ${Math.min(progress.victories, milestone.count)} of ${milestone.count}`;
  }
}

/** Names a def by id ("Recover the relic"), for milestone text. The default gives the id itself. */
export type DefNames = (id: string) => string;

const byId: DefNames = (id) => id;

/** An objective owner in words: "the contract Recover the relic". */
function ownerText(owner: ObjectiveOwner, names: DefNames): string {
  return `the ${owner.kind} ${names(owner.id)}`;
}
