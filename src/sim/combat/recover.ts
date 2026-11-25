/**
 * Breaking a flee/return cycle (ETH-189). A wounded adventurer that flees a foe it can't shake
 * (a ranged one guarding the way to its goal), calms down, walks back and flees again would
 * loop until the turn cap, and neither position nor explore share notices. Stuck detection counts
 * the flights instead (`checkFleeCycle` in `ai/engine.ts`, `AiMemory.fleeCycle`); once there are
 * `FLEE_CYCLE_LIMIT` of them without recovering, the adventurer rests where it is, out of sight of
 * any threat, until HP is back to `FLEE_RELEASE_PERCENT` or `FLEE_REST_TURNS` pass. Natural
 * recovery (`RECOVERY_INTERVAL`) does the healing; potions, rations and fountains come first
 * because their baseline rules sit above this one.
 */
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiMemory, Resolved } from '../ai/types';
import { FLEE_CYCLE_GIVE_UP, FLEE_RELEASE_PERCENT, FLEE_REST_GIVE_UP } from './fleeConfig';
import { hpPercent } from './rules';
import { visibleThreats } from './threat';

/** True while a cycle-breaking rest is on: HP still below the release level, nothing dangerous in sight. */
export const COND_RECOVERING = defineCondition({
  id: 'cond.recovering',
  name: 'Recovering',
  description:
    'True after the adventurer fled the same trouble several times without getting its strength back: until HP is back ' +
    `to ${FLEE_RELEASE_PERCENT}% or the rest runs out, as long as no threat is in sight.`,
  parse: noParams,
  evaluate({ state, actor }) {
    const restUntil = actor.ai.memory.fleeCycle?.restUntil;
    if (restUntil === undefined || state.turn >= restUntil) return { ok: false, detail: '' };
    const hp = hpPercent(state, actor);
    if (hp >= FLEE_RELEASE_PERCENT) return { ok: false, detail: '' };
    if (visibleThreats(state, actor).length > 0) return { ok: false, detail: '' };
    return { ok: true, detail: `fled ${actor.ai.memory.fleeCycle?.episodes ?? 0} times without recovering, HP ${Math.round(hp)}%` };
  },
  describe: () => 'recovering after fleeing repeatedly',
});

/** Stay put and let HP come back. */
export const ACT_REST = defineRuleAction({
  id: 'act.rest',
  name: 'Rest',
  description:
    'Stand still and recover, rather than walk back toward the trouble that was fled. Ends when HP is back to ' +
    `${FLEE_RELEASE_PERCENT}%, when the rest runs out, or when a threat comes into sight. Waiting here never counts as being stuck.`,
  idle: true,
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    if (actor.actor.faction !== 'party' || actor.ai.memory.fleeCycle === undefined) return null;
    const hp = Math.round(hpPercent(state, actor));
    return { request: { id: 'wait' }, detail: `resting to recover before going back, HP ${hp}% (until ${FLEE_RELEASE_PERCENT}%)` };
  },
  describe: () => 'rest to recover',
});

/** Whether a flee/return cycle is past helping: too many flights in a row, or rests that did not bring HP back. */
export function cycleHopeless(cycle: NonNullable<AiMemory['fleeCycle']>): boolean {
  return cycle.episodes >= FLEE_CYCLE_GIVE_UP || (cycle.rests ?? 0) >= FLEE_REST_GIVE_UP;
}

/** True once the adventurer has fled the same trouble so often that the run is not going to get better (ETH-189). */
export const COND_NO_RECOVERY = defineCondition({
  id: 'cond.no_recovery',
  name: 'Cannot shake the trouble',
  description:
    `True after ${FLEE_CYCLE_GIVE_UP} flights in one flee/return cycle, or after ${FLEE_REST_GIVE_UP} rests that did not bring HP back: the adventurer gives the run up and heads out.`,
  parse: noParams,
  evaluate({ actor }) {
    const cycle = actor.ai.memory.fleeCycle;
    if (cycle === undefined || !cycleHopeless(cycle)) return { ok: false, detail: '' };
    return { ok: true, detail: `fled ${cycle.episodes} times, after ${cycle.rests ?? 0} ${cycle.rests === 1 ? 'rest' : 'rests'}, and still not recovered` };
  },
  describe: () => 'fled over and over without recovering',
});

export const RECOVER_CONDITIONS = [COND_RECOVERING, COND_NO_RECOVERY];
export const RECOVER_RULE_ACTIONS = [ACT_REST];
