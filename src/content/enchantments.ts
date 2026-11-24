/**
 * Enchantments, beatitude (blessed / uncursed / cursed) and item-state metadata (ETH-044).
 *
 * Every enchantment is pure data in `ENCHANTMENTS` (ids `enchant.*`), carrying a standard `Bundle`
 * (stat modifiers, triggers, effects) that is validated by `bundleRefs` against `STAT_REFS`,
 * `STATUSES` and `TRIGGERS` automatically:
 *
 * - **`base` enchantments** drive numeric `+N` / `-N` enhancement per gear category or specific
 *   `GearType` (specific type wins over category).
 * - **`special` enchantments** are named/effect enchantments rolled onto gear alongside `+N`
 *   (e.g. Keen, Venomous, of Draining, Nimble, of Warding). Adding new enchantments later is a
 *   single `defineEnchantment(...)` entry with zero sim or UI code changes.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { bundleRefs, bundleSchema } from './bundles';
import type { Bundle, Modifier } from './bundles';
import { GEAR_TYPES } from './items';
import type { ItemCategory, ItemDef } from './items';
import type { ContentKind } from './kind';
import { defShape, nonNegativeInt, positiveInt } from './schema';

/** Gear categories or specific base gear types an enchantment can target. */
export const ENCHANT_TARGETS = ['weapon', 'armor', 'jewelry', ...GEAR_TYPES] as const;
export type EnchantTarget = (typeof ENCHANT_TARGETS)[number];

/** Whether an enchantment drives numeric `+N`/`-N` enhancement or is a named special enchantment. */
export const ENCHANT_KINDS = ['base', 'special'] as const;
export type EnchantKind = (typeof ENCHANT_KINDS)[number];

/** One data-driven enchantment definition (`ENCHANTMENTS`). */
export interface EnchantmentDef extends Def {
  readonly kind: EnchantKind;
  /** Categories or specific `GearType`s this enchantment can appear on. */
  readonly appliesTo: readonly EnchantTarget[];
  /**
   * The effect of 1 rank of this enchantment. Modifiers scale linearly by rank (`add`: `value × level`,
   * `mul`: `1 + (value − 1) × level`); triggers fire at `potency = level` when `level > 0`.
   */
  readonly bundle: Bundle;
  /** Optional prefix word for `special` enchantments (e.g. `"Keen"`, `"Venomous"`). */
  readonly prefix?: string;
  /** Optional suffix phrase for `special` enchantments (e.g. `"of Draining"`, `"of Warding"`). */
  readonly suffix?: string;
  /** Lowest allowed rank (`base` allows negative, e.g. `-2`; `special` must be `>= 1`). */
  readonly minLevel: number;
  /** Highest allowed rank. */
  readonly maxLevel: number;
  /** Relative loot-roll weight (`0` = never rolled randomly; hand-crafted or Smithy-only). */
  readonly weight: number;
  /** Shallowest floor depth where loot may roll this enchantment. Default 1. */
  readonly minDepth?: number;
  /** Deepest floor depth where loot may roll this enchantment. Default: no limit. */
  readonly maxDepth?: number;
  /** Worth adjustment per rank (signed; added to base item value). */
  readonly valuePerLevel: number;
}

export const ENCHANTMENTS = new Registry<EnchantmentDef>('enchantment');

const intRank = z.number().int('must be a whole number').min(-5, 'must be at least -5').max(10, 'must be at most 10');

export const ENCHANTMENT_KIND: ContentKind<EnchantmentDef> = {
  registry: ENCHANTMENTS,
  schema: z
    .strictObject({
      ...defShape('enchant'),
      kind: z.enum(ENCHANT_KINDS),
      appliesTo: z.array(z.enum(ENCHANT_TARGETS)).min(1, 'must target at least one gear type or category'),
      bundle: bundleSchema,
      prefix: z.string().min(1).optional(),
      suffix: z.string().min(1).optional(),
      minLevel: intRank,
      maxLevel: intRank,
      weight: z.number().refine(Number.isFinite, 'must be a finite number').nonnegative('must not be negative'),
      minDepth: positiveInt.optional(),
      maxDepth: positiveInt.optional(),
      valuePerLevel: nonNegativeInt,
    })
    .refine((d) => d.minLevel <= d.maxLevel, { message: 'minLevel must not be above maxLevel', path: ['minLevel'] })
    .refine((d) => d.kind !== 'special' || d.minLevel >= 1, {
      message: 'special enchantments must have minLevel of at least 1',
      path: ['minLevel'],
    })
    .refine((d) => d.kind !== 'special' || d.prefix !== undefined || d.suffix !== undefined, {
      message: 'special enchantments need a prefix or suffix',
      path: ['prefix'],
    })
    .refine((d) => d.maxDepth === undefined || (d.minDepth ?? 1) <= d.maxDepth, {
      message: 'minDepth must not be above maxDepth',
      path: ['minDepth'],
    }),
  refs: (def) => bundleRefs('bundle', def.bundle),
};

