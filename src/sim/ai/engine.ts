/**
 * The decision engine (docs/ARCHITECTURE.md §4): one rule walker for every AI-driven actor.
 *
 * An actor's rules are checked top to bottom, then the baseline rules after them. The first
 * enabled rule whose condition holds and whose action resolves to something the actor can do
 * right now is taken, and a `ruleFired` event records which rule it was and why. The baseline is
 * an ordinary rule list over ordinary conditions and rule actions: nothing is special-cased.
 *
 * Before walking the rules the engine checks for progress (stuck detection): if the actor has
 * neither moved nor seen anything new for `STUCK_TURNS` decisions while working toward a goal,
 * the rule behind that goal is dropped for `DROP_TURNS` turns, a `stuck` event says so, and the
 * walk picks something else. Waiting counts too (ETH-113): if an adventurer spends
 * `WAIT_STUCK_TURNS` decisions in a row waiting on a rule such as gathering at the stairs while
 * nobody in the party moves, that rule is dropped the same way, so a blocker nobody deals with
 * can't hang a run without a trace.
 */
import type { Pos } from '../../core';
import { validateAction } from '../actions';
import type { ActionRequest } from '../actions';
import type { Emit } from '../events';
import { ITEMS_BASELINE_LOOT, ITEMS_BASELINE_URGENT } from '../items/rules';
import { registerInvariant } from '../invariants';
import { explored } from '../perception';
import { QUESTS_BASELINE } from '../quests/rules';
import { CONDITIONS, RULE_ACTIONS } from '../registries';
import type { Decide } from '../step';
import type { EntityId, RunState } from '../state';
import type { AiActor, AiCtx, AiMemory, Rule, RuleRef } from './types';

/** Decisions in a row without progress after which the current goal is dropped. */
export const STUCK_TURNS = 10;

/** How far (in tiles, either axis) an actor may stray from where it started counting and still count as not moving. */
export const LOITER_RADIUS = 1;

/**
 * Decisions in a row spent waiting (by an idle rule other than the plain `act.wait`) with nobody
 * in the party moving, after which that rule is dropped like a goal (ETH-113). Far above
 * `STUCK_TURNS`: waiting for the party to gather is normal, but not this long with nobody coming.
 */
export const WAIT_STUCK_TURNS = 50;

/** The baseline's last resort, "nothing else to do": waiting on it never counts as stuck. */
const PLAIN_WAIT = 'act.wait';

/** How many turns a dropped goal's rule is skipped for. */
export const DROP_TURNS = 20;

/** The HP fraction, in percent, below which the baseline flees (baseline #2). */
export const BASELINE_FLEE_PERCENT = 35;

/**
 * The built-in rules every adventurer falls back on after its own (CLAUDE.md §5.3), in order:
 * quaff healing below 35% HP and drop the least valuable thing when overloaded (items, ETH-061);
 * back off after getting stuck; below `BASELINE_FLEE_PERCENT`% HP with an enemy in sight, flee
 * if there is an escape route (`act.flee` can't be done otherwise, so a cornered adventurer
 * fights on); attack an adjacent enemy (combat, ETH-060); rush a caster in sight that has you in
 * bolt range (ETH-040); once the party has turned back, climb
 * out with it (waiting at the stairs up for the others); walk back to the party's lead when more
 * than `PARTY_LEASH` tiles from it (ETH-145); once every contract is complete, turn
 * back and leave, and fetch a contract's item (the relic) once the party has seen it, however far
 * (quests, ETH-024, `src/sim/quests/rules.ts`); head down without waiting once the
 * floor's turn cap is spent; below half HP with no healing potion, drink from a known fountain
 * (ETH-072); pick up wanted items a few steps away (items, ETH-061); explore the frontier; once
 * nothing is left to explore, go down the stairs with the party, waiting at them until everyone
 * on the floor has gathered; on the bottom floor with nothing left to do, turn back and leave (a
 * retreat, since the contracts are not done); otherwise wait. The floors conditions and rule
 * actions are in `src/sim/floors/rules.ts` (fountains in `src/sim/floors/fountains.ts`), the
 * heading-out ones in `src/sim/run/rules.ts`, the items ones in `src/sim/items/rules.ts`, the
 * combat ones in `src/sim/combat/rules.ts`. Only adventurers use the baseline: monsters follow
 * their def's rules alone.
 */
