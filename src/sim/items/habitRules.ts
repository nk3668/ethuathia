/**
 * The item-side conditions and rule action behind the habits (ETH-194, CLAUDE.md §5.2): the
 * baseline's healing threshold, which Quick to quaff and Sparing with potions move
 * (`cond.needs_healing`), and Curious's test of unknown potions (`cond.curious_ready`,
 * `act.test_unknown`). The habits are content (`src/content/tacticsHabits.ts`).
 *
 * Secrecy (docs/ARCHITECTURE.md §11.6): Curious chooses only by what the party knows. A potion is
 * a candidate because its *category* is known and its *type* is not (`isInstanceTypeKnown`); what
 * the potion really is, how it is enchanted or whether it is cursed never enters the decision, so
 * it decides the same whatever an unidentified potion hides.
 */
import { healBelowHabit, healBelowOf } from '../ai/habitParams';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, Resolved, RuleActionDef } from '../ai/types';
import { statValue } from '../stats/getStat';
import { isInstanceTypeKnown } from './identify';
import { itemDef } from './instance';
import { inventoryOf } from './inventory';
import { itemName } from './name';
import { calmWithExit, HEAL_BELOW_PERCENT } from './rules';
import type { ItemInstance } from './instance';

/** Curious tests potions only at or above this share of max HP, in percent. */
export const CURIOUS_MIN_HP_PERCENT = 70;

/** The pack index of the first potion whose type the party doesn't know, or `null`. */
function unknownPotionIndex(ctx: AiCtx): number | null {
  const { state, actor } = ctx;
  const index = inventoryOf(actor).findIndex((item) => itemDef(item).category === 'potion' && !isInstanceTypeKnown(state, item));
  return index < 0 ? null : index;
}

/**
 * True while HP is below the actor's healing threshold: 35% (`HEAL_BELOW_PERCENT`) unless a habit
 * sets another (Quick to quaff 60, Sparing with potions 20). The baseline's quaff rule uses it.
 */
export const COND_NEEDS_HEALING = defineCondition({
  id: 'cond.needs_healing',
  name: 'Needs healing',
  description: `True while the adventurer’s HP is below its healing threshold: ${HEAL_BELOW_PERCENT}% of its maximum, or what a habit such as Quick to quaff or Sparing with potions sets.`,
  parse: noParams,
  evaluate({ state, actor }) {
    const percent = healBelowOf(actor, HEAL_BELOW_PERCENT);
    const max = statValue(state, actor, 'hp');
    const hp = actor.actor.hp;
    if (hp <= 0 || hp * 100 >= max * percent) return { ok: false, detail: '' };
    const habit = healBelowHabit(actor);
    return { ok: true, detail: `HP ${hp}/${max}, below ${percent}%${habit === undefined ? '' : ` (${habit.name})`}` };
  },
  describe: () => 'HP below the healing threshold',
});

/** True while a potion of unknown type is carried and the moment is calm: no threat, 70% HP or more, a known way out. */
export const COND_CURIOUS_READY = defineCondition({
  id: 'cond.curious_ready',
  name: 'Calm, with an unknown potion',
  description: `True while the adventurer carries a potion of unknown type, no threat is in sight, HP is ${CURIOUS_MIN_HP_PERCENT}% or more and stairs it remembers can be reached.`,
  parse: noParams,
  evaluate(ctx) {
    if (ctx.actor.actor.faction !== 'party' || unknownPotionIndex(ctx) === null) return { ok: false, detail: '' };
    return calmWithExit(ctx, CURIOUS_MIN_HP_PERCENT);
  },
  describe: () => 'calm, carrying an unknown potion',
});

/** Curious: drink an unknown potion to learn what it is. */
export const ACT_TEST_UNKNOWN = defineRuleAction({
  id: 'act.test_unknown',
  name: 'Test an unknown potion',
  description: 'Drink a potion whose type is not known yet, to learn what it does. It may be harmful. Can’t be done without one.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const index = unknownPotionIndex(ctx);
    if (index === null) return null;
    const name = itemName(ctx.state, inventoryOf(ctx.actor)[index] as ItemInstance, ctx.actor);
    return { request: { id: 'use', index }, detail: `drinking the unknown ${name} to learn what it does` };
  },
  describe: () => 'drink an unknown potion',
});

/** The item habits' conditions, in registration order. */
export const ITEMS_HABIT_CONDITIONS: readonly ConditionDef[] = [COND_NEEDS_HEALING, COND_CURIOUS_READY];

/** The item habits' rule actions, in registration order. */
export const ITEMS_HABIT_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_TEST_UNKNOWN];