/** Registers an enchantment def and returns it. Shape and refs are checked by `validateContent`. */
export function defineEnchantment(def: EnchantmentDef): EnchantmentDef {
  return ENCHANTMENTS.register(def);
}

/** True if `ench` can apply to `def` (matches its specific gear type or its category). */
export function enchantmentFits(ench: EnchantmentDef, def: ItemDef): boolean {
  if (def.gear === undefined) return false;
  return ench.appliesTo.includes(def.gear.type) || ench.appliesTo.includes(def.category as EnchantTarget);
}

/**
 * The `base` enchantment driving numeric `+N`/`-N` enhancement for `def`, or `undefined` for
 * non-gear items. A specific `GearType` match wins over a category match.
 */
export function baseEnchantmentFor(def: ItemDef): EnchantmentDef | undefined {
  if (def.gear === undefined) return undefined;
  let fallback: EnchantmentDef | undefined;
  for (const ench of ENCHANTMENTS.all()) {
    if (ench.kind !== 'base') continue;
    if (ench.appliesTo.includes(def.gear.type)) return ench;
    if (fallback === undefined && ench.appliesTo.includes(def.category as EnchantTarget)) fallback = ench;
  }
  return fallback;
}

/** Special enchantments eligible to roll on `def` at `depth`, in registration order. */
export function specialEnchantmentsFor(def: ItemDef, depth: number): EnchantmentDef[] {
  if (def.gear === undefined) return [];
  return ENCHANTMENTS.all().filter(
    (e) =>
      e.kind === 'special' &&
      e.weight > 0 &&
      depth >= (e.minDepth ?? 1) &&
      depth <= (e.maxDepth ?? Infinity) &&
      enchantmentFits(e, def),
  );
}

/**
 * Scales a bundle's stat modifiers by `level` (signed). Triggers are kept only when `level > 0`
 * (and executed by the caller with `potency = level`).
 */
export function scaleBundle(bundle: Bundle, level: number): Bundle {
  if (level === 0) return {};
  const modifiers: Modifier[] | undefined =
    bundle.modifiers === undefined
      ? undefined
      : bundle.modifiers.map((m) => ({
          stat: m.stat,
          op: m.op,
          value: m.op === 'add' ? m.value * level : Math.max(0, 1 + (m.value - 1) * level),
        }));
  const triggers = level > 0 ? bundle.triggers : undefined;
  return {
    ...(modifiers === undefined || modifiers.length === 0 ? {} : { modifiers }),
    ...(triggers === undefined || triggers.length === 0 ? {} : { triggers }),
  };
}

// ---------------------------------------------------------------------------------------------
// Base numeric (+N / -N) enchantments

export const ENCHANT_HONED = defineEnchantment({
  id: 'enchant.honed',
  name: 'Honed',
  description: 'A sharper edge or heavier balance on a weapon: adds +1 Damage per level (or subtracts it when negatively enchanted).',
  hint: 'Basic temper on weapons; positive ranks raise strike power, while negative ranks dull every blow.',
  tags: ['base', 'weapon'],
  kind: 'base',
  appliesTo: ['weapon'],
  bundle: { modifiers: [{ stat: 'damage', op: 'add', value: 1 }] },
  minLevel: -2,
  maxLevel: 3,
  weight: 0,
  valuePerLevel: 15,
});

export const ENCHANT_REINFORCED = defineEnchantment({
  id: 'enchant.reinforced',
  name: 'Reinforced',
  description: 'Tempered plates or tight-woven mail on armor: adds +1 Armor per level (or subtracts it when negatively enchanted).',
  hint: 'Basic smithwork on armor; positive ranks strengthen protection, while negative ranks leave weak seams.',
  tags: ['base', 'armor'],
  kind: 'base',
  appliesTo: ['armor'],
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 1 }] },
  minLevel: -2,
  maxLevel: 3,
  weight: 0,
  valuePerLevel: 15,
});

