/**
 * Habit parameters (ETH-194): the numbers a habit replaces in the baseline. Each reads the habits
 * in the actor's picks (`AiPart.tactics.habits`) and returns the baseline's own number when none
 * sets it, or when the actor has no picks (a monster, a hand-built actor).
 */
import { TACTICS } from '../../content';
import type { TacticDef } from '../../content';
import type { AiActor } from './types';

/** The habit of `actor` that sets the HP percent below which it quaffs healing, if any. */
export function healBelowHabit(actor: AiActor): TacticDef | undefined {
  for (const id of actor.ai.tactics?.habits ?? []) {
    if (TACTICS.has(id) && typeof TACTICS.get(id).params?.healBelow === 'number') return TACTICS.get(id);
  }
  return undefined;
}

/** The HP percent below which `actor` quaffs healing: its habit's, else `fallback` (the baseline's). */
export function healBelowOf(actor: AiActor, fallback: number): number {
  const value = healBelowHabit(actor)?.params?.healBelow;
  return typeof value === 'number' ? value : fallback;
}
