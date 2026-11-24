/**
 * Milestone unlocks (ETH-074, CLAUDE.md §4): content such as a Town building that names an
 * `unlock` milestone starts locked and opens the first time a run ends with the milestone met.
 *
 * The milestone vocabulary is content (`src/content/milestones.ts`); this module checks it
 * against the profile. `applyRunResult` calls `unlockMilestones` once every slice has taken the
 * run, and the unlocks are recorded in the `milestones` slice with the run that opened them.
 *
 * A `metInRun` milestone (ETH-121) is met by something that held during one run: `buildRunConfig`
 * asks the sim to watch its requirement (`milestoneRequirements`), and `unlockMilestones` reads
 * which ones the run met from its `RunResult.extras['track.requirements']`.
 */
import { BUILDINGS, milestoneMet, requirementKey, tierBand, tierGateId } from '../content';
import type { Milestone, MilestoneProgress, Requirement } from '../content';
import { completedObjectives, metRequirements } from '../sim';
import type { RunResult } from '../sim';
import type { Profile } from './profile';
import type { MilestoneUnlock } from './slices/milestones';

/** Something that opens with a milestone. */
export interface MilestoneTarget {
  readonly id: string;
  readonly name: string;
  readonly unlock: Milestone;
}

/**
 * Every def with an unlock milestone: Town buildings, and each building's tier gates (ETH-172),
 * which come right after their building under the id `tierGateId(building, fromTier)`.
 */
export function milestoneTargets(): MilestoneTarget[] {
  const targets: MilestoneTarget[] = [];
  for (const building of BUILDINGS.all()) {
    if (building.unlock !== undefined) targets.push({ id: building.id, name: building.name, unlock: building.unlock });
    for (const gate of building.tierGates ?? []) {
      const band = tierBand(building, gate.fromTier);
      targets.push({ id: tierGateId(building.id, gate.fromTier), name: gate.name ?? `${building.name}, tier ${band}`, unlock: gate.unlock });
    }
  }
  return targets;
}

/**
 * What milestones are checked against: the player's lifetime totals and, while `result` is being
 * banked, the watched requirements that run met and the objectives it ended with complete (none
 * without one).
 */
export function milestoneProgress(profile: Profile, result?: RunResult): MilestoneProgress {
  const { deepestDepth, runs, victories } = profile.history.totals;
  if (result === undefined) return { deepestDepth, runs, victories, metInRun: [], objectivesDone: [], objectivesExited: [] };
  const objectivesDone = completedObjectives(result.extras);
  return { deepestDepth, runs, victories, metInRun: metRequirements(result.extras), objectivesDone, objectivesExited: result.outcome === 'wipe' ? [] : objectivesDone };
}

/**
 * The run-scope requirements of the `metInRun` milestones still locked, once each (by
 * `requirementKey`), in target order: what `buildRunConfig` asks the run to watch.
 */
export function milestoneRequirements(profile: Profile): Requirement[] {
  const out: Requirement[] = [];
  const keys = new Set<string>();
  for (const target of milestoneTargets()) {
    if (target.unlock.kind !== 'metInRun' || isMilestoneOpen(profile, target.id)) continue;
    const key = requirementKey(target.unlock.requirement);
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(target.unlock.requirement);
  }
  return out;
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
 * the history has reached. `result` is the run just banked, which `metInRun` milestones are
 * checked against. Returns `profile` itself when nothing new opened. Pure.
 */
export function unlockMilestones(profile: Profile, result?: RunResult): Profile {
  const progress = milestoneProgress(profile, result);
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