export const ENCHANT_ATTUNED = defineEnchantment({
  id: 'enchant.attuned',
  name: 'Attuned',
  description: 'Quiet resonance worked into a ring or amulet: adds +2 Max HP per level (or subtracts it when negatively enchanted).',
  hint: 'Basic resonance on rings and amulets; positive ranks bolster vitality, while negative ranks sap it.',
  tags: ['base', 'jewelry'],
  kind: 'base',
  appliesTo: ['jewelry'],
  bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 2 }] },
  minLevel: -2,
  maxLevel: 3,
  weight: 0,
  valuePerLevel: 15,
});

// ---------------------------------------------------------------------------------------------
// Starter special enchantments (pure data; add more in future backlog items)

export const ENCHANT_KEEN = defineEnchantment({
  id: 'enchant.keen',
  name: 'Keen',
  description: 'Balanced to find every seam in hide or mail. Raises Accuracy by +1 per rank while wielded.',
  hint: 'Special weapon enchantment from deeper floors; helps attacks connect more reliably.',
  tags: ['weapon'],
  kind: 'special',
  appliesTo: ['weapon'],
  prefix: 'Keen',
  bundle: { modifiers: [{ stat: 'accuracy', op: 'add', value: 1 }] },
  minLevel: 1,
  maxLevel: 2,
  weight: 4,
  minDepth: 2,
  valuePerLevel: 25,
});

export const ENCHANT_VENOMOUS = defineEnchantment({
  id: 'enchant.venomous',
  name: 'Venomous',
  description: 'Its edge beads with a slow green venom. Landing a blow poisons the target for 4 turns.',
  hint: 'Special weapon enchantment from deeper floors; coats foes in lingering poison on hit.',
  tags: ['weapon', 'trigger'],
  kind: 'special',
  appliesTo: ['weapon'],
  prefix: 'Venomous',
  bundle: {
    triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.poisoned', turns: 4, to: 'other' }] }],
  },
  minLevel: 1,
  maxLevel: 2,
  weight: 2,
  minDepth: 3,
  valuePerLevel: 35,
});

export const ENCHANT_VAMPIRIC = defineEnchantment({
  id: 'enchant.vampiric',
  name: 'Draining',
  description: 'Drinks warmth from every wound it opens. Landing a blow restores 1 HP per rank to its wielder.',
  hint: 'Rare special weapon enchantment found in the lower delve; restores health on each hit.',
  tags: ['weapon', 'trigger'],
  kind: 'special',
  appliesTo: ['weapon'],
  suffix: 'of Draining',
  bundle: {
    triggers: [{ on: 'trigger.hit', effects: [{ kind: 'heal', amount: 1 }] }],
  },
  minLevel: 1,
  maxLevel: 2,
  weight: 2,
  minDepth: 4,
  valuePerLevel: 40,
});

export const ENCHANT_NIMBLE = defineEnchantment({
  id: 'enchant.nimble',
  name: 'Nimble',
  description: 'Lightened and fitted so it never catches a stride. Raises Evasion by +1 per rank while worn.',
  hint: 'Special armor enchantment from deeper floors; makes it easier to slip past incoming blows.',
  tags: ['armor'],
  kind: 'special',
  appliesTo: ['armor'],
  prefix: 'Nimble',
  bundle: { modifiers: [{ stat: 'evasion', op: 'add', value: 1 }] },
  minLevel: 1,
  maxLevel: 2,
  weight: 3,
  minDepth: 2,
  valuePerLevel: 25,
});

export const ENCHANT_WARDING = defineEnchantment({
  id: 'enchant.warding',
  name: 'Warding',
  description: 'Etched with protective knots that turn aside venom and hexes. Raises Status Resistance by +10% per rank.',
  hint: 'Special armor and jewelry enchantment from deeper floors; helps shrug off harmful statuses.',
  tags: ['armor', 'jewelry'],
  kind: 'special',
  appliesTo: ['armor', 'jewelry'],
  suffix: 'of Warding',
  bundle: { modifiers: [{ stat: 'statusResist', op: 'add', value: 10 }] },
  minLevel: 1,
  maxLevel: 2,
  weight: 3,
  minDepth: 2,
  valuePerLevel: 25,
});

