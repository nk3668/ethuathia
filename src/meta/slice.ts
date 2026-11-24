/**
 * A profile slice: one feature's share of the `Profile` (docs/ARCHITECTURE.md §6.1). Each
 * feature (currencies, history, town, codex, roster, …) owns its slice's type, default,
 * validation, migrations and run-result reducer in its own file under `slices/`;
 * `slices/index.ts` composes them in one place.
 */
import type { z } from 'zod';
import type { RunResult } from '../sim';
import type { History } from './slices/history';

/**
 * What a slice's `onRunResult` may read of the profile as it was before the run was banked. Written
 * as the parts a step needs (not `Profile` itself, which would make the `Profile` type refer to
 * itself through the slices); a `Profile` is assignable to it. Add a field when a step needs one.
 */
export interface ProfileBefore {
  readonly history: History;
}

/** Upgrades a slice's stored data by one version: from `to - 1` to `to`. */
export type SliceMigration = (old: unknown) => unknown;

export interface ProfileSlice<S> {
  /**
   * The slice's current shape version, starting at 1. Bump it by one whenever the stored shape
   * changes, and add a step to `migrations` under the new number. Each slice is versioned on
   * its own, so features change their shapes without touching each other.
   */
  readonly version: number;
  /** Validates the slice's data after loading and migrating. The parsed value is what's kept. */
  readonly schema: z.ZodType<S>;
  /** A new player's value. Also used when a save has no entry for this slice (a newer feature). */
  init(): S;
  /** `migrations[n]` turns data stored at version `n - 1` into version `n`. Needs 2..version. */
  readonly migrations?: Readonly<Record<number, SliceMigration>>;
  /**
   * This slice's step in the `applyRunResult` pipeline: the slice after the run. Pure, and must
   * return plain data. Leave it out if runs don't change the slice. `before` is the profile
   * as it was before `applyRunResult` began (no slice has run yet), for a step that needs another
   * slice's old value, e.g. the run number (`before.history.totals.runs + 1`), whatever the order.
   */
  onRunResult?(state: S, result: RunResult, before: ProfileBefore): S;
}

/** The state type a slice holds. */
export type SliceState<T> = T extends ProfileSlice<infer S> ? S : never;

/** Identity helper that infers `S` from the definition. */
export function defineSlice<S>(slice: ProfileSlice<S>): ProfileSlice<S> {
  return slice;
}
