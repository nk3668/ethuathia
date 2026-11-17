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
 * walk picks something else.
 */
import { validateAction } from '../actions';
import type { ActionRequest } from '../actions';
import type { Emit } from '../events';
import { registerInvariant } from '../invariants';
import { explored } from '../perception';
import { CONDITIONS, RULE_ACTIONS } from '../registries';
import type { Decide } from '../step';
import type { EntityId, RunState } from '../state';
import type { AiActor, AiCtx, AiMemory, Rule, RuleRef } from './types';

/** Decisions in a row without progress after which the current goal is dropped. */
export const STUCK_TURNS = 10;

/** How many turns a dropped goal's rule is skipped for. */
export const DROP_TURNS = 20;

/**
 * The built-in rules every adventurer falls back on after its own (CLAUDE.md §5.3), in order:
 * back off after getting stuck, explore the frontier, and otherwise wait. Combat, fleeing and
 * leaving a finished floor join them in M1.
 */
export const BASELINE_RULES: readonly Rule[] = [
  { condition: { id: 'cond.stuck' }, action: { id: 'act.back_off' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.explore' }, enabled: true },
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
}

/**
 * The default `Decide` for `step`. Actors with an AI part get the engine: stuck detection, then
 * the first rule that applies, traced with `ruleFired`. Actors without one (monsters until they
 * get rule sets in M1) wait.
 */
export const ruleDecide: Decide = ({ state, actor, emit }) => {
  if (actor.ai === undefined) return { id: 'wait' };
  const ctx: AiCtx = { state, actor: actor as AiActor };
  const memory = ctx.actor.ai.memory;
  checkProgress(ctx, emit);

  const choice = chooseRule(ctx);
  memory.waitingFor = choice?.waitingFor ?? null;
  if (choice === null) {
    memory.intent = null;
    return { id: 'wait' };
  }
  memory.intent = { rule: { ...choice.rule }, action: choice.action, detail: choice.detail };
  emit({
    type: 'ruleFired',
    actor: actor.id,
    rule: { ...choice.rule },
    condition: choice.condition,
    action: choice.action,
    detail: choice.detail,
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
  for (const [rule, ref] of rulesOf(actor)) {
    if (!rule.enabled || isDropped(state, actor.ai.memory, ref)) continue;
    if (!CONDITIONS.has(rule.condition.id) || !RULE_ACTIONS.has(rule.action.id)) continue;
    const condition = CONDITIONS.get(rule.condition.id);
    const held = condition.evaluate(ctx, rule.condition.params);
    if (!held.ok) continue;
    const action = RULE_ACTIONS.get(rule.action.id);
    const resolved = action.resolve(ctx, rule.action.params);
    if (resolved === null || validateAction(state, actor, resolved.request) !== null) continue;
    const because = held.detail === '' ? '' : ` (${held.detail})`;
    return {
      rule: ref,
      condition: condition.id,
      action: action.id,
      request: resolved.request,
      detail: `${action.name}: ${resolved.detail}${because}`,
      waitingFor: resolved.waitingFor ?? null,
    };
  }
  return null;
}

/** The actor's own rules, then the baseline rules, each with its reference. */
function* rulesOf(actor: AiActor): Generator<[Rule, RuleRef]> {
  for (const [index, rule] of actor.ai.rules.entries()) yield [rule, { set: 'own', index }];
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
 * its time is up.
 */
function checkProgress({ state, actor }: AiCtx, emit: Emit): void {
  const memory = actor.ai.memory;
  if (memory.dropped !== null && state.turn >= memory.dropped.until) memory.dropped = null;

  const seen = explored(state, actor.floor).seen;
  const last = memory.last;
  const same =
    last !== null && last.floor === actor.floor && last.pos.x === actor.pos.x && last.pos.y === actor.pos.y && last.seen === seen;
  memory.last = { floor: actor.floor, pos: { x: actor.pos.x, y: actor.pos.y }, seen };

  const intent = memory.intent;
  const idle = intent === null || !RULE_ACTIONS.has(intent.action) || RULE_ACTIONS.get(intent.action).idle;
  if (!same || idle) {
    memory.still = 0;
    return;
  }
  memory.still++;
  if (memory.still < STUCK_TURNS) return;

  memory.still = 0;
  memory.dropped = {
    rule: { ...intent.rule },
    action: intent.action,
    floor: actor.floor,
    pos: { x: actor.pos.x, y: actor.pos.y },
    since: state.turn,
    until: state.turn + DROP_TURNS,
  };
  const goal = RULE_ACTIONS.get(intent.action).name;
  emit({
    type: 'stuck',
    actor: actor.id,
    rule: { ...intent.rule },
    action: intent.action,
    turns: STUCK_TURNS,
    detail: `No progress in ${STUCK_TURNS} turns (${intent.detail}). Giving up on ${goal} for ${DROP_TURNS} turns.`,
    floor: actor.floor,
    pos: { x: actor.pos.x, y: actor.pos.y },
  });
}

/**
 * AI memory holds sane values: `still` is a count, and `waitingFor` is `null` or another entity's
 * id that was handed out (the entity itself may have left the run since).
 */
registerInvariant('core.aiMemory', (state) => {
  const problems: string[] = [];
  for (const entity of Object.values(state.entities)) {
    const memory = entity.ai?.memory;
    if (memory === undefined) continue;
    if (!Number.isSafeInteger(memory.still) || memory.still < 0) problems.push(`actor ${entity.id} has still ${memory.still}`);
    const waitingFor = memory.waitingFor;
    if (waitingFor === null) continue;
    if (!Number.isSafeInteger(waitingFor) || waitingFor < 1 || waitingFor >= state.nextEntityId || waitingFor === entity.id) {
      problems.push(`actor ${entity.id} is waiting for ${waitingFor}, which is not another entity`);
    }
  }
  return problems;
});