export const BASELINE_RULES: readonly Rule[] = [
  // Items (ETH-061): quaff healing when hurt, drop the least valuable thing when overloaded.
  ...ITEMS_BASELINE_URGENT,
  { condition: { id: 'cond.stuck' }, action: { id: 'act.back_off' }, enabled: true },
  { condition: { id: 'cond.hp_below', params: { percent: BASELINE_FLEE_PERCENT } }, action: { id: 'act.flee' }, enabled: true },
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.attack_adjacent' }, enabled: true },
  // Combat roles (ETH-040): rush a caster that can bolt you rather than stand under fire.
  { condition: { id: 'cond.in_bolt_range' }, action: { id: 'act.rush_caster' }, enabled: true },
  { condition: { id: 'cond.heading_out' }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.heading_out' }, action: { id: 'act.gather', params: { dir: 'up' } }, enabled: true },
  // Quests (ETH-024): once every contract is complete, head out; fetch a contract item once seen.
  ...QUESTS_BASELINE,
  { condition: { id: 'cond.floor_overstayed' }, action: { id: 'act.descend', params: { regroup: false } }, enabled: true },
  { condition: { id: 'cond.hurt_no_healing', params: { below: 50 } }, action: { id: 'act.drink_fountain' }, enabled: true },
  // Items (ETH-061): pick up wanted items a short detour away.
  ...ITEMS_BASELINE_LOOT,
  // Cohesion (ETH-145): while there is still ground to explore, stay near the party's lead rather
  // than fight alone. Below every errand and above exploring, so it never fights the descent.
  { condition: { id: 'cond.party_scattered' }, action: { id: 'act.regroup' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.explore' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.descend' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.gather' }, enabled: true },
  // Don't treat a temporarily dropped Explore as "bottom floor complete, abort the run": wait out
  // the drop instead (ETH-145).
  { condition: { id: 'cond.stuck' }, action: { id: 'act.wait' }, enabled: true },
  { condition: { id: 'cond.bottom_floor' }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true },
];

/** The rule a decision took, and what it asked for. */
export interface Choice {
  rule: RuleRef;
  /** The condition's and the rule action's ids. */
  condition: string;
  action: string;
  request: ActionRequest;
  /** The readable reason, e.g. "Explore: heading for unexplored ground 6 turns away". */
  detail: string;
  /** Who the action waits on to get out of the way, if anyone (`AiMemory.waitingFor`). */
  waitingFor: EntityId | null;
  /** The tile the action is heading for or targeting, if any (`Intent.goal`, ETH-019). */
  goal?: Pos;
  /** Reasons earlier rules (or skipped options on this rule) passed (ETH-094). */
  skipped?: readonly string[];
}

/**
 * The default `Decide` for `step`. Actors with an AI part get the engine: stuck detection, then
 * the first rule that applies, traced with `ruleFired`. Actors without one wait.
 *
 * Party members get all of it. Monsters (anything not in the party) run their own rules the same
 * way and remember their intent, but skip stuck detection and the `ruleFired` trace: the trace
 * explains the party's choices, and a floor of monsters would bury it.
 */
export const ruleDecide: Decide = ({ state, actor, emit }) => {
  if (actor.ai === undefined) return { id: 'wait' };
  const ctx: AiCtx = { state, actor: actor as AiActor };
  const memory = ctx.actor.ai.memory;
  const traced = actor.actor.faction === 'party';
  const partyStill = traced && checkProgress(ctx, emit);

  let choice = chooseRule(ctx);
  // Waiting too long with nobody moving drops the waiting rule; choose again without it.
  if (traced && choice !== null && countWaiting(ctx, choice, partyStill, emit)) choice = chooseRule(ctx);
  memory.waitingFor = choice?.waitingFor ?? null;
  if (choice === null) {
    memory.intent = null;
    return { id: 'wait' };
  }
  memory.intent = {
    rule: { ...choice.rule },
    action: choice.action,
    detail: choice.detail,
    ...(choice.goal === undefined ? {} : { goal: { x: choice.goal.x, y: choice.goal.y } }),
  };
  if (!traced) return choice.request;
  emit({
    type: 'ruleFired',
    actor: actor.id,
    rule: { ...choice.rule },
    condition: choice.condition,
    action: choice.action,
    detail: choice.detail,
    ...(choice.skipped === undefined ? {} : { skipped: choice.skipped }),
  });
  return choice.request;
};

/**
 * The first rule, the actor's own and then the baseline, that is enabled, isn't a dropped goal,
 * names a known condition and rule action, has its condition hold, and resolves to an action
 * that passes `validateAction`. `null` if none does. Changes nothing.
 */
export function chooseRule(ctx: AiCtx): Choice | null {
  const { state, actor } = ctx;
  const notes: string[] = [];
  for (const [rule, ref] of rulesOf(actor)) {
    if (!rule.enabled || isDropped(state, actor.ai.memory, ref)) continue;
    if (!CONDITIONS.has(rule.condition.id) || !RULE_ACTIONS.has(rule.action.id)) continue;
    const condition = CONDITIONS.get(rule.condition.id);
    const held = condition.evaluate(ctx, rule.condition.params);
    if (!held.ok) continue;
    const action = RULE_ACTIONS.get(rule.action.id);
    const resolved = action.resolve(ctx, rule.action.params);
    if (resolved === null) continue;
    if (!('request' in resolved)) {
      if (resolved.skipped !== '' && !notes.includes(resolved.skipped)) notes.push(resolved.skipped);
      continue;
    }
    if (validateAction(state, actor, resolved.request) !== null) continue;
    if (resolved.skipped !== undefined && resolved.skipped !== '' && !notes.includes(resolved.skipped)) {
      notes.push(resolved.skipped);
    }
    const because = held.detail === '' ? '' : ` (${held.detail})`;
    const skipped = notes.length === 0 ? '' : `; ${notes.join('; ')}`;
    return {
      rule: ref,
      condition: condition.id,
      action: action.id,
      request: resolved.request,
      detail: `${action.name}: ${resolved.detail}${because}${skipped}`,
      waitingFor: resolved.waitingFor ?? null,
      ...(resolved.goal === undefined ? {} : { goal: { x: resolved.goal.x, y: resolved.goal.y } }),
      ...(notes.length === 0 ? {} : { skipped: notes }),
    };
  }
  return null;
}

/** The actor's own rules, then (for adventurers) the baseline rules, each with its reference. */
function* rulesOf(actor: AiActor): Generator<[Rule, RuleRef]> {
  for (const [index, rule] of actor.ai.rules.entries()) yield [rule, { set: 'own', index }];
  if (actor.adventurer === undefined) return;
  for (const [index, rule] of BASELINE_RULES.entries()) yield [rule, { set: 'baseline', index }];
}

function isDropped(state: RunState, memory: AiMemory, ref: RuleRef): boolean {
  const dropped = memory.dropped;
  return dropped !== null && state.turn < dropped.until && dropped.rule.set === ref.set && dropped.rule.index === ref.index;
}

/**
 * Stuck detection. Compares where the actor stands and how much of its floor the party has seen
 * with the last decision. After `STUCK_TURNS` decisions in a row with no change while the last
 * rule fired was working toward something (not an idle action like waiting), that rule is
 * dropped for `DROP_TURNS` turns and a `stuck` event is emitted. Also forgets a dropped goal once
 * its time is up. Returns whether nobody in the party has moved since the last decision, for
 * `countWaiting`.
 */
function checkProgress(ctx: AiCtx, emit: Emit): boolean {
  const { state, actor } = ctx;
  const memory = actor.ai.memory;
  if (memory.dropped !== null && state.turn >= memory.dropped.until) memory.dropped = null;

  const seen = explored(state, actor.floor).seen;
  const party = partyKey(state);
  const last = memory.last;
  const partyStill = last !== null && last.party === party;
  // Staying within one tile of where the count began is "not moving": two rules that undo each
  // other (flee from an enemy, then walk back toward the item behind it) swap the actor between
  // neighbouring tiles forever, which an exact-position check never sees. The mark keeps its
  // position (the anchor) while the actor stays near it, and moves on once it goes further.
  const same =
    last !== null &&
    last.floor === actor.floor &&
    Math.abs(last.pos.x - actor.pos.x) <= LOITER_RADIUS &&
    Math.abs(last.pos.y - actor.pos.y) <= LOITER_RADIUS &&
    last.seen === seen;
  memory.last = same ? { ...last, party } : { floor: actor.floor, pos: { x: actor.pos.x, y: actor.pos.y }, seen, party };

  const intent = memory.intent;
  const idle = intent === null || !RULE_ACTIONS.has(intent.action) || RULE_ACTIONS.get(intent.action).idle;
  if (!same || idle) {
    memory.still = 0;
    return partyStill;
  }
  memory.still++;
  if (memory.still < STUCK_TURNS) return partyStill;

  memory.still = 0;
  const goal = RULE_ACTIONS.get(intent.action).name;
  const remaining =
    intent.action === 'act.back_off' && memory.dropped !== null && state.turn < memory.dropped.until
      ? memory.dropped.until - state.turn
      : DROP_TURNS;
  const detail = `No progress in ${STUCK_TURNS} turns (${intent.detail}). Giving up on ${goal} for ${remaining} ${remaining === 1 ? 'turn' : 'turns'}.`;
  dropGoal(ctx, intent.rule, intent.action, STUCK_TURNS, detail, emit);
  return partyStill;
}

/**
 * Stuck detection for waiting (ETH-113). Counts decisions in a row where `choice` waits by an
 * idle rule other than the plain `act.wait` while nobody in the party has moved since the last
 * decision (`partyStill`). At `WAIT_STUCK_TURNS` the rule is dropped for `DROP_TURNS` turns, a
 * `stuck` event says why, and this returns true so the caller chooses again.
 */
function countWaiting(ctx: AiCtx, choice: Choice, partyStill: boolean, emit: Emit): boolean {
  const memory = ctx.actor.ai.memory;
  const action = RULE_ACTIONS.get(choice.action);
  const waiting = choice.request.id === 'wait' && action.idle && choice.action !== PLAIN_WAIT;
  memory.waited = waiting && partyStill ? memory.waited + 1 : 0;
  if (memory.waited < WAIT_STUCK_TURNS) return false;

  memory.waited = 0;
  const detail =
    `Waited ${WAIT_STUCK_TURNS} turns with nobody in the party moving (${choice.detail}). ` +
    `Giving up on ${action.name} for ${DROP_TURNS} turns.`;
  dropGoal(ctx, choice.rule, choice.action, WAIT_STUCK_TURNS, detail, emit);
  return true;
}

/** Drops `rule` for `DROP_TURNS` turns at the actor's spot and emits the `stuck` event. */
function dropGoal({ state, actor }: AiCtx, rule: RuleRef, action: string, turns: number, detail: string, emit: Emit): void {
  const pos = { x: actor.pos.x, y: actor.pos.y };
  const existing = actor.ai.memory.dropped;
  // Backing off runs only because a goal is already dropped; mark it stopped without overwriting `existing.rule`.
  if (action === 'act.back_off' && existing !== null && state.turn < existing.until) {
    existing.backedOff = true;
  } else {
    actor.ai.memory.dropped = { rule: { ...rule }, action, floor: actor.floor, pos, since: state.turn, until: state.turn + DROP_TURNS };
  }
  emit({ type: 'stuck', actor: actor.id, rule: { ...rule }, action, turns, detail, floor: actor.floor, pos: { ...pos } });
}

/** Where each living party member stands, as a key that changes whenever any of them moves. */
function partyKey(state: RunState): string {
  return state.party
    .map((id) => {
      const e = state.entities[id];
      return e?.actor === undefined || e.actor.hp <= 0 ? '-' : `${e.floor}:${e.pos.x},${e.pos.y}`;
    })
    .join('|');
}

/**
 * AI memory holds sane values: `intent.goal` (when set) has non-negative safe integers, `still` is a count, `waited` a count below
 * `WAIT_STUCK_TURNS`, and `waitingFor` is `null` or another entity's id that was handed out (the entity itself may have left the run since).
 */
registerInvariant('core.aiMemory', (state) => {
  const problems: string[] = [];
  for (const entity of Object.values(state.entities)) {
    const memory = entity.ai?.memory;
    if (memory === undefined) continue;
    const goal = memory.intent?.goal;
    if (goal !== undefined) {
      if (
        typeof goal !== 'object' ||
        goal === null ||
        !Number.isSafeInteger(goal.x) ||
        goal.x < 0 ||
        !Number.isSafeInteger(goal.y) ||
        goal.y < 0
      ) {
        problems.push(`actor ${entity.id} has invalid intent goal`);
      }
    }
    if (!Number.isSafeInteger(memory.still) || memory.still < 0) problems.push(`actor ${entity.id} has still ${memory.still}`);
    if (!Number.isSafeInteger(memory.waited) || memory.waited < 0 || memory.waited >= WAIT_STUCK_TURNS) {
      problems.push(`actor ${entity.id} has waited ${memory.waited}`);
    }
    if (memory.dropped !== null && memory.dropped.backedOff !== undefined && memory.dropped.backedOff !== true) {
      problems.push(`actor ${entity.id} has invalid dropped.backedOff`);
    }
    const waitingFor = memory.waitingFor;
    if (waitingFor === null) continue;
    if (!Number.isSafeInteger(waitingFor) || waitingFor < 1 || waitingFor >= state.nextEntityId || waitingFor === entity.id) {
      problems.push(`actor ${entity.id} is waiting for ${waitingFor}, which is not another entity`);
    }
  }
  return problems;
});
