/**
 * The rule conditions and rule actions behind the role and range options (ETH-193, CLAUDE.md §5.2):
 * Tank (`cond.ally_ahead`, `act.guard_front`), Healer (`act.tend_ally`), Scout (`act.avoid_fight`,
 * `act.scout_ahead`) and the range parameter (`act.hold_range`, a baseline rule). The options that
 * use them are content (`src/content/tacticsRoles.ts`); these only read the state and pick a request.
 *
 * Every one of them is for adventurers and says nothing (`null`) when it doesn't apply, so the
 * baseline carries on: no ally ahead, a melee of one's own, running at low HP, nothing to do.
 */
import { DIRS_8 } from '../../core';
import type { Pos } from '../../core';
import { ABILITY_TAG_INFO } from '../../content';
import { engageDistance, tacticsOf } from '../ai/tactics';
import { parseTag } from '../ai/tacticActions';
import { followMap, nameOf } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { ConditionDef, Resolved, ResolveResult, RuleActionDef } from '../ai/types';
import { stepBlocker } from '../coreActions';
import { blockerAt } from '../entities';
import { buildFleeMap, buildGoalMap, stepToward, UNREACHABLE } from '../goalMap';
import { CONDITIONS, RULE_ACTIONS } from '../registries';
import { partyLead } from '../floors/rules';
import type { ActorEntity, RunState } from '../state';
import { enemyKind } from './focus';
import { visibleAllies } from './roles';
import { adjacentEnemies, distance, fleeingNow, hpPercent, pathGridFor, visibleEnemies } from './rules';
import { visibleThreats } from './threat';

/** A Scout may range up to this many times the formation's leash from the party's lead (ETH-193). */
export const SCOUT_LEASH_FACTOR = 2;
/** A Scout keeps ranging ahead only at or above this share of its maximum HP. */
export const SCOUT_MIN_HP_PERCENT = 50;
/** A Scout only backs away from threats this close; farther ones are not yet a fight to avoid. */
export const SCOUT_AVOID_RANGE = 4;
/** A hold at range stays within this many tiles of the ally at the front. */
export const HOLD_RANGE_REACH = 6;

/** The nearest visible threat to `actor`, and the visible ally nearest it if that ally is closer to it than `actor` and already fighting something. */
function frontOf(ctx: { state: RunState; actor: ActorEntity }): { enemy: ActorEntity; ally: ActorEntity } | null {
  const { state, actor } = ctx;
  const enemy = visibleThreats(state, actor)[0];
  if (enemy === undefined) return null;
  const mine = distance(actor.pos, enemy.pos);
  const ally = visibleAllies(state, actor)
    .filter((a) => distance(a.pos, enemy.pos) < mine && adjacentEnemies(state, a).length > 0)
    .sort((a, b) => distance(a.pos, enemy.pos) - distance(b.pos, enemy.pos) || a.id - b.id)[0];
  return ally === undefined ? null : { enemy, ally };
}

