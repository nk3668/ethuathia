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
import { isStampId, STAMP_IDS, STAMPS } from './stamps';
import type { StampId } from './stamps';
import type { ContentKind } from './kind';
import { defShape } from './schema';
import { NEUTRAL_PICKS, picksProblems, picksRefs, picksSchema } from './tactics';
import type { AdventurerPicks } from './tactics';

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
  /**
   * The class's own Tier-1 version of its kit's main-hand item and first piece of armor (ETH-188):
   * what the Smithy's Artisan Implements and Tailored Attire swap in for the base piece. Each must
   * fit the slot of the piece it replaces. A class that has a `kit` names an upgrade for each of its two pieces (a kit with no armor needs only the weapon).
   */
  readonly kitUpgrade?: { readonly weapon?: string; readonly defense?: string };
  /** The class's Apprentice Trinket (ETH-188): a ring or amulet worn from the start as kit. Required of every class with a `kit`. */
  readonly trinket?: string;
  /** The class's default Forge Stamp (ETH-188), used for random recruits and a slot left on the default. Required of every class with a `kit`. */
  readonly stamp?: StampId;
  /**
   * The class's default build on each tactics axis but the party's (ETH-162, CLAUDE.md §5.2):
   * role, range, focus and habits. Random recruits use it, and a roster adventurer who has made
   * no picks of their own does. Left out, the class plays the neutral option on every axis
   * (`NEUTRAL_PICKS`), which behaves as the baseline always has.
   */
  readonly tactics?: AdventurerPicks;
}

/** The default tactics picks of the class `classId`: its own build, or the neutral one. */
export function classTactics(def: Pick<ClassDef, 'tactics'>): AdventurerPicks {
  return def.tactics ?? NEUTRAL_PICKS;
}

/**
 * The kit's two upgradeable pieces (ETH-188), as def ids: the first item that fits the main hand and
 * the first piece of armor, the same two `giveKit` enchants and upgrades. Either may be missing.
 */
export function kitPieceIds(kit: readonly string[]): { weapon?: string; defense?: string } {
  const out: { weapon?: string; defense?: string } = {};
  for (const id of kit) {
    if (!ITEMS.has(id)) continue;
    const def = ITEMS.get(id);
    if (out.weapon === undefined && gearSlots(def).includes('mainHand')) out.weapon = id;
    if (out.defense === undefined && def.category === 'armor') out.defense = id;
  }
  return out;
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

/** Why a class's Smithy pieces (`kitUpgrade`, `trinket`, `stamp`) don't work with its kit, as problem lines (ETH-188). */
export function smithyKitProblems(def: Pick<ClassDef, 'kit' | 'kitUpgrade' | 'trinket' | 'stamp'>): string[] {
  const kit = def.kit ?? [];
  if (kit.length === 0) {
    return def.kitUpgrade !== undefined || def.trinket !== undefined || def.stamp !== undefined ? ['has a kitUpgrade, trinket or stamp but no kit'] : [];
  }
  const problems: string[] = [];
  const pieces = kitPieceIds(kit);
  for (const part of ['weapon', 'defense'] as const) {
    {
      const base = pieces[part];
      const id = def.kitUpgrade?.[part];
      const what = part === 'weapon' ? 'main-hand item' : 'armor piece';
      if (base === undefined) {
        if (id !== undefined) problems.push(`kitUpgrade.${part}: the kit has no ${what} to upgrade`);
        continue;
      }
      if (id === undefined) {
        problems.push(`has a kit ${what} but no kitUpgrade.${part} (its Tier-1 version)`);
        continue;
      }
      if (!ITEMS.has(id)) continue;
      const item = ITEMS.get(id);
      const baseSlots = gearSlots(ITEMS.get(base));
      if (id === base) problems.push(`kitUpgrade.${part} "${id}" is the base kit piece`);
      else if (!gearSlots(item).some((slot) => baseSlots.includes(slot))) problems.push(`kitUpgrade.${part} "${id}" does not fit the slot of "${base}"`);
      if (part === 'defense' && item.category !== 'armor') problems.push(`kitUpgrade.defense "${id}" is not armor`);
    }
  }
  if (def.trinket === undefined) problems.push('has a kit but no trinket (a ring or amulet)');
  else if (ITEMS.has(def.trinket)) {
    if (ITEMS.get(def.trinket).category !== 'jewelry') problems.push(`trinket "${def.trinket}" is not a ring or amulet`);
    else if (kitProblems([...kit, def.trinket]).length > kitProblems(kit).length) {
      problems.push(`trinket "${def.trinket}" has no free slot alongside the kit`);
    }
  }
  if (def.stamp === undefined) problems.push('has a kit but no default stamp');
  else if (!isStampId(def.stamp)) problems.push(`unknown stamp "${def.stamp as string}"`);
  else if (pieces[STAMPS[def.stamp].piece] === undefined) {
    problems.push(`default stamp "${def.stamp}" targets a ${STAMPS[def.stamp].piece} piece, which the kit does not have`);
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
    kitUpgrade: z.strictObject({ weapon: z.string().min(1).optional(), defense: z.string().min(1).optional() }).optional(),
    trinket: z.string().min(1).optional(),
    stamp: z.enum(STAMP_IDS).optional(),
    tactics: picksSchema.optional(),
  }),
  refs: (def) => [
    ...(def.kit ?? []).map((id, i) => ({ path: `kit[${i}]`, kind: 'item' as const, id })),
    ...(['weapon', 'defense'] as const).flatMap((part) => {
      const id = def.kitUpgrade?.[part];
      return id === undefined ? [] : [{ path: `kitUpgrade.${part}`, kind: 'item' as const, id }];
    }),
    ...(def.trinket === undefined ? [] : [{ path: 'trinket', kind: 'item' as const, id: def.trinket }]),
    ...(def.tactics === undefined ? [] : picksRefs('tactics', def.tactics)),
  ],
  check: (defs) =>
    defs.flatMap((d) =>
      [...kitProblems(d.kit ?? []), ...smithyKitProblems(d), ...(d.tactics === undefined ? [] : picksProblems(d.tactics).map((p) => `tactics: ${p}`))].map(
        (p) => `class "${d.id}": ${p}`,
      ),
    ),
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
  kitUpgrade: { weapon: 'item.flanged_mace', defense: 'item.banded_shield' },
  trinket: 'item.copper_band',
  stamp: 'warding',
  // The neutral build until the role, range and focus items give each class its own (ETH-193).
  tactics: { ...NEUTRAL_PICKS },
});

