/**
 * Attaching bundles to actors (docs/ARCHITECTURE.md §2.2). An attached bundle lasts until it is
 * detached; a timed one is a status instead (`statuses.ts`). Gear and run-wide bundles may come
 * from a `BundleSource` of their own domain rather than being attached here.
 */
import type { Entity, RunState } from '../state';
import { bundleOf, clampVitals } from './getStat';
import { ensureStats } from './statuses';

/**
 * Attaches the bundle of def `bundleId` to `entity`, credited to `source` (default: the bundle's
 * id). Throws if the id carries no bundle. Doesn't heal: current HP stays as it is.
 */
export function attachBundle(state: RunState, entity: Entity, bundleId: string, source?: string): void {
  bundleOf(bundleId);
  ensureStats(entity).bundles.push(source === undefined ? { bundle: bundleId } : { bundle: bundleId, source });
  clampVitals(state, entity);
}

/** Detaches every bundle credited to `source` (or with that bundle id and no source). Returns how many. */
export function detachBundles(state: RunState, entity: Entity, source: string): number {
  const stats = entity.stats;
  if (stats === undefined) return 0;
  const before = stats.bundles.length;
  stats.bundles = stats.bundles.filter((b) => (b.source ?? b.bundle) !== source);
  const removed = before - stats.bundles.length;
  if (removed > 0) clampVitals(state, entity);
  return removed;
}
