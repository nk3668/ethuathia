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
import { defineCondition, defineRuleAction, noParams, parseMinCount } from '../ai/types';
import type { ConditionDef, Resolved, RuleActionDef } from '../ai/types';
import { floorNode, stairsTarget } from '../floors/dungeon';
import { knownStairs, partyMemberAt, stairsGathering } from '../floors/rules';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { runKills } from './trackers';

/** True once the party has turned back for the surface. */
export const COND_HEADING_OUT = defineCondition({
  id: 'cond.heading_out',
  name: 'Heading out',
  scope: 'run',
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

/** True once the party has killed at least `min` monsters in this run (ETH-184). */
export const COND_RUN_KILLS = defineCondition({
  id: 'cond.run_kills',
  name: 'Monsters killed this run',
  scope: 'run',
  description: 'True once the party has killed at least the given number of monsters in this run.',
  parse: parseMinCount,
  evaluate({ state }, { min }) {
    const kills = runKills(state);
    return kills >= min
      ? { ok: true, detail: `${kills} ${kills === 1 ? 'monster' : 'monsters'} killed this run` }
      : { ok: false, detail: '' };
  },
  describe: ({ min }) => (min === 1 ? 'killed a monster' : `killed ${min} monsters`),
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
    'The party keeps everything it earned, and every survivor returns to the roster. A wounded adventurer with no healing ' +
    'whose every way forward is near a threat it remembers turns the party back this way too.',
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
    // Only a party member on the stairs is waited for (ETH-113): anyone else is walked up to.
    const occupied = partyMemberAt(state, actor.floor, stairs);
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
export const RUN_DOMAIN_CONDITIONS: readonly ConditionDef[] = [COND_HEADING_OUT, COND_RUN_KILLS];

/** The run domain's rule actions, in registration order. */
export const RUN_DOMAIN_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_RETREAT_RUN];