/** The free tile next to `actor` farthest from every enemy in `enemies` and at least `min` tiles from each, or null. */
function stepAway(ctx: { state: RunState; actor: ActorEntity }, enemies: readonly ActorEntity[], min: number): { dir: Pos; to: Pos; gap: number } | null {
  const { state, actor } = ctx;
  let best: { dir: Pos; to: Pos; gap: number } | null = null;
  for (const dir of DIRS_8) {
    if (stepBlocker(state, actor.floor, actor.pos, dir) !== null) continue;
    const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
    if (blockerAt(state, actor, actor.floor, to) !== undefined) continue;
    const gap = Math.min(...enemies.map((e) => distance(e.pos, to)));
    if (gap >= min && (best === null || gap > best.gap)) best = { dir, to, gap };
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Conditions

/** True when an ally in sight is nearer the nearest enemy in sight than the actor is. */
export const COND_ALLY_AHEAD = defineCondition({
  id: 'cond.ally_ahead',
  name: 'Ally ahead',
  description:
    'True when a threat is in sight, none is next to this adventurer yet, and an ally in sight, already in a fight, is nearer it than ' +
    'it is. False while running at low HP.',
  parse: noParams,
  evaluate({ state, actor }) {
    if (actor.actor.faction !== 'party' || fleeingNow(state, actor) || adjacentEnemies(state, actor).length > 0) return { ok: false, detail: '' };
    const front = frontOf({ state, actor });
    return front === null ? { ok: false, detail: '' } : { ok: true, detail: `${nameOf(front.ally)} is nearer ${nameOf(front.enemy)} than I am` };
  },
  describe: () => 'an ally is nearer the enemy than I am',
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/** Tank: close in on the nearest enemy so the blow falls on you, not on the ally ahead. */
export const ACT_GUARD_FRONT = defineRuleAction({
  id: 'act.guard_front',
  name: 'Guard the front',
  description:
    'Walk toward the nearest threat in sight when an ally already fighting is nearer it than you are, to take the front from them. ' +
    'Stops once you are next to it (the baseline then fights) and can’t be done with no ally ahead of you.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const front = frontOf(ctx);
    if (front === null || fleeingNow(state, actor) || adjacentEnemies(state, actor).length > 0) return null;
    // Casters keep their distance and bolt from afar: rushing them is the baseline's job (`act.rush_caster`), not a chase to guard the front.
    if (enemyKind(front.enemy).caster) return null;
    const paths = pathGridFor(ctx);
    const map = buildGoalMap(paths, [front.enemy.pos]);
    if (map.get(actor.pos.x, actor.pos.y) === UNREACHABLE) return null;
    const step = followMap(ctx, paths, map, `stepping up to take ${nameOf(front.enemy)} before ${nameOf(front.ally)} does`);
    // Never push past an ally or queue behind one (a swap loop with a Healer holding range): the baseline plays on instead.
    return step === null || step.request.id === 'swap' || step.request.id === 'wait' ? null : step;
  },
  describe: () => 'step up to the front, ahead of an ally',
});

/**
 * Healer: heal the most hurt ally in sight with the best source of a tag. Sources reach only their
 * user today (`sourcesByTag`), so this always says there is nothing that fits, and the next rule
 * carries on; a source that can target an ally (ETH-195, M4) is wired in here.
 */
export const ACT_TEND_ALLY = defineRuleAction({
  id: 'act.tend_ally',
  name: 'Tend an ally',
  description:
    'Use the best thing you have with an ability tag, such as healing, on the most hurt ally in sight. Only possible with a source ' +
    'that can reach another adventurer; with none, the log says so and the adventurer carries on as normal.',
  parse: parseTag,
  resolve({ state, actor }, { tag }): ResolveResult {
    const hurt = visibleAllies(state, actor).find((a) => hpPercent(state, a) < 100);
    if (hurt === undefined) return null;
    return { skipped: `no ${ABILITY_TAG_INFO[tag].label.toLowerCase()} that reaches allies, carrying on as normal` };
  },
  describe: ({ tag }) => `use the best ${ABILITY_TAG_INFO[tag].label.toLowerCase()} on a hurt ally`,
});

/** Scout: step away from threats that are not yet next to the actor. */
export const ACT_AVOID_FIGHT = defineRuleAction({
  id: 'act.avoid_fight',
  name: 'Avoid the fight',
  description:
    `Walk away from enemies that will hurt the party and are within ${SCOUT_AVOID_RANGE} tiles but not yet next to you, toward open ground. ` +
    'Only while an ally nearer the enemy is already fighting, to take the fight. Does nothing alone, once an enemy is next to you, or when there is no ' +
    'step that leaves them all farther away.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    if (actor.actor.faction !== 'party' || adjacentEnemies(state, actor).length > 0 || fleeingNow(state, actor)) return null;
    // Only when someone else is nearer the enemy to take the fight: a Scout on its own would just
    // be walked back to the foe by exploring, so it plays as normal (and a pack of foes is not avoided).
    const front = frontOf(ctx);
    if (front === null) return null;
    const threats = visibleThreats(state, actor).filter((e) => distance(e.pos, actor.pos) <= SCOUT_AVOID_RANGE);
    const nearest = threats[0];
    if (nearest === undefined) return null;
    const paths = pathGridFor(ctx);
    const flee = buildFleeMap(paths, buildGoalMap(paths, threats.map((e) => e.pos)));
    const dir = stepToward(paths, flee, actor.pos);
    if (dir === null) return null;
    const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
    if (blockerAt(state, actor, actor.floor, to) !== undefined) return null;
    if (Math.min(...threats.map((e) => distance(e.pos, to))) <= distance(nearest.pos, actor.pos)) return null;
    return { request: { id: 'move', dir }, detail: `slipping away from ${nameOf(nearest)}`, goal: to };
  },
  describe: () => 'back away from enemies that are not yet next to me',
});

/** Scout: keep exploring instead of regrouping, within `SCOUT_LEASH_FACTOR` times the formation's leash. */
export const ACT_SCOUT_AHEAD = defineRuleAction({
  id: 'act.scout_ahead',
  name: 'Scout ahead',
  description:
    `Keep exploring when the party has fallen behind, up to ${SCOUT_LEASH_FACTOR} times the formation’s leash from its lead. ` +
    `Not with an enemy in sight, below ${SCOUT_MIN_HP_PERCENT}% HP, or once the party is heading out or the floor has been overstayed.`,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const lead = partyLead(state, actor.floor);
    if (lead === null || lead.id === actor.id) return null;
    if (visibleEnemies(state, actor).length > 0 || hpPercent(state, actor) < SCOUT_MIN_HP_PERCENT) return null;
    const leash = tacticsOf(ctx).formation.params?.leash;
    const gap = distance(lead.pos, actor.pos);
    if (typeof leash !== 'number' || gap > SCOUT_LEASH_FACTOR * leash) return null;
    // Errands the baseline puts first (heading out, a floor overstayed) still come first.
    for (const id of ['cond.heading_out', 'cond.floor_overstayed']) if (CONDITIONS.get(id).evaluate(ctx, undefined).ok) return null;
    const explore = RULE_ACTIONS.get('act.explore').resolve(ctx, undefined);
    if (explore === null || !('request' in explore)) return null;
    return { ...explore, detail: `ranging ahead, ${gap} tiles from ${nameOf(lead)}; ${explore.detail}` };
  },
  describe: () => 'keep exploring ahead of the party',
});

/**
 * The range options' baseline rule (`cond.enemy_visible`, before `act.attack_adjacent`): keep the
 * preferred engagement distance (`engageDistance`) while an ally holds the front. At engage 1
 * (Front line, the default) it is always `null`, so the baseline plays as it always has, and so is
 * it with nobody up front: a lone adventurer fights up close whatever its range.
 */
export const ACT_HOLD_RANGE = defineRuleAction({
  id: 'act.hold_range',
  name: 'Hold range',
  description:
    'Keep your range option’s distance from the enemy while an ally is fighting up front: step back when closer, wait when at ' +
    'the distance. Keep away also steps back from an enemy an ally is already fighting. With no ally at the front, or at Front line, ' +
    'it does nothing and you fight up close.',
  idle: true,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    if (actor.actor.faction !== 'party') return null;
    const engage = engageDistance(ctx);
    if (engage <= 1 || fleeingNow(state, actor)) return null;
    const enemies = visibleThreats(state, actor);
    const nearest = enemies[0];
    if (nearest === undefined) return null;
    const allies = visibleAllies(state, actor);
    const fighters = (e: ActorEntity) => allies.filter((a) => distance(a.pos, e.pos) <= 1);
    const next = adjacentEnemies(state, actor);
    const range = tacticsOf(ctx).range.name;
    if (next.length > 0) {
      // Only Keep away leaves a melee, and only one somebody else is already in.
      if (engage < 6 || !next.every((e) => fighters(e).length > 0)) return null;
      const step = stepAway(ctx, enemies, 2);
      if (step === null) return null;
      return { request: { id: 'move', dir: step.dir }, detail: `${range}: leaving ${nameOf(next[0] as ActorEntity)} to ${nameOf(fighters(next[0] as ActorEntity)[0] as ActorEntity)}`, goal: step.to };
    }
    const here = distance(nearest.pos, actor.pos);
    const front = allies
      .filter((a) => adjacentEnemies(state, a).length > 0 && distance(a.pos, actor.pos) <= HOLD_RANGE_REACH)
      .sort((a, b) => distance(a.pos, nearest.pos) - distance(b.pos, nearest.pos) || a.id - b.id)[0];
    if (front === undefined) return null;
    if (here < engage) {
      const step = stepAway(ctx, enemies, Math.min(engage, here + 1));
      if (step === null || step.gap <= here) return null;
      return { request: { id: 'move', dir: step.dir }, detail: `${range}: backing off to ${engage} tiles from ${nameOf(nearest)}, behind ${nameOf(front)}`, goal: step.to };
    }
    return { request: { id: 'wait' }, detail: `${range}: holding ${here} tiles from ${nameOf(nearest)}, behind ${nameOf(front)}` };
  },
  describe: () => 'hold my preferred distance behind the ally at the front',
});

/** The tactics roles' conditions, in registration order. */
export const TACTIC_ROLE_CONDITIONS: readonly ConditionDef[] = [COND_ALLY_AHEAD];

/** The tactics roles' rule actions, in registration order. */
export const TACTIC_ROLE_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_GUARD_FRONT, ACT_TEND_ALLY, ACT_AVOID_FIGHT, ACT_SCOUT_AHEAD, ACT_HOLD_RANGE];
