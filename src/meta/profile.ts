/**
 * The `Profile` (docs/ARCHITECTURE.md §6.1): everything that persists between runs, as plain
 * data. It is composed from the slices in `slices/index.ts` and changed only by pure functions
 * that return a new profile.
 */
import { assertPlainData } from '../core';
import type { RunResult } from '../sim';
import { checkRunResult } from './runResult';
import type { ProfileSlice, SliceState } from './slice';
import { PROFILE_SLICES } from './slices';

type Slices = typeof PROFILE_SLICES;

export type ProfileSliceKey = keyof Slices;

export type Profile = { readonly [K in ProfileSliceKey]: SliceState<Slices[K]> };

/** The slices as a plain list, for code that treats them all alike. */
export const SLICE_ENTRIES = Object.entries(PROFILE_SLICES) as [ProfileSliceKey, ProfileSlice<unknown>][];

/** A new player's profile: every slice at its default. */
export function newProfile(): Profile {
  const profile: Record<string, unknown> = {};
  for (const [key, slice] of SLICE_ENTRIES) profile[key] = slice.init();
  return profile as Profile;
}

/**
 * Banks a finished run into the profile and returns the new profile. Each slice's
 * `onRunResult` step runs in `PROFILE_SLICES` order on its own slice; slices without one are
 * kept as they are. Throws a `RangeError` if `result` is malformed (e.g. it lost more than was
 * at risk), since that is a bug in the run, not something to bank.
 */
export function applyRunResult(profile: Profile, result: RunResult): Profile {
  const problems = checkRunResult(result);
  if (problems.length > 0) throw new RangeError(`Malformed RunResult: ${problems.join('; ')}`);
  const next: Record<string, unknown> = { ...profile };
  for (const [key, slice] of SLICE_ENTRIES) {
    if (slice.onRunResult) next[key] = slice.onRunResult(profile[key], result);
  }
  return next as Profile;
}

/**
 * Problems with a profile, one line each (`history.totals.runs: ...`), or an empty list if it
 * is sound: every slice must pass its schema and the whole profile must be plain data.
 */
export function checkProfile(profile: unknown): string[] {
  if (typeof profile !== 'object' || profile === null) return ['profile is not an object'];
  const problems: string[] = [];
  const record = profile as Record<string, unknown>;
  for (const [key, slice] of SLICE_ENTRIES) {
    const parsed = slice.schema.safeParse(record[key]);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) problems.push(`${[key, ...issue.path].join('.')}: ${issue.message}`);
    }
  }
  try {
    assertPlainData(profile, 'profile');
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return problems;
}
