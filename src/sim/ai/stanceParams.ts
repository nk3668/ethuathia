/**
 * Stance parameters (ETH-071): the numbers a party stance replaces in the baseline. Each reads the
 * actor's picked stance (`AiPart.tactics.stance`) and returns the baseline's own constant when the
 * stance has no such key, an actor has no picks (a monster, a hand-built actor) or the stance is
 * Steady. No imports from the rest of the sim, so combat, floors and items can all read them.
 */
import { DEFAULT_FORMATION, STICK_TOGETHER_CLOSE, STICK_TOGETHER_LEASH, TACTICS } from '../../content';
import type { StanceParamKey } from '../../content';
import { BASELINE_FLEE_PERCENT, FLEE_RELEASE_PERCENT } from '../combat/fleeConfig';
import type { AiActor } from './types';

/** The stance parameter `key` for `actor`, or `fallback` when its stance doesn't set it. */
export function stanceParamOf(actor: AiActor, key: StanceParamKey, fallback: number): number {
  const picks = actor.ai.tactics;
  if (picks === undefined || !TACTICS.has(picks.stance)) return fallback;
  const value = TACTICS.get(picks.stance).params?.[key];
  return typeof value === 'number' ? value : fallback;
}

/** The leash and close distance (tiles) in force for an actor's party cohesion, and the formation it comes from. */
export interface PartyCohesion {
  readonly leash: number;
  readonly close: number;
  /** The formation option's id and name, for the trace. */
  readonly formation: { readonly id: string; readonly name: string };
}

/**
 * How far `actor` may stray from the party's lead (ETH-151): its picked formation's `leash` and
 * `close`, scaled by its stance's `leashPercent` (100 when the stance has none). An actor with no
 * picks (a monster, a hand-built actor) gets the default formation, Stick together. Exported so
 * other rules (the Scout, ETH-193) can range by the same numbers.
 */
export function partyCohesionOf(actor: AiActor): PartyCohesion {
  const picks = actor.ai.tactics;
  const id = picks !== undefined && TACTICS.has(picks.formation) ? picks.formation : DEFAULT_FORMATION;
  const formation = TACTICS.get(id);
  const leashBase = formation.params?.leash;
  const closeBase = formation.params?.close;
  const base = { leash: typeof leashBase === 'number' ? leashBase : STICK_TOGETHER_LEASH, close: typeof closeBase === 'number' ? closeBase : STICK_TOGETHER_CLOSE };
  const percent = stanceParamOf(actor, 'leashPercent', 100);
  if (percent === 100) return { ...base, formation: { id, name: formation.name } };
  const leash = Math.max(2, Math.round((base.leash * percent) / 100));
  const close = Math.max(2, Math.min(leash, Math.round((base.close * percent) / 100)));
  return { leash, close, formation: { id, name: formation.name } };
}

/** The HP percent below which `actor` starts to flee (the baseline's, unless its stance says otherwise). */
export function fleeBelowOf(actor: AiActor): number {
  return stanceParamOf(actor, 'fleeBelow', BASELINE_FLEE_PERCENT);
}

/** The HP percent at which `actor` stops fleeing. */
export function fleeReleaseOf(actor: AiActor): number {
  return stanceParamOf(actor, 'fleeRelease', FLEE_RELEASE_PERCENT);
}
