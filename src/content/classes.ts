/**
 * Adventurer classes: what an adventurer was trained to do. A class sets the starting attributes
 * (ETH-033), which the race then adjusts; the stats domain derives max HP, MP, accuracy, damage
 * and the rest from them (`src/sim/stats/attributes.ts`). Its `growth` says how each attribute
 * may rise when the adventurer levels up (ETH-034, rolled since ETH-110). Its optional `kit` is the
 * gear each adventurer of the class carries, equipped, from the first turn (ETH-176). Skills join
 * them as those systems arrive.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { ATTRIBUTE_IDS, attributesSchema } from './attributes';
import type { AttributeId, Attributes } from './attributes';
import { gearSlots, ITEMS } from './items';
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
  /**
   * Item def ids every adventurer of the class starts each run wearing (ETH-176): identified, plain,
   * and marked as kit so they are never sold for Trophies. Each must be gear, and no two may fit
   * only the same slot. Left out, the class starts empty-handed.
   */
  readonly kit?: readonly string[];
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

/**
 * Why `kit` can't be worn at once, as problem lines: an item that is not gear, or two items that
 * can't both be worn (more kit pieces than slots they share). Ids that don't exist are skipped:
 * the ref check reports them.
 */
export function kitProblems(kit: readonly string[]): string[] {
  const problems: string[] = [];
  const used = new Set<string>();
  for (const id of kit) {
    if (!ITEMS.has(id)) continue;
    const def = ITEMS.get(id);
    const slots = gearSlots(def);
    if (slots.length === 0) {
      problems.push(`kit item "${id}" is not gear`);
      continue;
    }
    const free = slots.find((s) => !used.has(s));
    if (free === undefined) problems.push(`kit item "${id}" shares a slot (${slots.join(', ')}) with another kit item`);
    else used.add(free);
  }
  return problems;
}

export const CLASS_KIND: ContentKind<ClassDef> = {
  registry: CLASSES,
  schema: z.strictObject({
    ...defShape('class'),
    attributes: attributesSchema,
    growth: growthSchema,
    kit: z.array(z.string().min(1)).min(1, 'a kit lists at least one item (leave it out for none)').optional(),
  }),
  refs: (def) => (def.kit ?? []).map((id, i) => ({ path: `kit[${i}]`, kind: 'item', id })),
  check: (defs) => defs.flatMap((d) => kitProblems(d.kit ?? []).map((p) => `class "${d.id}": ${p}`)),
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
  kit: ['item.oak_cudgel', 'item.round_shield'],
});
