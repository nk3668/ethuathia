/**
 * Stance parameters (ETH-071): the numbers a party stance replaces in the baseline. Each reads the
 * actor's picked stance (`AiPart.tactics.stance`) and returns the baseline's own constant when the
 * stance has no such key, an actor has no picks (a monster, a hand-built actor) or the stance is
 * Steady. No imports from the rest of the sim, so combat, floors and items can all read them.
 */
import { TACTICS } from '../../content';
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

/** The HP percent below which `actor` starts to flee (the baseline's, unless its stance says otherwise). */
export function fleeBelowOf(actor: AiActor): number {
  return stanceParamOf(actor, 'fleeBelow', BASELINE_FLEE_PERCENT);
}

/** The HP percent at which `actor` stops fleeing. */
export function fleeReleaseOf(actor: AiActor): number {
  return stanceParamOf(actor, 'fleeRelease', FLEE_RELEASE_PERCENT);
}
