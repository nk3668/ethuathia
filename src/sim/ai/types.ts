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
import type { ActorEntity, EntityId, FloorId, RunState } from '../state';

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
 * after them, indexed into `BASELINE_RULES`. `player` (index 0) is no rule at all: the player
 * chose the action, by possessing the adventurer or with a `playerAction` command (ETH-066).
 */
export interface RuleRef {
  set: 'own' | 'baseline' | 'player';
  index: number;
}

/** The rule that fired at an actor's last decision: its current goal, shown as its intent. */
export interface Intent {
  rule: RuleRef;
  /** The rule action's id. */
  action: string;
  /** The readable reason, as in the `ruleFired` event. */
  detail: string;
  /** The tile the actor is heading for or targeting on its floor, if any (ETH-019). */
  goal?: Pos;
}

/** Where an actor stood, and how much of its floor the party had seen, at a decision. */
export interface ProgressMark {
  floor: FloorId;
  pos: Pos;
  /** Floor tiles of `floor` the party had seen (`explored(...).seen`). */
  seen: number;
  /**
   * Where every living party member stood (floor and tile), as a key: waiting counts toward
   * being stuck only while nobody in the party moves (ETH-113).
   */
  party: string;
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
  /** Set when `act.back_off` itself gets stuck during this drop, stopping further backing off without overwriting `rule` (ETH-145). */
  backedOff?: true;
}

/** What the decision engine remembers about one actor between decisions. */
export interface AiMemory {
  /** The rule that fired last, or `null` before the first decision. */
  intent: Intent | null;
  /** The actor's progress at its last decision, or `null` before the first. */
  last: ProgressMark | null;
  /** Decisions in a row at which `last` had not changed while working toward a goal. */
  still: number;
  /**
   * Decisions in a row spent waiting by an idle rule other than the plain `act.wait` (gathering
   * at the stairs, say) while nobody in the party moved (ETH-113).
   */
  waited: number;
  /** The goal stuck detection last dropped, while it is still being skipped. */
  dropped: DroppedGoal | null;
  /**
   * The actor its last decision waited on to get out of the way, or `null`. A party member it
   * waits on takes this as an offer to swap places (`act.explore` and other map-following
   * actions; see `followMap`).
   */
  waitingFor: EntityId | null;
}

/**
 * The part an AI-driven actor carries. `rules` are checked top to bottom before the baseline
 * rules. Adventurers start with none until the rules editor (M3) gives the player some.
 */
export interface AiPart {
  rules: Rule[];
  memory: AiMemory;
  /**
   * Set while the player possesses this adventurer (ETH-066): its turns wait for the player's
   * `playerAction` instead of running the rules. Absent when the AI is in control.
   */
  possessed?: true;
}

/** A fresh AI part with no rules and an empty memory. */
export function newAiPart(rules: Rule[] = []): AiPart {
  return { rules, memory: { intent: null, last: null, still: 0, waited: 0, dropped: null, waitingFor: null } };
}

// ---------------------------------------------------------------------------------------------
// Definitions (code)

/** An actor the engine is deciding for. */
export type AiActor = ActorEntity & { ai: AiPart };

/**
 * What a `run`-scope condition gets to look at (ETH-121): the run alone, with no deciding actor.
 * The run, a tracker or the meta layer can check one, as well as a rule. Must not change the state.
 */
export interface RunCtx {
  readonly state: RunState;
}

/** What conditions and rule actions get to look at. They must not change the run state. */
export interface AiCtx extends RunCtx {
  readonly actor: AiActor;
}

/** Whether `ctx` has a deciding actor, so `actor`-scope conditions can be checked with it. */
export function hasActor(ctx: RunCtx): ctx is AiCtx {
  return 'actor' in ctx && (ctx as Partial<AiCtx>).actor !== undefined;
}

/**
 * What a condition needs to be checked (ETH-121). An `actor` condition reads the deciding actor
 * (its HP, its floor), so only a rule or an actor-scope requirement can check it. A `run`
 * condition reads the run alone (`RunCtx`), so it can also be checked by the run, a tracker or
 * the meta layer, and gives the same answer whoever asks.
 */
export type ConditionScope = 'actor' | 'run';

/** Whether a condition holds, and a readable reason (empty when there is nothing to say). */
export interface ConditionResult {
  ok: boolean;
  detail: string;
}

/** What a rule action resolves to: the action to take and a readable reason. */
export interface Resolved {
  request: ActionRequest;
  detail: string;
  /** Set when the action is waiting for this actor to get out of the way (`AiMemory.waitingFor`). */
  waitingFor?: EntityId;
  /** The tile the action is heading for or targeting, if any (`Intent.goal`, ETH-019). */
  goal?: Pos;
  /** Optional note explaining a closer/alternative option skipped while taking this action (ETH-094). */
  skipped?: string;
}

/**
 * Why a rule action chose not to act when its condition held (ETH-094): the engine moves on to the
 * next rule and appends `skipped` to the trace of whichever rule fires, so the player sees why the
 * earlier rule was passed over.
 */
export interface RuleSkipped {
  skipped: string;
}

/** What `RuleActionDef.resolve` returns: an action to take, a skip reason for the trace, or `null`. */
export type ResolveResult = Resolved | RuleSkipped | null;

/**
 * A rule condition, as registered in `CONDITIONS`. `name` and `description` are its Codex and
 * tooltip text. Build one with `defineCondition`, which checks the params before `evaluate` runs.
 */
export interface ConditionDef extends Def {
  /** What it needs to be checked: a deciding actor (`actor`, the default) or the run alone (`run`). */
  readonly scope: ConditionScope;
  /** Why `params` are malformed, or `null` if they are fine. */
  check(params: unknown): string | null;
  /**
   * Whether the condition holds right now: for the actor, or for the run when `scope` is `run`.
   * An `actor` condition given a `RunCtx` with no actor doesn't hold (a requirement validated
   * for its scope never does that). Changes nothing.
   */
  evaluate(ctx: RunCtx, params: unknown): ConditionResult;
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
  /** The action to take now, a skip reason for the trace, or `null` if this can't be done right now. Changes nothing. */
  resolve(ctx: AiCtx, params: unknown): ResolveResult;
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

interface ConditionText<P> extends DefText {
  parse: ParamParser<P>;
  describe(params: P): string;
}

/** What an `actor` condition says when checked without an actor. */
const NEEDS_ACTOR = 'needs an adventurer to check';

/**
 * Builds a `ConditionDef` whose `evaluate` and `describe` only ever see parsed params. The ctx
 * `evaluate` gets follows `scope`: a `run` condition sees only the run (`RunCtx`), so it can't
 * read an actor by mistake; an `actor` condition (the default) sees the deciding actor (`AiCtx`).
 */
export function defineCondition<P>(
  def: ConditionText<P> &
    (
      | { scope: 'run'; evaluate(ctx: RunCtx, params: P): ConditionResult }
      | { scope?: 'actor'; evaluate(ctx: AiCtx, params: P): ConditionResult }
    ),
): ConditionDef {
  const { id, name, description, tags = ['condition'], parse, describe } = def;
  const evaluate = (ctx: RunCtx, params: P): ConditionResult => {
    if (def.scope === 'run') return def.evaluate(ctx, params);
    return hasActor(ctx) ? def.evaluate(ctx, params) : { ok: false, detail: NEEDS_ACTOR };
  };
  return {
    id,
    name,
    description,
    tags,
    scope: def.scope ?? 'actor',
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
    resolve(ctx: AiCtx, params: P): ResolveResult;
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
