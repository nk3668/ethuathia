/**
 * Objectives (ETH-114, docs/ARCHITECTURE.md "Objective engine"): "a goal with progress toward a
 * target", written as data. A contract's objective (ETH-024) was the first; bounties, conducts,
 * taboos, building quests and achievements are later owners of the same thing.
 *
 * This module is the data half: the `Objective` union, its schema and its content refs. The sim's
 * objective engine (`src/sim/quests/objectives.ts`, `OBJECTIVE_KINDS`) gives each kind its
 * meaning: how its progress is measured, its target and its wording. Kinds:
 *
 * - `recover { item, depth? }`: a living party member carries `item`, which lies on floor `depth`
 *   (default the bottom floor) (1 of 1). Measured from the state.
 * - `count { event, match?, count }`: an event of type `event` whose fields equal every entry of
 *   `match` happened `count` times since the objective was tracked. Measured from events.
 * - `reach { depth }`: the party has reached floor `depth`. Measured from the state.
 * - `condition { requirement }`: a run-scope `Requirement` (ETH-121) holds right now (0 or 1).
 *   Measured from the state.
 * - `avoid { event, match? }`: such an event never happens. Failed the first time it does;
 *   complete at run end if it never did (a conduct or a taboo). Measured from events.
 *
 * A new kind is one member of `Objective`, one option in `objectiveSchema` (plus its refs in
 * `objectiveRefs`) and one entry in the sim's `OBJECTIVE_KINDS`.
 */
import { z } from 'zod';
import type { ContentRef } from './kind';
import { requirementRefs, requirementSchema } from './requirements';
import type { Requirement } from './requirements';
import { idSchema, positiveInt } from './schema';

/**
 * Event fields an event must have to count: field name → the value it must equal. A string value
 * that looks like a content id (`monster.slate_hound`) must name a def of that kind.
 */
export type EventMatch = Readonly<Record<string, string | number | boolean>>;

/** Recover an item placed on one floor (the bottom floor unless `depth` says otherwise) and carry it (ETH-024, ETH-093). */
export interface RecoverObjective {
  readonly kind: 'recover';
  /** The item to recover (an `item.*` id of category `relic`). */
  readonly item: string;
  /**
   * The floor the item lies on (1 is the first floor). Leave it out for the bottom floor, however
   * deep the dungeon goes. A floor deeper than the dungeon falls back to its bottom floor, but
   * content must not rely on that (the contracts content check, ETH-093).
   */
  readonly depth?: number;
}

/** Make an event happen `count` times, counted from when the objective is tracked. */
export interface CountObjective {
  readonly kind: 'count';
  /** The sim event type, e.g. `killed` or `drankFountain`. */
  readonly event: string;
  /** Only events whose fields equal these count, e.g. `{ victimDef: 'monster.slate_hound', byParty: true }`. */
  readonly match?: EventMatch;
  readonly count: number;
}

/** Reach floor `depth` (1 is the first floor). */
export interface ReachObjective {
  readonly kind: 'reach';
  readonly depth: number;
}

/** A run-scope requirement (ETH-121) holds right now. */
export interface ConditionObjective {
  readonly kind: 'condition';
  readonly requirement: Requirement;
}

/** Never let an event happen: failed the first time it does, complete at run end if it never did. */
export interface AvoidObjective {
  readonly kind: 'avoid';
  readonly event: string;
  readonly match?: EventMatch;
}

/** A goal with progress toward a target. One member per objective kind. Plain data. */
export type Objective = RecoverObjective | CountObjective | ReachObjective | ConditionObjective | AvoidObjective;

/** An objective kind's name. */
export type ObjectiveKindName = Objective['kind'];

/** Every objective kind's name, for the Codex and tooltips. */
export const OBJECTIVE_KIND_NAMES = ['recover', 'count', 'reach', 'condition', 'avoid'] as const satisfies readonly ObjectiveKindName[];

/** Who an objective belongs to: the feature that tracks it, emits its events and reads its result. */
export const OBJECTIVE_OWNER_KINDS = ['contract', 'bounty', 'conduct', 'taboo', 'quest'] as const;
export type ObjectiveOwnerKind = (typeof OBJECTIVE_OWNER_KINDS)[number];

/** An objective's owner: its kind and the owner's id (`contract.recover_relic`). */
export interface ObjectiveOwner {
  readonly kind: ObjectiveOwnerKind;
  readonly id: string;
}

/** A stable text key for an owner, `contract:contract.recover_relic`: the default tracked-objective key. */
export function objectiveOwnerKey(owner: ObjectiveOwner): string {
  return `${owner.kind}:${owner.id}`;
}

/** The owner kinds whose ids name content of the same registry kind, for refs. */
const OWNER_REGISTRY: Partial<Record<ObjectiveOwnerKind, string>> = { contract: 'contract', bounty: 'bounty' };

/** A sim event type name: `killed`, `drankFountain`. */
const eventName = z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'must be a sim event type, e.g. "killed"');

const matchSchema = z
  .record(z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'must be an event field name'), z.union([z.string(), z.number(), z.boolean()]))
  .refine((m) => Object.keys(m).length > 0, 'must list at least one field, or be left out');

export const objectiveSchema: z.ZodType<Objective> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('recover'), item: idSchema('item'), depth: positiveInt.optional() }),
  z.strictObject({ kind: z.literal('count'), event: eventName, match: matchSchema.optional(), count: positiveInt }),
  z.strictObject({ kind: z.literal('reach'), depth: positiveInt }),
  z.strictObject({ kind: z.literal('condition'), requirement: requirementSchema }),
  z.strictObject({ kind: z.literal('avoid'), event: eventName, match: matchSchema.optional() }),
]);

export const objectiveOwnerSchema: z.ZodType<ObjectiveOwner> = z.strictObject({
  kind: z.enum(OBJECTIVE_OWNER_KINDS),
  id: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'must be an id like "contract.recover_relic"'),
});

/** `monster` from `monster.slate_hound`; `null` for a string that isn't shaped like a content id. */
function idKind(value: string): string | null {
  const m = /^([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*$/.exec(value);
  return m === null ? null : (m[1] as string);
}

/**
 * The content refs an objective makes, for `ContentKind.refs` of a kind that embeds one (`path`
 * is where it sits, e.g. `objective`): a `recover` item, the id-shaped values of a `match` (each
 * must exist in the registry its prefix names) and a `condition`'s requirement (run scope).
 */
export function objectiveRefs(path: string, objective: Objective): ContentRef[] {
  switch (objective.kind) {
    case 'recover':
      return [{ path: `${path}.item`, kind: 'item', id: objective.item }];
    case 'reach':
      return [];
    case 'condition':
      return requirementRefs(`${path}.requirement`, objective.requirement, 'run');
    case 'count':
    case 'avoid': {
      const refs: ContentRef[] = [];
      for (const [field, value] of Object.entries(objective.match ?? {})) {
        if (typeof value !== 'string') continue;
        const kind = idKind(value);
        if (kind !== null) refs.push({ path: `${path}.match.${field}`, kind, id: value });
      }
      return refs;
    }
  }
}

/** The content refs an owner makes: a contract or bounty owner must name a def of that kind. */
export function objectiveOwnerRefs(path: string, owner: ObjectiveOwner): ContentRef[] {
  const kind = OWNER_REGISTRY[owner.kind];
  return kind === undefined ? [] : [{ path: `${path}.id`, kind, id: owner.id }];
}
