/**
 * Dungeon variants (CLAUDE.md §2, "Starting a run", step 6): which dungeon a run descends into,
 * picked on the Prepare screen once more than one is available. A variant sets the dungeon's
 * depth range, Danger curve, optional monster ecology, optional encounter curves, and floor type
 * (`floorType`).
 *
 * A variant that an upgrade unlocks (`{ kind: 'unlock', id: 'dungeon.x' }`, e.g. from the
 * Cartographer) is offered only once that upgrade is owned; the others are open from the start.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape, idSchema, positiveInt, tagSchema } from './schema';

/** Inclusive floor count bounds for a dungeon variant. */
export interface DungeonDepthRange {
  readonly min: number;
  readonly max: number;
}

/** Linear Danger curve: floor `d` has Danger `start + (d - 1) * perFloor`. */
export interface DungeonDangerCurve {
  readonly start: number;
  readonly perFloor: number;
}

/** Optional tag filter and spawn-weight overrides for a dungeon variant. */
export interface DungeonEcology {
  /** Only monsters carrying at least one of these tags may spawn when provided. */
  readonly allowTags?: readonly string[];
  /** Monsters carrying any of these tags are excluded. */
  readonly denyTags?: readonly string[];
  /** Weight multipliers per matching tag (default 1). */
  readonly tagWeights?: Readonly<Record<string, number>>;
}

/** Depth-ramped template probability curve over Danger. */
export interface TemplateRamp {
  readonly minDanger: number;
  readonly base: number;
  readonly perDanger: number;
  readonly max: number;
}

/** Out-of-depth (OOD) spawn curve over Danger. */
export interface OodCurve {
  readonly minDanger: number;
  readonly chance: number;
  readonly boost: number;
}

/** Return-trip surge parameters for post-contract ascents. */
export interface SurgeProfile {
  readonly dangerWindow: number;
  readonly templateBonus: number;
  readonly countMul: number;
}

/** Data curves governing encounter budgets, templates, OOD spawns, patrols, and surge. */
export interface DungeonEncounterProfile {
  readonly budgetMul?: number;
  readonly templateRamp?: TemplateRamp;
  readonly ood?: OodCurve;
  readonly patrolMul?: number;
  readonly surge?: SurgeProfile;
}

export interface DungeonDef extends Def {
  /** How many floors deep it goes (`{ min, max }`), rolled deterministically from the run seed. */
  readonly depth: DungeonDepthRange;
  /** Danger progression by floor (`start + (depth - 1) * perFloor`). */
  readonly danger: DungeonDangerCurve;
  /** The floor type its floors are built from (`floor.halls`). */
  readonly floorType: string;
  /** Optional monster ecology filter and tag weight multipliers. */
  readonly ecology?: DungeonEcology;
  /** Optional encounter density, template, OOD, patrol, and surge curves. */
  readonly encounters?: DungeonEncounterProfile;
}

export const DUNGEONS = new Registry<DungeonDef>('dungeon');

const depthBound = positiveInt.max(99, 'must be at most 99');
const positiveFinite = z.number().refine(Number.isFinite, 'must be a finite number').positive('must be above 0');
const nonNegativeFinite = z.number().refine(Number.isFinite, 'must be a finite number').nonnegative('must not be negative');
const unitChance = nonNegativeFinite.max(1, 'must be at most 1');

const ecologySchema: z.ZodType<DungeonEcology> = z.strictObject({
  allowTags: z.array(tagSchema).min(1, 'leave it out to allow all tags').optional(),
  denyTags: z.array(tagSchema).optional(),
  tagWeights: z.record(tagSchema, nonNegativeFinite).optional(),
});

const encountersSchema: z.ZodType<DungeonEncounterProfile> = z.strictObject({
  budgetMul: positiveFinite.optional(),
  templateRamp: z
    .strictObject({
      minDanger: positiveFinite,
      base: unitChance,
      perDanger: nonNegativeFinite,
      max: unitChance,
    })
    .refine((r) => r.base <= r.max, { message: 'templateRamp.base must not be above templateRamp.max', path: ['base'] })
    .optional(),
  ood: z
    .strictObject({
      minDanger: positiveFinite,
      chance: unitChance,
      boost: positiveFinite,
    })
    .optional(),
  patrolMul: nonNegativeFinite.optional(),
  surge: z
    .strictObject({
      dangerWindow: nonNegativeFinite,
      templateBonus: unitChance,
      countMul: nonNegativeFinite,
    })
    .optional(),
});

export const DUNGEON_KIND: ContentKind<DungeonDef> = {
  registry: DUNGEONS,
  schema: z
    .strictObject({
      ...defShape('dungeon'),
      depth: z.strictObject({ min: depthBound, max: depthBound }),
      danger: z.strictObject({ start: positiveFinite, perFloor: nonNegativeFinite }),
      floorType: idSchema('floor'),
      ecology: ecologySchema.optional(),
      encounters: encountersSchema.optional(),
    })
    .refine((def) => def.depth.min <= def.depth.max, { message: 'depth.min must not be above depth.max', path: ['depth'] }),
  refs: (def) => [{ path: 'floorType', kind: 'floor type', id: def.floorType }],
};

/** Registers a dungeon variant and returns it. Its shape is checked by `validateContent`. */
export function defineDungeon(def: DungeonDef): DungeonDef {
  return DUNGEONS.register(def);
}

/** The first dungeon, open from the start. */
export const DUNGEON_OLD_DELVE = defineDungeon({
  id: 'dungeon.old_delve',
  name: 'The Old Delve',
  description:
    'A worked-out mine below the town, winding levels of cut halls that something has moved back into. ' +
    'Every new company starts here.',
  hint: 'Unmapped levels of abandoned workings directly beneath the town.',
  tags: ['dungeon'],
  depth: { min: 6, max: 10 },
  danger: { start: 1, perFloor: 1 },
  floorType: 'floor.halls',
  encounters: {
    budgetMul: 1,
    templateRamp: { minDanger: 3, base: 0.03, perDanger: 0.03, max: 0.3 },
    ood: { minDanger: 3, chance: 0.05, boost: 2 },
    patrolMul: 1,
    surge: { dangerWindow: 2, templateBonus: 0.1, countMul: 1.1 },
  },
});