export const CLASS_OUTRIDER = defineClass({
  id: 'class.outrider',
  name: 'Outrider',
  description:
    'A rider without a horse: the guild’s eyes on the road ahead. Quick hands, quick feet, and no wish ' +
    'to be the one standing when the fighting starts.',
  hint: 'Ranges ahead of the party and is first to see the trap.',
  tags: ['martial', 'scout'],
  // 37 starting points and +3.25 a level, the Vanguard's budget (ETH-177 repriced Finesse so it fits).
  attributes: { brawn: 8, finesse: 14, wits: 7, grit: 8 },
  // Each level, on average: Finesse +1.5, Brawn +0.75, Wits +0.5, Grit +0.5.
  growth: {
    brawn: { min: 1, max: 1, chance: 0.75 },
    finesse: { min: 1, max: 2 },
    wits: { min: 1, max: 1, chance: 0.5 },
    grit: { min: 1, max: 1, chance: 0.5 },
  },
  kit: ['item.skinning_knife', 'item.soft_boots'],
  kitUpgrade: { weapon: 'item.trail_dirk', defense: 'item.ridge_boots' },
  trinket: 'item.knotwork_pendant',
  stamp: 'nimble',
  // The neutral build until the role, range and focus items give each class its own (ETH-193).
  tactics: { ...NEUTRAL_PICKS },
});

export const CLASS_LOREKEEPER = defineClass({
  id: 'class.lorekeeper',
  name: 'Lorekeeper',
  description:
    'A scholar of the guild’s library who goes down to read the dungeon itself: its marks, its traps and the ' +
    'things it leaves lying about. Until its spells arrive the Lorekeeper is a weak fighter, and the most ' +
    'fragile of the guild.',
  hint: 'Reads the dark the way others read a ledger.',
  tags: ['scholar'],
  // 33 starting points, +3.25 a level. Wits has no combat use until spells, so it is trimmed to trail the field.
  attributes: { brawn: 5, finesse: 8, wits: 12, grit: 8 },
  // Each level, on average: Wits +1.5, Grit +0.75, Brawn +0.5, Finesse +0.5.
  growth: {
    brawn: { min: 1, max: 1, chance: 0.5 },
    finesse: { min: 1, max: 1, chance: 0.5 },
    wits: { min: 1, max: 2 },
    grit: { min: 1, max: 1, chance: 0.75 },
  },
  kit: ['item.ashwood_staff', 'item.quilted_jerkin'],
  kitUpgrade: { weapon: 'item.ironshod_staff', defense: 'item.scribes_coat' },
  trinket: 'item.hearthstone_amulet',
  stamp: 'warding',
  // The neutral build until the role, range and focus items give each class its own (ETH-193).
  tactics: { ...NEUTRAL_PICKS },
});

export const CLASS_REAVER = defineClass({
  id: 'class.reaver',
  name: 'Reaver',
  description: 'A hireling from the border holds who settles every argument with an axe. Hits hard, thinks later.',
  hint: 'Clears a room by making it smaller.',
  tags: ['martial'],
  // 33 starting points and +3.25 a level: four under the Vanguard's 37, since the hatchet's +2 damage
  // is the rest of its edge (ETH-177; on 37 it won twice as often as the Vanguard).
  attributes: { brawn: 11, finesse: 9, wits: 4, grit: 9 },
  // Each level, on average: Brawn +1.5, Grit +1, Finesse +0.5, Wits +0.25.
  growth: {
    brawn: { min: 1, max: 2 },
    finesse: { min: 1, max: 1, chance: 0.5 },
    wits: { min: 1, max: 1, chance: 0.25 },
    grit: { min: 1, max: 1 },
  },
  kit: ['item.iron_hatchet', 'item.iron_cap'],
  kitUpgrade: { weapon: 'item.bearded_axe', defense: 'item.brow_helm' },
  trinket: 'item.garnet_signet',
  stamp: 'keen',
  // The neutral build until the role, range and focus items give each class its own (ETH-193).
  tactics: { ...NEUTRAL_PICKS },
});