// ---------------------------------------------------------------------------------------------
// Beatitude (blessed / uncursed / cursed) and item-state metadata

export const ITEM_BLESSINGS = ['blessed', 'cursed'] as const;
export type ItemBlessing = (typeof ITEM_BLESSINGS)[number];

export interface BlessingInfo {
  readonly label: string;
  readonly prefix: string;
  /** Signed enhancement delta applied on top of gear's base enchantment (+1 blessed, -1 cursed). */
  readonly gearDelta: number;
  /** Multiplier for `runEffects` potency when a consumable is used (1.5× blessed, 0.5× cursed). */
  readonly consumablePotency: number;
  /** Multiplier applied to unit value. */
  readonly valueMul: number;
  /** Tooltip / Codex explanation of this state. */
  readonly description: string;
}

export const BLESSING_INFO: Readonly<Record<ItemBlessing, BlessingInfo>> = {
  blessed: {
    label: 'Blessed',
    prefix: 'blessed',
    gearDelta: 1,
    consumablePotency: 1.5,
    valueMul: 1.25,
    description: 'Blessed: gear grants +1 bonus enhancement; potions and scrolls act at 1.5× potency (blessed Identify and Uncursing affect everything carried).',
  },
  cursed: {
    label: 'Cursed',
    prefix: 'cursed',
    gearDelta: -1,
    consumablePotency: 0.5,
    valueMul: 0.5,
    description: 'Cursed: gear suffers −1 enhancement and cannot be removed or replaced until uncursed; potions and scrolls act at half potency.',
  },
};

/** Tooltip and Codex explanations for every item state (ETH-044). */
export const ITEM_STATE_INFO = {
  blessed: BLESSING_INFO.blessed.description,
  uncursed: 'Uncursed: acts normally with no blessing or curse.',
  cursed: BLESSING_INFO.cursed.description,
  enchanted: 'Enchanted (+N / −N): raises or lowers gear stats via its enhancement profile, and special enchantments add extra stats or on-hit triggers.',
  blessingUnknown:
    'Blessing unknown: every potion or scroll of a known type looks the same until it is identified, whether it is plain, blessed or cursed, so this note says nothing about this one. Using it, reading a Scroll of Identify or high Wits when picking it up reveals which it is.',
  unidentified:
    'Unidentified: its true nature or hidden properties are unknown. Every weapon, armor and jewelry piece starts this way, whether or not it is special, and may turn out plain, enchanted, blessed or cursed. High Wits can identify an item once when it is picked up; wearing, using or reading a Scroll of Identify reveals it. Cursed gear cannot be taken off until a Scroll of Uncursing frees it.',
} as const;

// ---------------------------------------------------------------------------------------------
// Seeded generic appearance pools for unidentified item types

/** Categories whose base type starts hidden behind a seeded per-run appearance until identified. */
export const APPEARANCE_CATEGORIES = ['potion', 'scroll', 'jewelry'] as const;
export type AppearanceCategory = (typeof APPEARANCE_CATEGORIES)[number];

/** True if items of `category` get a seeded generic appearance name while unidentified. */
export function isAppearanceCategory(category: ItemCategory): category is AppearanceCategory {
  return category === 'potion' || category === 'scroll' || category === 'jewelry';
}

/** Generic appearances shuffled deterministically per run seed (`appearanceName`). */
export const APPEARANCE_POOLS: Readonly<Record<AppearanceCategory, readonly string[]>> = {
  potion: [
    'Cloudy red vial',
    'Fizzing green phial',
    'Amber glass flask',
    'Smoky indigo bottle',
    'Silver-stoppered vial',
    'Pale ochre tonic',
    'Milky white phial',
    'Dark plum flask',
    'Glimmering cyan vial',
    'Thick russet bottle',
  ],
  scroll: [
    'Wax-sealed scroll',
    'Charred vellum strip',
    'Copper-inked scroll',
    'Folded parchment',
    'Ribbon-tied scroll',
    'Runed linen slip',
    'Ashen papyrus roll',
    'Gilt-edged scroll',
    'Stained vellum sheet',
    'Stamped parchment',
  ],
  jewelry: [
    'Tarnished band',
    'Polished stone ring',
    'Braided bronze ring',
    'Hammered silver band',
    'Carved bone pendant',
    'Iron-wired amulet',
    'Dull copper charm',
    'Etched pewter ring',
    'Dark glass pendant',
    'Twisted brass band',
  ],
};
