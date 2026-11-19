/**
 * `track.requirements` (ETH-121, docs/ARCHITECTURE.md "Shared conditions"): which of the run's
 * watched requirements held at some point. Meta lists the run-scope requirements its `metInRun`
 * milestones are waiting on in `RunConfig.watchRequirements`; at the end of every step this
 * tracker checks each one not yet met against the run (`checkRequirement` with a `RunCtx`) and
 * records its `requirementKey` the first time it holds. `RunResult.extras['track.requirements']`
 * is the state, `{ met: string[] }` in the order they were first met, which meta's
 * `unlockMilestones` reads through `metRequirements`.
 */
import { requirementKey } from '../../content';
import type { Requirement } from '../../content';
import { checkRequirement } from '../ai/requirements';
import type { RunTracker } from '../domain';
import type { RunState } from '../state';

export const REQUIREMENTS_TRACKER_ID = 'track.requirements';

/** The tracker's state: the keys of the watched requirements met so far, first met first. */
export interface RequirementsTrackerState {
  met: string[];
}

/** The requirements `state` watches (`RunConfig.watchRequirements`), or none. */
export function watchedRequirements(state: RunState): readonly Requirement[] {
  return state.config.watchRequirements ?? [];
}

/** `track.requirements`: records each watched requirement the first time it holds at the end of a step. */
export const REQUIREMENTS_TRACKER: RunTracker<RequirementsTrackerState> = {
  id: REQUIREMENTS_TRACKER_ID,
  init: () => ({ met: [] }),
  reduce: (s) => s,
  afterStep(s, run) {
    const watched = watchedRequirements(run);
    if (watched.length === 0) return s;
    const met = [...s.met];
    for (const req of watched) {
      const key = requirementKey(req);
      if (!met.includes(key) && checkRequirement({ state: run }, req).ok) met.push(key);
    }
    return met.length === s.met.length ? s : { met };
  },
};

/**
 * The requirement keys a `RunResult`'s extras say the run met, or none if the tracker's extras
 * are missing or malformed (a result from before ETH-121).
 */
export function metRequirements(extras: Readonly<Record<string, unknown>>): string[] {
  const value = extras[REQUIREMENTS_TRACKER_ID];
  if (typeof value !== 'object' || value === null) return [];
  const met = (value as { met?: unknown }).met;
  return Array.isArray(met) ? met.filter((k): k is string => typeof k === 'string') : [];
}
