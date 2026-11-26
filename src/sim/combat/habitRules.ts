/**
 * The rule conditions and rule actions behind the habits that act on the party and on enemies
 * (ETH-194, CLAUDE.md §5.2): Treasure hunter (`cond.calm`), Finisher (`cond.finisher_target`,
 * `act.finish_wounded`) and Bodyguard (`cond.healer_far`, `act.stay_by_healer`). The habits are
 * content (`src/content/tacticsHabits.ts`); Avoids combat reuses ETH-193's `act.avoid_fight` and
 * Curious is in `src/sim/items/habitRules.ts`.
 *
 * Habit rows sit ahead of the whole baseline, so each condition is safe on its own: it never
 * holds with an enemy in sight, while fleeing, or while the party is heading out. Each action
 * says nothing (`null`) when it can't be done, and the baseline carries on.
 */
import { ROLE_HEALER } from '../../content';
import { bestByTag } from '../ai/abilities';
import { followMap, nameOf } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, Resolved, RuleActionDef } from '../ai/types';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { CONDITIONS } from '../registries';
import type { ActorEntity, RunState } from '../state';
import { adjacentEnemies, distance, fleeingNow, hpPercent, pathGridFor, visibleEnemies } from './rules';
import { visibleThreats } from './threat';

/** Finisher goes for an enemy at or below this share of its HP, within `FINISHER_RANGE` tiles. */
export const FINISHER_HP_PERCENT = 35;
export const FINISHER_RANGE = 6;
/** Bodyguard walks back to the Healer once it is farther than this many tiles. */
export const BODYGUARD_LEASH = 3;

/** True while the party is heading out or the floor was overstayed: errands the baseline puts first. */
function errandFirst(ctx: AiCtx): boolean {
  return ['cond.heading_out', 'cond.floor_overstayed'].some((id) => CONDITIONS.get(id).evaluate(ctx, undefined).ok);
}

/**
 * The one gate every habit condition passes first (ETH-194 review): habit rows sit ahead of the
 * baseline's urgent rows, so they must yield while the baseline has something urgent to do, namely
 * quaffing healing it carries (it needs healing, by `cond.needs_healing`, and holds a `heal` source)
 * or shedding weight while overloaded.
 */
export function habitYields(ctx: AiCtx): boolean {
  if (CONDITIONS.get('cond.overloaded').evaluate(ctx, undefined).ok) return true;
  return CONDITIONS.get('cond.needs_healing').evaluate(ctx, undefined).ok && bestByTag(ctx, 'heal') !== null;
}

/** The wounded enemy Finisher would go for: the nearest threat at or below the HP share, in range, none being next to the actor. */
function finisherTarget(state: RunState, actor: ActorEntity): ActorEntity | null {
  if (adjacentEnemies(state, actor).length > 0) return null;
  let best: ActorEntity | null = null;
  for (const e of visibleThreats(state, actor)) {
    const gap = distance(e.pos, actor.pos);
    if (gap > FINISHER_RANGE || hpPercent(state, e) > FINISHER_HP_PERCENT) continue;
    if (best === null || gap < distance(best.pos, actor.pos)) best = e;
  }
  return best;
}

