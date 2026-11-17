/**
 * Stats with sources (docs/ARCHITECTURE.md §2.2): `getStat` for tooltips, `statValue` for hot
 * paths. Both compute the same number the same way:
 *
 * 1. Every stat provider (`STAT_PROVIDERS`: the entity's base, its class and race, later
 *    attributes and level) contributes `add` and `mul` parts.
 * 2. Every active bundle (`BUNDLE_SOURCES`: attached bundles, statuses, later gear and Omens)
 *    contributes its modifiers for the stat, scaled by its potency.
 * 3. value = (sum of `add` parts) × (product of `mul` parts), rounded to a whole number
 *    (`Math.round`) and clamped to the stat's `min` (`STAT_INFO`).
 *
 * A leaf module: it imports no sim values except the registries, so core files (perception,
 * the step loop, snapshots, invariants) can call it without an import cycle.
 */
import { findDef } from '../../content';
import type { Bundle } from '../../content';
import { BUNDLE_SOURCES, STAT_PROVIDERS } from '../registries';
import type { Entity, RunState } from '../state';
import { STAT_IDS, STAT_INFO } from './statIds';
import type { StatId } from './statIds';
import type { BundleVisitor, StatPart, StatResult, StatSink, StatsPart } from './types';

/** A fresh, empty stats part, with optional base values (`{ hp: 5, speed: 100 }`). */
export function newStatsPart(base: StatsPart['base'] = {}): StatsPart {
  return { base: { ...base }, bundles: [], statuses: [] };
}

const bundleCache = new Map<string, Bundle>();

/**
 * The bundle carried by the def with id `id`: a `bundle.*` def, a status, or any def with a
 * `bundle` field. Throws on an unknown id or a def without one. Defs never change after load,
 * so lookups are cached.
 */
export function bundleOf(id: string): Bundle {
  const cached = bundleCache.get(id);
  if (cached !== undefined) return cached;
  const def = findDef(id) as { bundle?: unknown } | undefined;
  if (def === undefined) throw new Error(`Unknown bundle id "${id}"`);
  if (typeof def.bundle !== 'object' || def.bundle === null) throw new Error(`Content "${id}" has no bundle`);
  const bundle = def.bundle as Bundle;
  bundleCache.set(id, bundle);
  return bundle;
}

/** True if `id` names a def that carries a bundle. */
export function hasBundle(id: string): boolean {
  try {
    bundleOf(id);
    return true;
  } catch {
    return false;
  }
}

/** The tooltip label for a content id: its def's name, or the id itself. */
export function sourceLabel(id: string): string {
  return findDef(id)?.name ?? id;
}

/** A modifier's value at `potency`: `add` values scale linearly, `mul` values scale their distance from 1. */
export function scaleModifier(op: 'add' | 'mul', value: number, potency: number): number {
  if (potency === 1) return value;
  return op === 'add' ? value * potency : 1 + (value - 1) * potency;
}

/** Calls `visit` for every bundle active on `entity`, source by source (`BUNDLE_SOURCES` order). */
export function forEachBundle(state: RunState, entity: Entity, visit: BundleVisitor): void {
  for (const source of BUNDLE_SOURCES) source.visit(state, entity, visit);
}

function collect(state: RunState, entity: Entity, stat: StatId, sink: StatSink): void {
  for (const provider of STAT_PROVIDERS) provider.contribute(state, entity, stat, sink);
  forEachBundle(state, entity, (bundle, sourceId, potency) => {
    for (const m of bundle.modifiers ?? []) {
      if (m.stat === stat) sink(m.op, scaleModifier(m.op, m.value, potency), sourceId);
    }
  });
}

function finish(stat: StatId, add: number, mul: number): number {
  return Math.max(STAT_INFO[stat].min, Math.round(add * mul));
}

/** The final value of `stat` on `entity`, without the parts. Use it wherever no tooltip is built. */
export function statValue(state: RunState, entity: Entity, stat: StatId): number {
  let add = 0;
  let mul = 1;
  collect(state, entity, stat, (op, value) => {
    if (op === 'add') add += value;
    else mul *= value;
  });
  return finish(stat, add, mul);
}

/**
 * The final value of `stat` on `entity` and every part that made it, each with its source (a
 * content id and its label) for the tooltip. Parts that change nothing (add 0, mul 1) are left out.
 */
export function getStat(state: RunState, entity: Entity, stat: StatId): StatResult {
  let add = 0;
  let mul = 1;
  const parts: StatPart[] = [];
  collect(state, entity, stat, (op, value, sourceId, label) => {
    if (op === 'add') add += value;
    else mul *= value;
    if (op === 'add' ? value === 0 : value === 1) return;
    parts.push({ op, value, source: { id: sourceId, label: label ?? sourceLabel(sourceId) } });
  });
  return { stat, value: finish(stat, add, mul), parts };
}

/** Every stat of `entity`, keyed by id, with parts: what a stat sheet or tooltips show. */
export function getStats(state: RunState, entity: Entity): Record<StatId, StatResult> {
  const out = {} as Record<StatId, StatResult>;
  for (const stat of STAT_IDS) out[stat] = getStat(state, entity, stat);
  return out;
}

/**
 * Brings current HP and MP back within their maxima after a change that may lower them (a
 * status expiring, a bundle detached). Never raises them: losing a buff doesn't heal.
 */
export function clampVitals(state: RunState, entity: Entity): void {
  const actor = entity.actor;
  if (actor === undefined) return;
  actor.hp = Math.min(actor.hp, statValue(state, entity, 'hp'));
  actor.mp = Math.min(actor.mp, statValue(state, entity, 'mp'));
}

/** Sets current HP and MP to their maxima, e.g. for a fresh adventurer. */
export function fillVitals(state: RunState, entity: Entity): void {
  if (entity.actor === undefined) return;
  entity.actor.hp = statValue(state, entity, 'hp');
  entity.actor.mp = statValue(state, entity, 'mp');
}
