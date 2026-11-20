/**
 * Adventurer classes: what an adventurer was trained to do. A class sets the starting attributes
 * (ETH-033), which the race then adjusts; the stats domain derives max HP, MP, accuracy, damage
 * and the rest from them (`src/sim/stats/attributes.ts`). Its `growth` says how each attribute
 * may rise when the adventurer levels up (ETH-034, rolled since ETH-110). Skills and gear kits
 * join them as those systems arrive.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { ATTRIBUTE_IDS, attributesSchema } from './attributes';
import type { AttributeId, Attributes } from './attributes';
import type { ContentKind } from './kind';
import { defShape } from './schema';

/**
 * How one attribute grows on a level-up (ETH-110): with probability `chance` (default 1) it gains
 * a whole number of points from `min` to `max` inclusive, else nothing. The roll is seeded, so a
 * caster's Brawn can be `{ min: 1, max: 1, chance: 0.25 }` and a warrior's Grit `{ min: 1, max: 2 }`.
 */
export interface GrowthRoll {
  readonly min: number;
  readonly max: number;
  readonly chance?: number;
}

/** Each attribute's level-up roll. An attribute left out never grows. */
export type AttributeGrowth = Readonly<Partial<Record<AttributeId, GrowthRoll>>>;

/** The most points one attribute may gain in one level: a sanity bound for content. */
export const MAX_GROWTH_RATE = 5;

/** The points one roll gains on average: `chance × (min + max) / 2`. */
export function expectedGrowth(roll: GrowthRoll): number {
  return (roll.chance ?? 1) * ((roll.min + roll.max) / 2);
}

export interface ClassDef extends Def {
  /** Starting attributes, before the race's adjustments. */
  readonly attributes: Attributes;
  /** How each attribute may rise per level (`AttributeGrowth`). */
  readonly growth: AttributeGrowth;
}

export const CLASSES = new Registry<ClassDef>('class');

const points = z.number().int('must be a whole number').min(0, 'must be at least 0').max(MAX_GROWTH_RATE, `must be at most ${MAX_GROWTH_RATE}`);

const growthRollSchema = z
  .strictObject({
    min: points,
    max: points,
    chance: z.number().gt(0, 'must be above 0').max(1, 'must be at most 1').optional(),
  })
  .refine((r) => r.max >= r.min, 'max must be at least min');

const growthSchema = z
  .partialRecord(z.enum(ATTRIBUTE_IDS), growthRollSchema)
  .refine((g) => Object.values(g).some((r) => r !== undefined && expectedGrowth(r) > 0), 'must raise at least one attribute');

export const CLASS_KIND: ContentKind<ClassDef> = {
  registry: CLASSES,
  schema: z.strictObject({ ...defShape('class'), attributes: attributesSchema, growth: growthSchema }),
};

/** Registers a class def and returns it. Its shape is checked by `validateContent`. */
export function defineClass(def: ClassDef): ClassDef {
  return CLASSES.register(def);
}

export const CLASS_VANGUARD = defineClass({
  id: 'class.vanguard',
  name: 'Vanguard',
  description:
    'A shield-bearer who walks at the head of the party and takes the first blow. Hardy, steady and ' +
    'nearly deaf to magic.',
  hint: 'The first shield into the dark, built to take what the hall throws first.',
  tags: ['martial'],
  attributes: { brawn: 11, finesse: 9, wits: 4, grit: 13 },
  // Each level, on average: Brawn +1, Grit +1.5, Finesse +0.5, Wits +0.25 (a point one level in four).
  growth: {
    brawn: { min: 0, max: 2 },
    finesse: { min: 0, max: 1 },
    wits: { min: 1, max: 1, chance: 0.25 },
    grit: { min: 1, max: 2 },
  },
});
