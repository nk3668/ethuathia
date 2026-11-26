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
import { aiPathGrid, followMap, nameOf } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiMemory, Resolved } from '../ai/types';
import { FLEE_CYCLE_GIVE_UP, FLEE_HOPELESS_RECOVER_PERCENT, FLEE_RELEASE_PERCENT, FLEE_REST_GIVE_UP } from './fleeConfig';
import { cycleRecoverPercent } from './zone';
import { partyOnFloor, PARTY_CLOSE } from '../floors/rules';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import type { ActorEntity } from '../state';
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
    `${FLEE_RELEASE_PERCENT}%, when the rest runs out (not while the foe is being avoided), or when a threat comes into sight. A wounded adventurer with no healing and a threat on every way forward rests the same way. Waiting here never counts as being stuck.`,
  idle: true,
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const { fleeCycle, boxedIn } = actor.ai.memory;
    if (actor.actor.faction !== 'party' || (fleeCycle === undefined && boxedIn === undefined)) return null;
    const hp = Math.round(hpPercent(state, actor));
    if (fleeCycle === undefined) return { request: { id: 'wait' }, detail: `resting: wounded with no healing and threats on every way forward, HP ${hp}% (until ${FLEE_RELEASE_PERCENT}%)` };
    return { request: { id: 'wait' }, detail: `resting to recover before going back, HP ${hp}% (until ${cycleRecoverPercent(fleeCycle)}%)` };
  },
  describe: () => 'rest to recover',
});

/** Whether a flee/return cycle is past helping: too many flights in a row, or rests that did not bring HP back. */
export function cycleHopeless(cycle: NonNullable<AiMemory['fleeCycle']>): boolean {
  return cycle.episodes >= FLEE_CYCLE_GIVE_UP || (cycle.rests ?? 0) >= FLEE_REST_GIVE_UP;
}

/**
 * True while the adventurer has given up on getting past a foe (ETH-189): after `FLEE_CYCLE_GIVE_UP`
 * flights in one cycle, or `FLEE_REST_GIVE_UP` rests that did not bring HP back, the area around the foe
 * is off-limits for exploring and going down. It is on until HP is back to `FLEE_HOPELESS_RECOVER_PERCENT`; as a
 * baseline rule it sits below exploring and descending, so it only holds
 * the adventurer still when there is nowhere else to go.
 */
export const COND_CYCLE_BLOCKED = defineCondition({
  id: 'cond.cycle_blocked',
  name: 'Cannot get past',
  description:
    `True after fleeing the same foe over and over without recovering (${FLEE_CYCLE_GIVE_UP} flights, or ${FLEE_REST_GIVE_UP} rests ` +
    `that did not bring HP back), until HP is back to ${FLEE_HOPELESS_RECOVER_PERCENT}%. The ground around that foe ` +
    'is off-limits meanwhile; the adventurer explores or descends elsewhere, or rests when there is nothing else to do. Ending the run is the player\'s call (the Fall back stance).',
  parse: noParams,
  evaluate({ state, actor }) {
    const cycle = actor.ai.memory.fleeCycle;
    if (cycle?.blocked === undefined) return { ok: false, detail: '' };
    const hp = hpPercent(state, actor);
    if (hp >= cycleRecoverPercent(cycle)) return { ok: false, detail: '' };
    return { ok: true, detail: `can't get past the foe near (${cycle.blocked.x}, ${cycle.blocked.y}), HP ${Math.round(hp)}%` };
  },
  describe: () => 'cannot get past a foe it keeps fleeing',
});

/**
 * `cond.cycle_blocked` while the party is heading out (ETH-154). On the way out nobody explores or
 * descends, so the foe the adventurer keeps fleeing stands between it and the stairs up and the
 * flee/walk-back loop would run to the turn cap: it rests (above `act.retreat_run`) until HP is back instead.
 */
export const COND_CYCLE_BLOCKED_ON_THE_WAY_OUT = defineCondition({
  id: 'cond.cycle_blocked_leaving',
  name: 'Cannot get past on the way out',
  description:
    `True while the party is heading out and the adventurer cannot get past a foe it keeps fleeing (see Cannot get past): it rests until HP is back to ${FLEE_HOPELESS_RECOVER_PERCENT}% rather than walk back into it. ` +
    "Ending the run is the player's call (the Fall back stance).",
  parse: noParams,
  evaluate(ctx) {
    if (ctx.state.domains.run.leaving === null) return { ok: false, detail: '' };
    return COND_CYCLE_BLOCKED.evaluate(ctx, {});
  },
  describe: () => 'cannot get past a foe it keeps fleeing on the way out',
});

/** The nearest living party member on `actor`'s floor whose last decision was to rest (not `actor` itself). */
function restingAlly(actor: ActorEntity, state: Parameters<typeof partyOnFloor>[0]): ActorEntity | null {
  let best: ActorEntity | null = null;
  let bestGap = Infinity;
  for (const other of partyOnFloor(state, actor.floor)) {
    if (other.id === actor.id || other.ai?.memory.intent?.action !== ACT_REST.id) continue;
    const gap = Math.max(Math.abs(other.pos.x - actor.pos.x), Math.abs(other.pos.y - actor.pos.y));
    if (gap < bestGap) {
      best = other;
      bestGap = gap;
    }
  }
  return best;
}

/** True while another party member on the floor is resting to recover (ETH-189). */
export const COND_ALLY_RESTING = defineCondition({
  id: 'cond.ally_resting',
  name: 'An ally is resting',
  description:
    'True while another party member on this floor is resting to recover after fleeing over and over. The party ' +
    'does not walk off and leave them alone.',
  parse: noParams,
  evaluate({ state, actor }) {
    if (actor.actor.faction !== 'party') return { ok: false, detail: '' };
    const ally = restingAlly(actor, state);
    return ally === null ? { ok: false, detail: '' } : { ok: true, detail: `${nameOf(ally)} is resting` };
  },
  describe: () => 'an ally is resting to recover',
});

/** Stay with a resting ally: walk back to within `PARTY_CLOSE` tiles of them, then wait. */
export const ACT_WAIT_FOR_ALLY = defineRuleAction({
  id: 'act.wait_for_ally',
  name: 'Wait for an ally',
  description:
    `Stay near a party member who is resting to recover: walk back to within ${PARTY_CLOSE} tiles of them if further, then wait ` +
    'until they are back on their feet. Waiting here never counts as being stuck.',
  idle: true,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const ally = restingAlly(actor, state);
    if (ally === null) return null;
    const gap = Math.max(Math.abs(ally.pos.x - actor.pos.x), Math.abs(ally.pos.y - actor.pos.y));
    const hp = Math.round(hpPercent(state, ally));
    if (gap > PARTY_CLOSE) {
      const paths = aiPathGrid(ctx);
      const map = buildGoalMap(paths, [ally.pos]);
      if (map.get(actor.pos.x, actor.pos.y) !== UNREACHABLE) {
        const step = followMap(ctx, paths, map, `going back to ${nameOf(ally)}, who is resting (HP ${hp}%)`);
        if (step !== null) return step;
      }
    }
    return { request: { id: 'wait' }, detail: `waiting for ${nameOf(ally)} to recover (HP ${hp}%)`, waitingFor: ally.id };
  },
  describe: () => 'wait for a resting ally',
});

export const RECOVER_CONDITIONS = [COND_RECOVERING, COND_CYCLE_BLOCKED, COND_CYCLE_BLOCKED_ON_THE_WAY_OUT, COND_ALLY_RESTING];
export const RECOVER_RULE_ACTIONS = [ACT_REST, ACT_WAIT_FOR_ALLY];
