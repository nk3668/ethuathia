/**
 * Adventurer classes: what an adventurer was trained to do. A class sets the starting attributes
 * (ETH-033), which the race then adjusts; the stats domain derives max HP, MP, accuracy, damage
 * and the rest from them (`src/sim/stats/attributes.ts`). Its `growth` says how fast each
 * attribute rises as the adventurer levels up (ETH-034). Skills and gear kits join them as those
 * systems arrive.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { ATTRIBUTE_IDS, attributesSchema } from './attributes';
import type { AttributeId, Attributes } from './attributes';
import type { ContentKind } from './kind';
import { defShape } from './schema';

/**
 * Attribute points gained per level (ETH-034), any of them fractional: by level L the class has
 * added `floor(rate × (L − 1))` to each, so a rate of 0.5 adds a point every second level. An
 * attribute left out never grows.
 */
export type AttributeGrowth = Readonly<Partial<Record<AttributeId, number>>>;

/** The most points one attribute may gain per level: a sanity bound for content. */
export const MAX_GROWTH_RATE = 5;

export interface ClassDef extends Def {
  /** Starting attributes, before the race's adjustments. */
  readonly attributes: Attributes;
  /** Attribute points gained per level (`AttributeGrowth`). */
  readonly growth: AttributeGrowth;
}

export const CLASSES = new Registry<ClassDef>('class');

const growthSchema = z
  .partialRecord(
    z.enum(ATTRIBUTE_IDS),
    z.number().min(0, 'must be at least 0').max(MAX_GROWTH_RATE, `must be at most ${MAX_GROWTH_RATE}`),
  )
  .refine((g) => Object.values(g).some((v) => v !== undefined && v > 0), 'must raise at least one attribute');

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
  tags: ['martial'],
  attributes: { brawn: 11, finesse: 9, wits: 4, grit: 13 },
  // Each level: Brawn +1, Grit +1.5, a Finesse point every second level, a Wits point every fourth.
  growth: { brawn: 1, finesse: 0.5, wits: 0.25, grit: 1.5 },
});
