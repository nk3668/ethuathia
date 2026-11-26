/**
 * The conditions behind the party stances (ETH-071, `src/content/stances.ts`).
 *
 * A stance's rows are checked **ahead of the whole baseline** (`buildTacticRules`), so a bare
 * "stairs known, descend" row would pre-empt fighting, fleeing and quaffing. Every stance condition
 * therefore starts with `stanceMayAct`, the one place that says when the baseline has something
 * more urgent to do. A stance's rows only ever fire in the gaps the baseline leaves, and the
 * priority order is pinned by `test/sim/stances.test.ts`.
 */
import type { Pos } from '../../core';
import { aiPathGrid, followMap, nameOf } from './navigate';
import { fleeBelowOf } from './stanceParams';
import { defineCondition, defineRuleAction, noParams } from './types';
import type { AiCtx, ConditionDef, ParamParser, Resolved, RuleActionDef } from './types';
import { adjacentEnemies, hpPercent } from '../combat/rules';
import { freshThreats, visibleThreats } from '../combat/threat';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { carriesHealingPotion } from '../floors/fountains';
import { knownStairs, headingOut } from '../floors/rules';
import { isBottomFloor } from '../floors/dungeon';
import { explored } from '../perception';
import type { ActorEntity } from '../state';
import { statValue } from '../stats/getStat';
import { CONDITIONS, RULE_ACTIONS } from '../registries';
import { HEAL_BELOW_PERCENT } from '../items/rules';
import { isOverloaded } from '../items/inventory';

/** What a stance row must leave alone. `hurt`: HP and gear errands don't hold it back (turning for home). */
interface MayActOptions {
  /** Whether a hurt or overloaded adventurer may still act (the retreat rows). */
  readonly hurt?: boolean;
  /** Whether a threat in sight (not next to the actor) holds it back. */
  readonly threats?: boolean;
}

/**
 * Why a stance row must not fire right now, or `null` when it may: the party is already heading
 * out, the actor is fleeing, an enemy is next to it or (with `threats`) a threat is in sight, it
 * needs healing it carries (below `HEAL_BELOW_PERCENT` with a healing potion) or is overloaded.
 * The one place the stance rows learn what the baseline puts first.
 */
export function stanceBlock(ctx: AiCtx, { hurt = false, threats = true }: MayActOptions = {}): string | null {
  const { state, actor } = ctx;
  if (headingOut(state)) return 'already heading out';
  if (actor.ai.memory.fleeing !== null) return 'fleeing';
  if (adjacentEnemies(state, actor).length > 0) return 'an enemy is next to me';
  if (threats && visibleThreats(state, actor).length > 0) return 'a threat is in sight';
  if (!hurt) {
    if (hpPercent(state, actor) < HEAL_BELOW_PERCENT && carriesHealingPotion(state, actor)) return 'needs healing';
    if (isOverloaded(state, actor)) return 'overloaded';
  }
  return null;
}

/** `cond.delve_ready` and `cond.party_worn`'s params: a percentage. */
interface PercentParams {
  percent: number;
}

const parsePercent: ParamParser<PercentParams> = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'Params must be an object with "percent"';
  const { percent, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 1 || percent > 100) {
    return '"percent" must be a whole number from 1 to 100';
  }
  return { percent };
};

/**
 * True when the party may head down: nothing more urgent, stairs down known on a floor that has
 * them, at least `percent`% of the floor seen, every contract still open (once all are done the
 * baseline turns back instead) and no contract item to fetch on this floor first.
 */
export const COND_DELVE_READY = defineCondition({
  id: 'cond.delve_ready',
  name: 'Ready to head down',
  description:
    'True when nothing urgent is going on, the stairs down are known and at least the given share of the floor has been seen, ' +
    'and there is no contract item left to fetch on this floor.',
  parse: parsePercent,
  evaluate(ctx, { percent }) {
    const { state, actor } = ctx;
    if (stanceBlock(ctx) !== null) return { ok: false, detail: '' };
    if (isBottomFloor(state, actor.floor) || knownStairs(state, actor.floor, 'down') === null) return { ok: false, detail: '' };
    const seen = Math.round(explored(state, actor.floor).fraction * 100);
    if (seen < percent) return { ok: false, detail: '' };
    if (CONDITIONS.get('cond.contracts_complete').evaluate(ctx, undefined).ok) return { ok: false, detail: '' };
    if (RULE_ACTIONS.get('act.recover_contract_item').resolve(ctx, undefined) !== null) return { ok: false, detail: '' };
    return { ok: true, detail: `stairs known, ${seen}% explored` };
  },
  describe: ({ percent }) => `the stairs down are known and ${percent}% of the floor is seen`,
});