/** The party's Healer (a living ally on this floor whose picked role is Healer) farther than the leash, or null. */
function farHealer(state: RunState, actor: ActorEntity): ActorEntity | null {
  let best: ActorEntity | null = null;
  for (const id of state.party) {
    const ally = state.entities[id];
    if (ally === undefined || ally.id === actor.id || ally.actor === undefined || ally.actor.hp <= 0 || ally.floor !== actor.floor) continue;
    if (ally.ai?.tactics?.role !== ROLE_HEALER.id) continue;
    const gap = distance(ally.pos, actor.pos);
    if (gap > BODYGUARD_LEASH && (best === null || gap < distance(best.pos, actor.pos))) best = ally as ActorEntity;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Conditions

/** True while nothing is going on: no enemy in sight, not fleeing, not heading out. Treasure hunter's gate. */
export const COND_CALM = defineCondition({
  id: 'cond.calm',
  name: 'Calm',
  description: 'True while no enemy is in sight, the adventurer is not running away, and the party is neither heading out nor past the time it should leave the floor.',
  parse: noParams,
  evaluate(ctx) {
    const { state, actor } = ctx;
    if (actor.actor.faction !== 'party' || visibleEnemies(state, actor).length > 0 || fleeingNow(state, actor) || habitYields(ctx) || errandFirst(ctx)) return { ok: false, detail: '' };
    return { ok: true, detail: 'nothing in sight and nothing more urgent' };
  },
  describe: () => 'calm: no enemy in sight',
});

/** True when a wounded enemy is in reach and none is next to the actor. */
export const COND_FINISHER_TARGET = defineCondition({
  id: 'cond.finisher_target',
  name: 'Wounded enemy in reach',
  description: `True when an enemy at ${FINISHER_HP_PERCENT}% HP or less is in sight within ${FINISHER_RANGE} tiles, none is next to the adventurer, and it is not running away.`,
  parse: noParams,
  evaluate(ctx) {
    const { state, actor } = ctx;
    if (actor.actor.faction !== 'party' || fleeingNow(state, actor) || habitYields(ctx)) return { ok: false, detail: '' };
    const target = finisherTarget(state, actor);
    return target === null ? { ok: false, detail: '' } : { ok: true, detail: `${nameOf(target)} is at ${Math.round(hpPercent(state, target))}% HP` };
  },
  describe: () => 'a badly wounded enemy is close',
});

/** True when the party's Healer is far away and nothing is next to the actor. */
export const COND_HEALER_FAR = defineCondition({
  id: 'cond.healer_far',
  name: 'Healer far away',
  description: `True when an ally whose role is Healer is more than ${BODYGUARD_LEASH} tiles away, nothing is next to the adventurer, it is not running away, and the party is not heading out. Like every habit condition, false while the adventurer needs healing it carries or is overloaded.`,
  parse: noParams,
  evaluate(ctx) {
    const { state, actor } = ctx;
    if (actor.actor.faction !== 'party' || fleeingNow(state, actor) || adjacentEnemies(state, actor).length > 0 || habitYields(ctx) || errandFirst(ctx)) return { ok: false, detail: '' };
    const healer = farHealer(state, actor);
    return healer === null ? { ok: false, detail: '' } : { ok: true, detail: `${nameOf(healer)} is ${distance(healer.pos, actor.pos)} tiles away` };
  },
  describe: () => 'the Healer is far away',
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/** Finisher: walk up to the wounded enemy. The baseline fights it once it is adjacent. */
export const ACT_FINISH_WOUNDED = defineRuleAction({
  id: 'act.finish_wounded',
  name: 'Finish the wounded',
  description: `Walk toward the nearest enemy at ${FINISHER_HP_PERCENT}% HP or less within ${FINISHER_RANGE} tiles. Stops next to it, where the baseline fights it.`,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const target = finisherTarget(state, actor);
    if (target === null) return null;
    const paths = pathGridFor(ctx);
    const map = buildGoalMap(paths, [target.pos]);
    if (map.get(actor.pos.x, actor.pos.y) === UNREACHABLE) return null;
    const step = followMap(ctx, paths, map, `closing on the wounded ${nameOf(target).replace(/^the /, '')} (${Math.round(hpPercent(state, target))}% HP) to finish it`);
    // Never push past or queue behind an ally: the baseline plays on instead.
    return step === null || step.request.id === 'swap' || step.request.id === 'wait' ? null : step;
  },
  describe: () => 'close on a badly wounded enemy',
});

/** Bodyguard: walk back to the Healer. */
export const ACT_STAY_BY_HEALER = defineRuleAction({
  id: 'act.stay_by_healer',
  name: 'Stay by the Healer',
  description: `Walk toward the party’s Healer when they are more than ${BODYGUARD_LEASH} tiles away. Does nothing with no Healer on the floor.`,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const healer = farHealer(state, actor);
    if (healer === null) return null;
    const paths = pathGridFor(ctx);
    const map = buildGoalMap(paths, [healer.pos]);
    if (map.get(actor.pos.x, actor.pos.y) === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `staying close to ${nameOf(healer)}, ${distance(healer.pos, actor.pos)} tiles away`);
  },
  describe: () => 'walk back to the Healer',
});

/** The habits' conditions, in registration order. */
export const HABIT_CONDITIONS: readonly ConditionDef[] = [COND_CALM, COND_FINISHER_TARGET, COND_HEALER_FAR];

/** The habits' rule actions, in registration order. */
export const HABIT_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_FINISH_WOUNDED, ACT_STAY_BY_HEALER];
