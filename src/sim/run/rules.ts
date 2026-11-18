/**
 * The run domain's rule condition and rule action (docs/ARCHITECTURE.md §4): heading back up
 * through the floors and out of the dungeon, which ends the run.
 *
 * The party turns back when a `retreat` command is sent, or the first time any adventurer's
 * `act.retreat_run` fires (the baseline fires it on the bottom floor once nothing is left to do).
 * From then on `state.domains.run.leaving` is set, `cond.heading_out` holds, and nobody heads
 * down again.
 */
import { aiPathGrid, followMap } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { ConditionDef, Resolved, RuleActionDef } from '../ai/types';
import { actorAt } from '../entities';
import { floorNode, stairsTarget } from '../floors/dungeon';
import { knownStairs, stairsGathering } from '../floors/rules';
import { buildGoalMap, UNREACHABLE } from '../goalMap';

/** True once the party has turned back for the surface. */
export const COND_HEADING_OUT = defineCondition({
  id: 'cond.heading_out',
  name: 'Heading out',
  description:
    'True once the party has turned back for the surface: after a retreat order, or once any adventurer has started a retreat.',
  parse: noParams,
  evaluate({ state }) {
    const leaving = state.domains.run.leaving;
    if (leaving === null) return { ok: false, detail: '' };
    return { ok: true, detail: leaving.reason === 'ordered' ? 'retreat ordered' : 'the party has turned back' };
  },
  describe: () => 'heading out of the dungeon',
});

/**
 * Head up through the floors and out of the dungeon, which ends the run as a retreat (or a
 * victory once every contract is complete). Firing it turns the whole party back. The party
 * climbs together: a member on the stairs up takes them once every living member on the floor
 * has gathered, and at the way out once the whole party has (`stairsGathering`); `act.gather`
 * with `dir: 'up'` does the waiting.
 */
export const ACT_RETREAT_RUN = defineRuleAction({
  id: 'act.retreat_run',
  name: 'Retreat',
  description:
    'Turn the whole party back: climb the stairs up floor by floor and walk out of the dungeon, ending the run. ' +
    'The party keeps everything it earned, and every survivor returns to the roster.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const stairs = knownStairs(state, actor.floor, 'up');
    if (stairs === null) return null;
    const to = stairsTarget(state, actor.floor, 'up');
    const where = to === null ? 'out of the dungeon' : `up to floor ${floorNode(state, to).depth}`;
    const { gathered, missing } = stairsGathering(state, actor.floor, stairs, 'up');

    if (actor.pos.x === stairs.x && actor.pos.y === stairs.y) {
      if (missing.length > 0) return null;
      const others = gathered.length > 1 ? 'the party is gathered; ' : '';
      return { request: { id: 'stairs', dir: 'up' }, detail: `${others}taking the stairs ${where}` };
    }
    const occupied = actorAt(state, actor.floor, stairs) !== undefined;
    if (occupied && gathered.some((g) => g.id === actor.id)) return null;

    const paths = aiPathGrid(ctx);
    const map = buildGoalMap(paths, [stairs]);
    const cost = map.get(actor.pos.x, actor.pos.y);
    if (cost === UNREACHABLE) return null;
    const out = to === null ? ' and out' : '';
    return followMap(ctx, paths, map, `heading for the stairs up${out}, ${cost} ${cost === 1 ? 'turn' : 'turns'} away`);
  },
  describe: () => 'retreat out of the dungeon',
});

/** The run domain's conditions, in registration order. */
export const RUN_DOMAIN_CONDITIONS: readonly ConditionDef[] = [COND_HEADING_OUT];

/** The run domain's rule actions, in registration order. */
export const RUN_DOMAIN_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_RETREAT_RUN];
