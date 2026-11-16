/**
 * The shapes of the decision engine (docs/ARCHITECTURE.md §4): rules, the AI part an actor
 * carries, and the definitions of rule conditions and rule actions.
 *
 * Rules and AI memory live in the run state, so they are plain data and name conditions and
 * actions by id only. The definitions are code, kept in the `CONDITIONS` and `RULE_ACTIONS`
 * registries.
 */
import type { Def, Pos } from '../../core';
import type { ActionRequest } from '../actions';
import type { ActorEntity, FloorId, RunState } from '../state';

// ---------------------------------------------------------------------------------------------
// Rules (plain data)

/** A condition or rule action as a rule names it: a registry id and its parameters. */
export interface RulePart {
  /** Id in `CONDITIONS` or `RULE_ACTIONS`, e.g. `cond.always` or `act.explore`. */
  id: string;
  /** Leave out when the definition takes none. */
  params?: unknown;
}

/** If `condition` holds and `action` can be done right now, do it. */
export interface Rule {
  condition: RulePart;
  action: RulePart;
  /** A disabled rule is skipped, as if it were not in the list. */
  enabled: boolean;
}

/**
 * Which rule an event or memory entry is about: `own` rules are the actor's (the player's, for
 * an adventurer), indexed into `AiPart.rules`; `baseline` rules are the built-in ones checked
 * after them, indexed into `BASELINE_RULES`.
 */
export interface RuleRef {
  set: 'own' | 'baseline';
  index: number;
}

/** The rule that fired at an actor's last decision: its current goal, shown as its intent. */
export interface Intent {
  rule: RuleRef;
  /** The rule action's id. */
  action: string;
  /** The readable reason, as in the `ruleFired` event. */
  detail: string;
}

/** Where an actor stood, and how much of its floor the party had seen, at a decision. */
export interface ProgressMark {
  floor: FloorId;
  pos: Pos;
  /** Floor tiles of `floor` the party had seen (`explored(...).seen`). */
  seen: number;
}

/** A goal given up on after stuck detection. Its rule is skipped until `until`. */
export interface DroppedGoal {
  rule: RuleRef;
  /** The dropped rule's action id. */
  action: string;
  /** Where the actor was stuck, which backing off moves away from. */
  floor: FloorId;
  pos: Pos;
  /** The turn it was dropped on. */
  since: number;
  /** The first turn (`RunState.turn`) on which the rule is checked again. */
  until: number;
}

/** What the decision engine remembers about one actor between decisions. */
export interface AiMemory {
  /** The rule that fired last, or `null` before the first decision. */
  intent: Intent | null;
  /** The actor's progress at its last decision, or `null` before the first. */
  last: ProgressMark | null;
  /** Decisions in a row at which `last` had not changed while working toward a goal. */
  still: number;
  /** The goal stuck detection last dropped, while it is still being skipped. */
  dropped: DroppedGoal | null;
}

/**
 * The part an AI-driven actor carries. `rules` are checked top to bottom before the baseline
 * rules. Adventurers start with none until the rules editor (M3) gives the player some.
 */
export interface AiPart {
  rules: Rule[];
  memory: AiMemory;
}

/** A fresh AI part with no rules and an empty memory. */
export function newAiPart(rules: Rule[] = []): AiPart {
  return { rules, memory: { intent: null, last: null, still: 0, dropped: null } };
}

// ---------------------------------------------------------------------------------------------
// Definitions (code)

/** An actor the engine is deciding for. */
export type AiActor = ActorEntity & { ai: AiPart };

/** What conditions and rule actions get to look at. They must not change the run state. */
export interface AiCtx {
  readonly state: RunState;
  readonly actor: AiActor;
}

/** Whether a condition holds, and a readable reason (empty when there is nothing to say). */
export interface ConditionResult {
  ok: boolean;
  detail: string;
}

/** What a rule action resolves to: the action to take and a readable reason. */
export interface Resolved {
  request: ActionRequest;
  detail: string;
}

/**
 * A rule condition, as registered in `CONDITIONS`. `name` and `description` are its Codex and
 * tooltip text. Build one with `defineCondition`, which checks the params before `evaluate` runs.
 */
export interface ConditionDef extends Def {
  /** Why `params` are malformed, or `null` if they are fine. */
  check(params: unknown): string | null;
  /** Whether the condition holds for the actor right now. Changes nothing. */
  evaluate(ctx: AiCtx, params: unknown): ConditionResult;
  /** The rule row's text for these params, e.g. "HP below 30%". */
  describe(params: unknown): string;
}

/**
 * A rule action, as registered in `RULE_ACTIONS`. Build one with `defineRuleAction`.
 */
export interface RuleActionDef extends Def {
  /**
   * True for actions that stand still on purpose, such as waiting when there is nothing to do.
   * Stuck detection ignores them: standing still is the point.
   */
  readonly idle: boolean;
  /** Why `params` are malformed, or `null` if they are fine. */
  check(params: unknown): string | null;
  /** The action to take now, or `null` if this can't be done right now. Changes nothing. */
  resolve(ctx: AiCtx, params: unknown): Resolved | null;
  /** The rule row's text for these params, e.g. "explore the nearest unknown ground". */
  describe(params: unknown): string;
}

/** Reads params from untyped data, or returns why they are malformed. */
export type ParamParser<P> = (raw: unknown) => P | string;

/** The parser for definitions that take no params: `undefined` or an empty object. */
export const noParams: ParamParser<null> = (raw) => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) return null;
  return 'Takes no parameters';
};

interface DefText {
  id: string;
  name: string;
  description: string;
  tags?: string[];
}

/** Builds a `ConditionDef` whose `evaluate` and `describe` only ever see parsed params. */
export function defineCondition<P>(
  def: DefText & {
    parse: ParamParser<P>;
    evaluate(ctx: AiCtx, params: P): ConditionResult;
    describe(params: P): string;
  },
): ConditionDef {
  const { id, name, description, tags = ['condition'], parse, evaluate, describe } = def;
  return {
    id,
    name,
    description,
    tags,
    check: (raw) => checkParams(parse, raw),
    evaluate(ctx, raw) {
      const params = parse(raw);
      return typeof params === 'string' ? { ok: false, detail: params } : evaluate(ctx, params);
    },
    describe(raw) {
      const params = parse(raw);
      return typeof params === 'string' ? `${name} (${params})` : describe(params);
    },
  };
}

/** Builds a `RuleActionDef` whose `resolve` and `describe` only ever see parsed params. */
export function defineRuleAction<P>(
  def: DefText & {
    idle?: boolean;
    parse: ParamParser<P>;
    resolve(ctx: AiCtx, params: P): Resolved | null;
    describe(params: P): string;
  },
): RuleActionDef {
  const { id, name, description, tags = ['rule-action'], idle = false, parse, resolve, describe } = def;
  return {
    id,
    name,
    description,
    tags,
    idle,
    check: (raw) => checkParams(parse, raw),
    resolve(ctx, raw) {
      const params = parse(raw);
      return typeof params === 'string' ? null : resolve(ctx, params);
    },
    describe(raw) {
      const params = parse(raw);
      return typeof params === 'string' ? `${name} (${params})` : describe(params);
    },
  };
}

function checkParams<P>(parse: ParamParser<P>, raw: unknown): string | null {
  const params = parse(raw);
  return typeof params === 'string' ? params : null;
}