/** True when the living party's combined HP is below `percent`% of its combined maximum, with nothing in sight. */
export const COND_PARTY_WORN = defineCondition({
  id: 'cond.party_worn',
  name: 'Party worn down',
  description:
    'True when the living members’ combined HP is below the given share of their combined maximum HP and nothing threatening is in sight or next to this adventurer.',
  parse: parsePercent,
  evaluate(ctx, { percent }) {
    const { state } = ctx;
    if (stanceBlock(ctx, { hurt: true }) !== null) return { ok: false, detail: '' };
    let hp = 0;
    let max = 0;
    for (const id of state.party) {
      const e = state.entities[id];
      if (e?.actor === undefined || e.actor.hp <= 0) continue;
      hp += e.actor.hp;
      max += statValue(state, e as ActorEntity, 'hp');
    }
    if (max === 0) return { ok: false, detail: '' };
    const share = Math.round((hp * 100) / max);
    return share < percent ? { ok: true, detail: `the party is down to ${share}% of its HP` } : { ok: false, detail: '' };
  },
  describe: ({ percent }) => `the party is below ${percent}% of its HP`,
});

/** How many turns ago a threat may have been seen and still be charged (so a corner can't hide it for a step). */
export const CHARGE_MEMORY_TURNS = 5;

/** What a charge heads for: the nearest threat in sight, else the spot one was seen at a few turns ago. */
function chargeTarget(ctx: AiCtx): { pos: Pos; name: string } | null {
  const { state, actor } = ctx;
  const seen = visibleThreats(state, actor)[0];
  if (seen !== undefined) return { pos: seen.pos, name: nameOf(seen) };
  const marks = freshThreats(state, actor).filter((m) => state.turn - m.seen <= CHARGE_MEMORY_TURNS);
  const mark = marks.sort((a, b) => b.seen - a.seen || a.id - b.id)[0];
  return mark === undefined || (mark.pos.x === actor.pos.x && mark.pos.y === actor.pos.y) ? null : { pos: mark.pos, name: mark.name };
}

/** True when a threat is in sight (or was a moment ago) but not next to this adventurer, and it has no need to flee or heal first. */
export const COND_RECKLESS_CHARGE = defineCondition({
  id: 'cond.reckless_charge',
  name: 'Enemy to charge',
  description:
    'True when an enemy that can hurt the party is in sight (or was a few turns ago) but not yet next to this adventurer, ' +
    'and it is not fleeing or in need of healing.',
  parse: noParams,
  evaluate(ctx) {
    const { state, actor } = ctx;
    if (stanceBlock(ctx, { threats: false }) !== null) return { ok: false, detail: '' };
    if (hpPercent(state, actor) < fleeBelowOf(actor)) return { ok: false, detail: '' };
    const target = chargeTarget(ctx);
    return target === null ? { ok: false, detail: '' } : { ok: true, detail: `${target.name} in sight` };
  },
  describe: () => 'an enemy that can hurt the party is in sight',
});

/** Walk at the nearest threat the party can see, or saw a moment ago, until it is next to it. */
export const ACT_CHARGE = defineRuleAction({
  id: 'act.charge',
  name: 'Charge',
  description:
    'Walk straight at the nearest enemy that can hurt the party, opening doors on the way, and keep going for a few turns ' +
    'when a corner hides it. Stops once it is next to the enemy and the fight begins.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const target = chargeTarget(ctx);
    if (target === null) return null;
    const paths = aiPathGrid(ctx);
    const map = buildGoalMap(paths, [target.pos]);
    if (map.get(ctx.actor.pos.x, ctx.actor.pos.y) === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `charging the ${target.name.replace(/^the /, '')}`);
  },
  describe: () => 'charge the nearest enemy',
});

/** True when the party may turn for home: not already heading out, not fleeing, no enemy next to this adventurer. */
export const COND_FALL_BACK_READY = defineCondition({
  id: 'cond.fall_back_ready',
  name: 'Free to fall back',
  description: 'True when the party has not turned for home yet, this adventurer is not fleeing and no enemy is next to it.',
  parse: noParams,
  evaluate(ctx) {
    return stanceBlock(ctx, { hurt: true, threats: false }) === null ? { ok: true, detail: 'the order is to fall back' } : { ok: false, detail: '' };
  },
  describe: () => 'free to head home',
});

/** The stance conditions, registered in `domains.ts`. */
export const STANCE_CONDITIONS: readonly ConditionDef[] = [COND_DELVE_READY, COND_PARTY_WORN, COND_RECKLESS_CHARGE, COND_FALL_BACK_READY];


/** The stance rule actions, registered in `domains.ts`. */
export const STANCE_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_CHARGE];
