/**
 * Milestone unlocks (ETH-074, CLAUDE.md §4): content such as a Town building that names an
 * `unlock` milestone starts locked and opens the first time a run ends with the milestone met.
 *
 * The milestone vocabulary is content (`src/content/milestones.ts`); this module checks it
 * against the profile. `applyRunResult` calls `unlockMilestones` once every slice has taken the
 * run, and the unlocks are recorded in the `milestones` slice with the run that opened them.
 */
import { BUILDINGS, milestoneMet } from '../content';
import type { Milestone, MilestoneProgress } from '../content';
import type { Profile } from './profile';
import type { MilestoneUnlock } from './slices/milestones';

/** Something that opens with a milestone. */
export interface MilestoneTarget {
  readonly id: string;
  readonly name: string;
  readonly unlock: Milestone;
}

/** Every def with an unlock milestone. Only Town buildings have one so far. */
export function milestoneTargets(): MilestoneTarget[] {
  const targets: MilestoneTarget[] = [];
  for (const building of BUILDINGS.all()) {
    if (building.unlock !== undefined) targets.push({ id: building.id, name: building.name, unlock: building.unlock });
  }
  return targets;
}

/** The player's lifetime totals that milestones are checked against. */
export function milestoneProgress(profile: Profile): MilestoneProgress {
  const { deepestDepth, runs, victories } = profile.history.totals;
  return { deepestDepth, runs, victories };
}

/** Whether `id` is open: it names no milestone, or its unlock has been recorded. */
export function isMilestoneOpen(profile: Profile, id: string): boolean {
  const target = milestoneTargets().find((t) => t.id === id);
  return target === undefined || profile.milestones.unlocked.some((u) => u.id === id);
}

/** The milestone that keeps `id` locked, or `null` if it is open. */
export function lockingMilestone(profile: Profile, id: string): Milestone | null {
  if (isMilestoneOpen(profile, id)) return null;
  return milestoneTargets().find((t) => t.id === id)?.unlock ?? null;
}

/** The unlock record for `id`, or `undefined` if it isn't recorded. */
export function unlockOf(profile: Profile, id: string): MilestoneUnlock | undefined {
  return profile.milestones.unlocked.find((u) => u.id === id);
}

/**
 * Records every target whose milestone is now met and isn't recorded yet, under the run number
 * the history has reached. Returns `profile` itself when nothing new opened. Pure.
 */
export function unlockMilestones(profile: Profile): Profile {
  const progress = milestoneProgress(profile);
  const run = Math.max(1, profile.history.totals.runs);
  const added: MilestoneUnlock[] = [];
  for (const target of milestoneTargets()) {
    if (isMilestoneOpen(profile, target.id) || !milestoneMet(target.unlock, progress)) continue;
    added.push({ id: target.id, run });
  }
  if (added.length === 0) return profile;
  return { ...profile, milestones: { unlocked: [...profile.milestones.unlocked, ...added] } };
}

/** What the latest finished run opened, oldest first: the run summary lists them. */
export function latestUnlocks(profile: Profile): MilestoneUnlock[] {
  const run = profile.history.totals.runs;
  return run === 0 ? [] : profile.milestones.unlocked.filter((u) => u.run === run);
}
