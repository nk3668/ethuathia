/**
 * Requirements (ETH-121, docs/ARCHITECTURE.md §4 and "Shared conditions"): a check written as
 * data. A requirement names rule conditions (`CONDITIONS`, `cond.*`) and combines them with
 * all / any / not, so unlocks, taboos, quirk triggers and building quests share the one
 * vocabulary the rules editor offers, instead of each growing its own.
 *
 * This module is the data half: the type, its schema, its content refs and the combinator
 * wording. The sim (`src/sim/ai/requirements.ts`) checks one against a run (`checkRequirement`)
 * and words it from each condition's `describe` (`describeRequirement`). Content can't see the
 * sim's condition registry, so `checkGame` checks the condition ids, params and scopes that
 * `requirementRefs` lists.
 */
import { z } from 'zod';
import type { ContentRef } from './kind';
import { idSchema } from './schema';

/** One condition, or all / any / none of some requirements. Plain data. */
export type Requirement =
  /** The condition `cond` (a `CONDITIONS` id) holds with `params`. */
  | { readonly cond: string; readonly params?: unknown }
  /** Every one of them holds. */
  | { readonly all: readonly Requirement[] }
  /** At least one of them holds. */
  | { readonly any: readonly Requirement[] }
  /** It doesn't hold. */
  | { readonly not: Requirement };

/**
 * What a requirement is checked with. `actor`: by or for one adventurer (a quirk trigger), so any
 * condition may appear. `run`: for the run alone (an unlock, a taboo), so only `run`-scope
 * conditions may appear; any other is a validation error.
 */
export type RequirementScope = 'actor' | 'run';

/** The kind content refs to conditions name: the sim's `CONDITIONS` registry kind. */
export const CONDITION_REF_KIND = 'rule condition';

export const requirementSchema: z.ZodType<Requirement> = z.lazy(() =>
  z.union([
    z.strictObject({ cond: idSchema('cond'), params: z.unknown().optional() }),
    z.strictObject({ all: z.array(requirementSchema).min(1, 'must list at least one requirement') }),
    z.strictObject({ any: z.array(requirementSchema).min(1, 'must list at least one requirement') }),
    z.strictObject({ not: requirementSchema }),
  ]),
);

/** Each condition a requirement names, with its path inside the requirement (`all[1].cond`). */
export function requirementLeaves(path: string, req: Requirement): { path: string; cond: string; params: unknown }[] {
  if ('cond' in req) return [{ path: `${path}.cond`, cond: req.cond, params: req.params }];
  if ('all' in req) return req.all.flatMap((r, i) => requirementLeaves(`${path}.all[${i}]`, r));
  if ('any' in req) return req.any.flatMap((r, i) => requirementLeaves(`${path}.any[${i}]`, r));
  return requirementLeaves(`${path}.not`, req.not);
}

/**
 * The condition refs a requirement makes, for `ContentKind.refs`: each must be a registered
 * condition whose params are good and, in a `run` requirement, whose scope is `run`
 * (`ContentRef.use`, which the sim's condition target checks). `path` is where the requirement
 * sits in the def, e.g. `unlock.requirement`.
 */
export function requirementRefs(path: string, req: Requirement, scope: RequirementScope = 'actor'): ContentRef[] {
  return requirementLeaves(path, req).map((leaf) => ({
    path: leaf.path,
    kind: CONDITION_REF_KIND,
    id: leaf.cond,
    use: { params: leaf.params, scope },
  }));
}

/**
 * A stable text key for a requirement: the same requirement always gives the same key, whatever
 * order its objects' keys were written in. The run tracker and milestones match on it.
 */
export function requirementKey(req: Requirement): string {
  return stableJson(req);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Words one condition with its params, e.g. "HP below 30%". */
export type ConditionWords = (cond: string, params: unknown) => string;

/** Words a whole requirement, e.g. "HP below 30% and not poisoned". */
export type RequirementWords = (req: Requirement) => string;

/**
 * Words `req`, each condition by `words`: "a, b and c", "a or b", "not a". A compound inside
 * another is bracketed: "(a or b) and c". The sim's `describeRequirement` passes each
 * condition's `describe`.
 */
export function wordRequirement(req: Requirement, words: ConditionWords): string {
  const inner = (r: Requirement) => ('all' in r || 'any' in r ? `(${wordRequirement(r, words)})` : wordRequirement(r, words));
  if ('cond' in req) return words(req.cond, req.params);
  if ('not' in req) return `not ${inner(req.not)}`;
  const parts = 'all' in req ? req.all.map(inner) : req.any.map(inner);
  const joiner = 'all' in req ? 'and' : 'or';
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} ${joiner} ${parts[parts.length - 1]}`;
}

/** Words a requirement by condition ids alone: the fallback where the sim's wording isn't at hand. */
export const wordRequirementByIds: RequirementWords = (req) => wordRequirement(req, (cond) => cond);
