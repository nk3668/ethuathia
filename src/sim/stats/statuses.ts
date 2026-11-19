/**
 * Timed statuses (buffs and debuffs). A status is a content def (`STATUSES`) carrying a bundle;
 * an actor holds active ones in `stats.statuses` with the turns left and a potency.
 *
 * - **Applying** follows the def's `stacking` rule within its group (see `StatusStacking`).
 * - **Ticking:** at the end of each of the holder's turns every status loses a turn, and one at 0
 *   expires with a `statusExpired` event. A status applied during the holder's own action counts
 *   that turn, so a 3-turn potion lasts the rest of that turn and the next two.
 * - **Triggers** in a status's bundle fire like any bundle's (`trigger.turn_start` each turn).
 */
import { DEFAULT_MAX_STACKS, STATUSES, statusGroup } from '../../content';
import type { Emit } from '../events';
import type { Entity, RunState } from '../state';
import { registerInvariant } from '../invariants';
import { clampVitals, newStatsPart, statValue } from './getStat';
import type { ActiveStatus, StatsPart } from './types';

/** How an application landed: a new status, or merged into one of its group per its stacking rule. */
export type StatusApplyMode = 'new' | 'refreshed' | 'extended' | 'stacked';

/** The entity's stats part, created empty if it has none. */
export function ensureStats(entity: Entity): StatsPart {
  entity.stats ??= newStatsPart();
  return entity.stats;
}

/**
 * How many of `turns` a holder with `resist` percent status resistance (ETH-081, the
 * `statusResist` stat, from Grit) shrugs off: `turns × resist / 100`, rounded, leaving at least
 * one turn. Deterministic, so resisting draws nothing from the RNG.
 */
export function resistedTurns(turns: number, resist: number): number {
  if (resist <= 0 || turns <= 1) return 0;
  return Math.min(turns - 1, Math.round((turns * resist) / 100));
}

/**
 * Applies status `statusId` to `entity` for `turns` of its turns at `potency`, following the
 * def's stacking rule, and emits `statusApplied`. A harmful status is shortened first by the
 * holder's status resistance (`resistedTurns`) unless `resistible` is false (a run's starting
 * statuses). `by` is whoever inflicted it, if someone else did; a merged status takes the latest
 * applier (ETH-075). Does nothing to an entity without a living actor part, and returns whether it
 * applied. Throws on an unknown status id or bad numbers.
 */
export function applyStatus(
  state: RunState,
  entity: Entity,
  statusId: string,
  turns: number,
  emit: Emit,
  potency = 1,
  resistible = true,
  by?: Entity,
): boolean {
  const def = STATUSES.get(statusId);
  if (!Number.isInteger(turns) || turns <= 0) throw new Error(`Status "${statusId}" needs whole turns above 0, got ${turns}`);
  if (!Number.isFinite(potency) || potency <= 0) throw new Error(`Status "${statusId}" needs a potency above 0, got ${potency}`);
  if (entity.actor === undefined || entity.actor.hp <= 0) return false;

  const resisted = def.harmful && resistible ? resistedTurns(turns, statValue(state, entity, 'statusResist')) : 0;
  turns -= resisted;

  const statuses = ensureStats(entity).statuses;
  const group = statusGroup(def);
  const same = statuses.filter((s) => statusGroup(STATUSES.get(s.status)) === group);
  const source = by === undefined || by.id === entity.id ? undefined : { id: by.id, def: by.def };
  const fresh: ActiveStatus = source === undefined ? { status: statusId, remaining: turns, potency } : { status: statusId, remaining: turns, potency, by: source };
  let mode: StatusApplyMode;
  let result: ActiveStatus;

  const first = same[0];
  if (first === undefined) {
    statuses.push(fresh);
    mode = 'new';
    result = fresh;
  } else if (def.stacking === 'stack') {
    if (same.length < (def.maxStacks ?? DEFAULT_MAX_STACKS)) {
      statuses.push(fresh);
    } else {
      // Full: the instance with the fewest turns left (the first such) makes way.
      const weakest = same.reduce((a, b) => (b.remaining < a.remaining ? b : a));
      statuses[statuses.indexOf(weakest)] = fresh;
    }
    mode = 'stacked';
    result = fresh;
  } else {
    first.remaining = def.stacking === 'extend' ? first.remaining + turns : Math.max(first.remaining, turns);
    if (potency > first.potency) {
      first.potency = potency;
      first.status = statusId;
    }
    if (source !== undefined) first.by = source;
    mode = def.stacking === 'extend' ? 'extended' : 'refreshed';
    result = first;
  }

  emit({
    type: 'statusApplied',
    actor: entity.id,
    status: result.status,
    turns: result.remaining,
    potency: result.potency,
    mode,
    ...(resisted > 0 ? { resisted } : {}),
  });
  clampVitals(state, entity);
  return true;
}

/**
 * Removes every active status of `statusId`'s group from `entity` (a cure), emitting
 * `statusRemoved` for each. Returns how many were removed.
 */
export function removeStatus(state: RunState, entity: Entity, statusId: string, emit: Emit): number {
  const stats = entity.stats;
  if (stats === undefined) return 0;
  const group = statusGroup(STATUSES.get(statusId));
  const removed = stats.statuses.filter((s) => statusGroup(STATUSES.get(s.status)) === group);
  if (removed.length === 0) return 0;
  stats.statuses = stats.statuses.filter((s) => !removed.includes(s));
  for (const s of removed) emit({ type: 'statusRemoved', actor: entity.id, status: s.status });
  clampVitals(state, entity);
  return removed.length;
}

/**
 * One turn passes for `entity`'s statuses: each loses a turn, and those at 0 expire with a
 * `statusExpired` event, in the order they were applied.
 */
export function tickStatuses(state: RunState, entity: Entity, emit: Emit): void {
  const stats = entity.stats;
  if (stats === undefined || stats.statuses.length === 0) return;
  const expired: ActiveStatus[] = [];
  for (const s of stats.statuses) {
    s.remaining--;
    if (s.remaining <= 0) expired.push(s);
  }
  if (expired.length === 0) return;
  stats.statuses = stats.statuses.filter((s) => s.remaining > 0);
  for (const s of expired) emit({ type: 'statusExpired', actor: entity.id, status: s.status });
  clampVitals(state, entity);
}

/**
 * A status's inflicter (ETH-075) is someone else: a positive entity id with a def. The entity may
 * be gone (a slain monster's poison outlives it), so only the shape is checked.
 */
registerInvariant('stats.statusSources', (state) =>
  Object.values(state.entities).flatMap((entity) =>
    (entity.stats?.statuses ?? []).flatMap((s) => {
      if (s.by === undefined) return [];
      if (!Number.isSafeInteger(s.by.id) || s.by.id <= 0 || typeof s.by.def !== 'string' || s.by.def === '') {
        return [`entity ${entity.id} has status "${s.status}" inflicted by ${JSON.stringify(s.by)}`];
      }
      return s.by.id === entity.id ? [`entity ${entity.id} inflicted status "${s.status}" on itself`] : [];
    }),
  ),
);
