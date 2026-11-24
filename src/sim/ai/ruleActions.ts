/**
 * The core rule actions: the "then" half of a rule (docs/ARCHITECTURE.md §4). Each is a
 * `RuleActionDef`; rules name them by id. `domains.ts` registers `CORE_RULE_ACTIONS` and every
 * domain's `ruleActions` in `RULE_ACTIONS`. A rule action turns the situation into one
 * `ActionRequest` for this turn, or `null` when it can't be done right now, in which case the
 * engine moves on to the next rule.
 *
 * The baseline behaviors are ordinary entries here, so the Library can hand any of them to the
 * player's own rules.
 */
import type { Pos } from '../../core';
import { buildFleeMap, buildGoalMap, UNREACHABLE } from '../goalMap';
import { aiPathGrid, followMap, frontier } from './navigate';
import { defineRuleAction, noParams } from './types';
import type { AiCtx, RuleActionDef } from './types';

/**
 * If `ctx.actor` is in the party and the floor's lead is currently exploring a frontier tile that
 * is still in `goals`, both the lead and its followers stay committed to that goal so adjacent
 * ally costs can't flip the lead between opposite branches and followers explore one corridor
 * together (ETH-145).
 */
function sharedExploreGoal(ctx: AiCtx, goals: readonly Pos[]): Pos[] | null {
  if (ctx.actor.actor.faction !== 'party') return null;
  const lead = ctx.state.party
    .map((id) => ctx.state.entities[id])
    .find((e) => e?.actor !== undefined && e.actor.hp > 0 && e.floor === ctx.actor.floor);
  if (lead === undefined) return null;
  const intent = lead.ai?.memory.intent;
  const goal = intent?.action === 'act.explore' ? intent.goal : undefined;
  if (goal === undefined) return null;
  return goals.some((g) => g.x === goal.x && g.y === goal.y) ? [goal] : null;
}

/**
 * Walk toward the nearest ground the party hasn't seen, opening doors on the way. Frontier-based
 * (CLAUDE.md §5.3): the goals are the known tiles next to unseen ones, so explored dead ends are
 * never goals and never on the way to one, and it can't be done once nothing reachable is left.
 */
export const ACT_EXPLORE = defineRuleAction({
  id: 'act.explore',
  name: 'Explore',
  description:
    'Head for the nearest place the party hasn’t seen yet, opening doors on the way. Only ground the party ' +
    'knows is walked on, explored dead ends are never visited again, and nothing happens once every place ' +
    'the adventurer can reach has been seen.',
  parse: noParams,
  resolve(ctx) {
    const paths = aiPathGrid(ctx);
    const goals = frontier(ctx, paths);
    if (goals.length === 0) return null;
    const shared = sharedExploreGoal(ctx, goals);
    let map = buildGoalMap(paths, shared ?? goals);
    let cost = map.get(ctx.actor.pos.x, ctx.actor.pos.y);
    if (cost === UNREACHABLE && shared !== null) {
      map = buildGoalMap(paths, goals);
      cost = map.get(ctx.actor.pos.x, ctx.actor.pos.y);
    }
    if (cost === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `heading for unexplored ground ${cost} ${cost === 1 ? 'turn' : 'turns'} away`);
  },
  describe: () => 'explore the nearest unexplored ground',
});

/**
 * Get away from the spot where the actor last got stuck, using a flee map so it heads for open
 * ground rather than into a corner. Gives other actors in the way room to pass, and gives the
 * dropped goal a fresh start when it is picked up again.
 */
export const ACT_BACK_OFF = defineRuleAction({
  id: 'act.back_off',
  name: 'Back off',
  description:
    'Move away from the spot where the adventurer last got stuck, toward open ground. Clears the way for ' +
    'whoever was blocking and lets the dropped goal start afresh.',
  parse: noParams,
  resolve(ctx) {
    const dropped = ctx.actor.ai.memory.dropped;
    if (dropped?.floor !== ctx.actor.floor) return null;
    // Whoever was in the way may still be: route around them, never through.
    const paths = aiPathGrid(ctx, 'blocked');
    const flee = buildFleeMap(paths, buildGoalMap(paths, [dropped.pos]));
    return followMap(ctx, paths, flee, `backing away from where I got stuck at (${dropped.pos.x}, ${dropped.pos.y})`);
  },
  describe: () => 'back away from where I got stuck',
});

/** Stand still. The baseline's last rule, so a decision always has an answer. */
export const ACT_WAIT = defineRuleAction({
  id: 'act.wait',
  name: 'Wait',
  description: 'Stand still for a turn. What an adventurer does when there is nothing else to do.',
  idle: true,
  parse: noParams,
  resolve: () => ({ request: { id: 'wait' }, detail: 'nothing else to do' }),
  describe: () => 'wait',
});

/** The core rule actions, in registration order. */
export const CORE_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_EXPLORE, ACT_BACK_OFF, ACT_WAIT];
