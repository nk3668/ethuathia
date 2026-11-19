/**
 * Requirements in the sim (ETH-121, docs/ARCHITECTURE.md §4 and "Shared conditions"): checking a
 * data `Requirement` (`src/content/requirements.ts`) against a run, wording it, and validating it
 * for the scope it is checked in.
 *
 * A requirement's conditions are the rule conditions in `CONDITIONS`. Checked with a `RunCtx`
 * (the run alone) it may name only `run`-scope conditions; checked with an `AiCtx` (one actor)
 * it may name any. Validation (`requirementProblems`, and the content refs through
 * `CONDITION_TARGET`) catches an `actor` condition in a `run` requirement before it runs.
 */
import { CONDITION_REF_KIND, requirementLeaves, wordRequirement } from '../../content';
import type { ContentRef, RefTarget, Requirement, RequirementScope } from '../../content';
import { CONDITIONS } from '../registries';
import type { ConditionResult, ConditionScope, RunCtx } from './types';

/**
 * Whether `req` holds right now, with a readable reason. `cond` is the condition's own result;
 * `all` holds when every part does (its detail joins theirs, or is the first failing part's);
 * `any` holds when one does (its detail is the first holding part's); `not` flips its part, with
 * no detail. An unknown condition doesn't hold. Changes nothing.
 */
export function checkRequirement(ctx: RunCtx, req: Requirement): ConditionResult {
  if ('cond' in req) {
    if (!CONDITIONS.has(req.cond)) return { ok: false, detail: `unknown condition "${req.cond}"` };
    return CONDITIONS.get(req.cond).evaluate(ctx, req.params);
  }
  if ('not' in req) return { ok: !checkRequirement(ctx, req.not).ok, detail: '' };
  if ('any' in req) {
    for (const part of req.any) {
      const result = checkRequirement(ctx, part);
      if (result.ok) return result;
    }
    return { ok: false, detail: '' };
  }
  const details: string[] = [];
  for (const part of req.all) {
    const result = checkRequirement(ctx, part);
    if (!result.ok) return result;
    if (result.detail !== '') details.push(result.detail);
  }
  return { ok: true, detail: details.join('; ') };
}

/** Words one condition with its params by its own `describe`; an unknown id is named as such. */
export function describeCondition(cond: string, params: unknown): string {
  return CONDITIONS.has(cond) ? CONDITIONS.get(cond).describe(params) : `unknown condition "${cond}"`;
}

/** Words `req` from each condition's `describe`: "HP below 30% and not on the bottom floor". */
export function describeRequirement(req: Requirement): string {
  return wordRequirement(req, describeCondition);
}

/**
 * What `req` needs to be checked: `run` if every condition it names is `run`-scope (so a
 * `RunCtx` will do), else `actor`. Unknown conditions count as `run`; `requirementProblems`
 * reports them.
 */
export function requirementScope(req: Requirement): ConditionScope {
  const actor = requirementLeaves('', req).some((leaf) => CONDITIONS.has(leaf.cond) && CONDITIONS.get(leaf.cond).scope === 'actor');
  return actor ? 'actor' : 'run';
}

/** Why one condition use is wrong in a requirement of `scope`, or `null`. */
function conditionProblem(cond: string, params: unknown, scope: RequirementScope | undefined): string | null {
  if (!CONDITIONS.has(cond)) return `unknown condition "${cond}"`;
  const def = CONDITIONS.get(cond);
  const bad = def.check(params);
  if (bad !== null) return `condition "${cond}" has bad params: ${bad}`;
  if (scope === 'run' && def.scope === 'actor') {
    return `condition "${cond}" needs an adventurer to check, but this requirement is checked for the whole run`;
  }
  return null;
}

/**
 * Every problem with `req` checked in `scope`, one line each, naming where in it (`all[1].cond`):
 * unknown conditions, bad params and, for `run`, conditions that need an actor. Empty if sound.
 */
export function requirementProblems(req: Requirement, scope: RequirementScope): string[] {
  const problems: string[] = [];
  for (const leaf of requirementLeaves('requirement', req)) {
    const why = conditionProblem(leaf.cond, leaf.params, scope);
    if (why !== null) problems.push(`${leaf.path}: ${why}`);
  }
  return problems;
}

/**
 * `CONDITIONS` as a content ref target: `checkGame` passes it so content requirements
 * (`requirementRefs`) have their condition ids, params and scope checked.
 */
export const CONDITION_TARGET: RefTarget = {
  kind: CONDITION_REF_KIND,
  has: (id) => CONDITIONS.has(id),
  checkRef(ref: ContentRef) {
    if (ref.use === undefined) return null;
    const scope = ref.use.scope === 'run' || ref.use.scope === 'actor' ? ref.use.scope : undefined;
    return conditionProblem(ref.id, ref.use.params, scope);
  },
};
