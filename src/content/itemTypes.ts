/**
 * Item schemas, categories, equipment slot definitions, base gear types, and shared item helpers
 * (ETH-061, ETH-043). Individual item defs live in `starterItems.ts` and `kitItems.ts` and are
 * re-exported together from `items.ts`.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { AttributeId } from './attributes';
import type { Bundle, EffectKind } from './bundles';
import type { AbilityTag } from './abilityTags';
import { abilityTagsSchema } from './abilityTags';
import { bundleRefs, bundleSchema } from './bundles';
import type { ContentKind } from './kind';
import { defShape, glyphSchema, positiveInt } from './schema';
import type { Glyph } from './schema';

/** Every item category, in Codex order. */
export const ITEM_CATEGORIES = ['potion', 'scroll', 'food', 'weapon', 'armor', 'jewelry', 'relic', 'gold', 'junk'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** How each category reads: the Codex group, and the verb used when an adventurer uses one. */
export const ITEM_CATEGORY_INFO: Readonly<Record<ItemCategory, { readonly label: string; readonly verb: string }>> = {
  potion: { label: 'Potions', verb: 'quaffs' },
  scroll: { label: 'Scrolls', verb: 'reads' },
  food: { label: 'Food', verb: 'eats' },
  weapon: { label: 'Weapons', verb: 'uses' },
  armor: { label: 'Armor', verb: 'uses' },
  jewelry: { label: 'Jewelry', verb: 'uses' },
  relic: { label: 'Relics', verb: 'uses' },
  gold: { label: 'Gold', verb: 'uses' },
  junk: { label: 'Junk', verb: 'uses' },
};

// ---------------------------------------------------------------------------------------------
// Equipment (ETH-043)

/**
 * Every equipment slot, in display order. Each holds at most one item. A gear type may fit more
 * than one slot (a ring fits either ring slot, ETH-111): `GearTypeInfo.slots`.
 */
export const EQUIP_SLOTS = ['mainHand', 'offHand', 'head', 'body', 'hands', 'feet', 'neck', 'ring1', 'ring2'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** How each slot reads: its label and tooltip text. */
export const EQUIP_SLOT_INFO: Readonly<Record<EquipSlot, { readonly label: string; readonly description: string }>> = {
  mainHand: { label: 'Main hand', description: 'The weapon an adventurer fights with.' },
  offHand: { label: 'Off hand', description: 'A shield, held in the other hand.' },
  head: { label: 'Head', description: 'A helm or cap.' },
  body: { label: 'Body', description: 'A coat of armor, from quilted cloth to riveted mail.' },
  hands: { label: 'Hands', description: 'Gloves or gauntlets.' },
  feet: { label: 'Feet', description: 'Boots.' },
  neck: { label: 'Neck', description: 'An amulet or pendant on a cord or chain.' },
  ring1: { label: 'Left ring', description: 'A ring on the left hand. Any ring fits either ring slot.' },
  ring2: { label: 'Right ring', description: 'A ring on the right hand. Any ring fits either ring slot.' },
};

/** True if `value` is an equipment slot. */
export function isEquipSlot(value: unknown): value is EquipSlot {
  return typeof value === 'string' && (EQUIP_SLOTS as readonly string[]).includes(value);
}

/** Every base gear type. Each item with `gear` names one; the type says the slots it fits. */
export const GEAR_TYPES = [
  'sword',
  'dagger',
  'axe',
  'mace',
  'staff',
  'shield',
  'helm',
  'lightArmor',
  'mediumArmor',
  'heavyArmor',
  'gloves',
  'boots',
  'amulet',
  'ring',
] as const;
export type GearType = (typeof GEAR_TYPES)[number];

/** What a base gear type is: its name, the slots it fits and the item category it belongs to. */
export interface GearTypeInfo {
  readonly label: string;
  /** The slots it can be worn in; most types fit one, a ring fits either ring slot. Never empty. */
  readonly slots: readonly EquipSlot[];
  readonly category: 'weapon' | 'armor' | 'jewelry';
  readonly description: string;
  /**
   * The attribute a weapon type's damage scales with (ETH-082): swords and daggers Finesse, axes
   * and maces Brawn, staves Wits. Set on every weapon type and nothing else. Wielding one, the
   * wielder's damage comes from this attribute instead of `UNARMED_ATTRIBUTE` (the weapon
   * scaling item property, `src/sim/items/scaling.ts`).
   */
  readonly scalesWith?: AttributeId;
}

/**
 * The attribute an attack scales with when no weapon that names one is wielded: fists, teeth and
 * claws hit with Brawn (ETH-082). The damage row of `ATTRIBUTE_FORMULAS` uses it.
 */
export const UNARMED_ATTRIBUTE: AttributeId = 'brawn';

export const GEAR_TYPE_INFO: Readonly<Record<GearType, GearTypeInfo>> = {
  sword: { label: 'Sword', slots: ['mainHand'], category: 'weapon', scalesWith: 'finesse', description: 'A straight blade, quick and accurate.' },
  dagger: { label: 'Dagger', slots: ['mainHand'], category: 'weapon', scalesWith: 'finesse', description: 'A short blade: light and precise, never heavy-hitting.' },
  axe: { label: 'Axe', slots: ['mainHand'], category: 'weapon', scalesWith: 'brawn', description: 'A hafted blade that hits hard.' },
  mace: { label: 'Mace', slots: ['mainHand'], category: 'weapon', scalesWith: 'brawn', description: 'A club or flanged head that crushes rather than cuts.' },
  staff: { label: 'Staff', slots: ['mainHand'], category: 'weapon', scalesWith: 'wits', description: 'A long shaft of wood, good for keeping foes at bay.' },
  shield: { label: 'Shield', slots: ['offHand'], category: 'armor', description: 'Held in the off hand to turn blows aside.' },
  helm: { label: 'Helm', slots: ['head'], category: 'armor', description: 'Protection for the head.' },
  lightArmor: { label: 'Light armor', slots: ['body'], category: 'armor', description: 'Cloth or leather: a little protection, no hindrance.' },
  mediumArmor: { label: 'Medium armor', slots: ['body'], category: 'armor', description: 'Mail or scale: real protection, a little less nimble.' },
  heavyArmor: { label: 'Heavy armor', slots: ['body'], category: 'armor', description: 'Plate: the most protection, at a cost in nimbleness.' },
  gloves: { label: 'Gloves', slots: ['hands'], category: 'armor', description: 'A better grip, and some protection for the hands.' },
  boots: { label: 'Boots', slots: ['feet'], category: 'armor', description: 'Sure footing.' },
  amulet: { label: 'Amulet', slots: ['neck'], category: 'jewelry', description: 'Worn at the throat. Small, but often more than it seems.' },
  ring: {
    label: 'Ring',
    slots: ['ring1', 'ring2'],
    category: 'jewelry',
    description: 'Worn on a finger; an adventurer can wear two, one on each hand.',
  },
};

/** What makes an item wearable: its base type, which names the slots it fits. */
export interface ItemGear {
  readonly type: GearType;
}

/** The slots an item can be worn in, in `EQUIP_SLOTS` order; empty if it can't be worn. */
export function gearSlots(def: ItemDef): readonly EquipSlot[] {
  return def.gear === undefined ? [] : GEAR_TYPE_INFO[def.gear.type].slots;
}

/** Where and how often the loot step places an item. */
export interface ItemLoot {
  /** Relative chance against the other items allowed at a depth. */
  readonly weight: number;
  /** The shallowest depth it appears at. Default 1. */
  readonly minDepth?: number;
  /** The deepest depth it appears at. Default: no limit. */
  readonly maxDepth?: number;
  /**
   * How many in one pile, from `min` to `max`. Default one. Gold piles are also multiplied by the
   * depth, so deeper floors pay more.
   */
  readonly qty?: { readonly min: number; readonly max: number };
}

export interface ItemDef extends Def {
  readonly glyph: Glyph;
  readonly category: ItemCategory;
  /** Weight of one, counted against the carrier's `carry` stat. 0 or more. */
  readonly weight: number;
  /** Worth of one before anything else is considered (`itemValue` in the sim). 0 or more. */
  readonly value: number;
  /** How many fit in one stack. Default 1: each one is its own entry. */
  readonly stack?: number;
  /** Effects run on use; modifiers (gear's base stats) and triggers while worn. */
  readonly bundle?: Bundle;
  /** Present on weapons and armor: the base type, and so the slot it is worn in (ETH-043). */
  readonly gear?: ItemGear;
  /** Left out, the item is never placed by loot generation. */
  readonly loot?: ItemLoot;
  /**
   * What using the item does, in the closed `AbilityTag` vocabulary (ETH-192). Required exactly
   * when the item is usable (its bundle has effects); `bestByTag` finds a source by these.
   */
  readonly abilityTags?: readonly AbilityTag[];
}

export const ITEMS = new Registry<ItemDef>('item');

const nonNegative = z.number().refine(Number.isFinite, 'must be a finite number').nonnegative('must not be negative');

const lootSchema: z.ZodType<ItemLoot> = z
  .strictObject({
    weight: z.number().positive('must be above 0'),
    minDepth: positiveInt.optional(),
    maxDepth: positiveInt.optional(),
    qty: z
      .strictObject({ min: positiveInt, max: positiveInt })
      .refine((q) => q.min <= q.max, { message: 'min must not be above max', path: ['min'] })
      .optional(),
  })
  .refine((l) => l.maxDepth === undefined || (l.minDepth ?? 1) <= l.maxDepth, {
    message: 'minDepth must not be above maxDepth',
    path: ['minDepth'],
  });

export const ITEM_KIND: ContentKind<ItemDef> = {
  registry: ITEMS,
  schema: z
    .strictObject({
      ...defShape('item'),
      glyph: glyphSchema,
      category: z.enum(ITEM_CATEGORIES),
      weight: nonNegative,
      value: nonNegative,
      stack: positiveInt.optional(),
      bundle: bundleSchema.optional(),
      gear: z.strictObject({ type: z.enum(GEAR_TYPES) }).optional(),
      loot: lootSchema.optional(),
      abilityTags: abilityTagsSchema.optional(),
    })
    .refine((d) => ((d.bundle?.effects?.length ?? 0) > 0) === ((d.abilityTags?.length ?? 0) > 0), {
      message: 'a usable item needs at least one ability tag, and an item that cannot be used may not have any',
      path: ['abilityTags'],
    })
    .refine((d) => (d.loot?.qty?.max ?? 1) <= (d.stack ?? 1), {
      message: 'a loot pile must fit in one stack',
      path: ['loot', 'qty', 'max'],
    })
    .refine((d) => (d.category === 'weapon' || d.category === 'armor' || d.category === 'jewelry') === (d.gear !== undefined), {
      message: 'weapons, armor and jewelry need a gear type, and nothing else may have one',
      path: ['gear'],
    })
    .refine((d) => d.gear === undefined || GEAR_TYPE_INFO[d.gear.type].category === d.category, {
      message: 'the gear type belongs to another category',
      path: ['gear', 'type'],
    })
    .refine((d) => d.gear === undefined || (d.stack ?? 1) === 1, { message: 'gear does not stack', path: ['stack'] })
    .refine((d) => d.gear === undefined || (d.bundle?.effects?.length ?? 0) === 0, {
      message: 'gear is worn, not used: it may not have effects',
      path: ['bundle', 'effects'],
    }),
  refs: (def) => (def.bundle === undefined ? [] : bundleRefs('bundle', def.bundle)),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineItem(def: ItemDef): ItemDef {
  return ITEMS.register(def);
}

/** True for items the AI never picks up: junk, and anything tagged `junk` or `corpse`. */
export function isJunk(def: ItemDef): boolean {
  return def.category === 'junk' || def.tags.includes('junk') || def.tags.includes('corpse');
}

/** True if using the item does something: its bundle has effects to run. */
export function isUsable(def: ItemDef): boolean {
  return (def.bundle?.effects?.length ?? 0) > 0;
}

/** HP the item's use restores to its user (its `heal` effects on `self`), 0 if none. */
export function healAmount(def: ItemDef): number {
  let total = 0;
  for (const e of def.bundle?.effects ?? []) if (e.kind === 'heal' && (e.to ?? 'self') === 'self') total += e.amount;
  return total;
}

/** True if using the item runs at least one effect of `kind` (e.g. `'identify'`, `'uncurse'`). */
export function hasEffectKind(def: ItemDef, kind: EffectKind): boolean {
  return (def.bundle?.effects ?? []).some((e) => e.kind === kind);
}
