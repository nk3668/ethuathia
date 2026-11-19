/**
 * Items: things that lie on the floor and can be picked up, carried, used or (later) equipped
 * (ETH-061). In the sim an item is plain data, an `ItemInstance` (`src/sim/items/`) naming one
 * of these defs: on the floor it is the `item` part of an entity whose `def` is the item's id,
 * and in a pack it is an entry of the carrier's `inventory`.
 *
 * - `category` says what kind of thing it is: it picks the verb for using it, the Codex group
 *   and how the AI treats it (`junk` is never picked up, `gold` goes to the party's purse, a
 *   `relic` is never dropped).
 * - `bundle` is optional. Its `effects` run when the item is used (a potion, a scroll); its
 *   `modifiers` and `triggers` are for gear once equipping exists (ETH-043).
 * - `loot` says whether and where the loot generation step (`gen.loot`) places the item.
 * - `gear` (ETH-043) makes a weapon or armor wearable: its base type (`GEAR_TYPE_INFO`) names the
 *   slot it is worn in, and its `bundle.modifiers` are its base stats, applied while it is worn.
 *
 * Extend the type and the schema together (ETH-054 food buffs).
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { AttributeId } from './attributes';
import type { Bundle } from './bundles';
import { bundleRefs, bundleSchema } from './bundles';
import type { ContentKind } from './kind';
import { defShape, glyphSchema, positiveInt } from './schema';
import type { Glyph } from './schema';

/** Every item category, in Codex order. */
export const ITEM_CATEGORIES = ['potion', 'scroll', 'food', 'weapon', 'armor', 'relic', 'gold', 'junk'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** How each category reads: the Codex group, and the verb used when an adventurer uses one. */
export const ITEM_CATEGORY_INFO: Readonly<Record<ItemCategory, { readonly label: string; readonly verb: string }>> = {
  potion: { label: 'Potions', verb: 'quaffs' },
  scroll: { label: 'Scrolls', verb: 'reads' },
  food: { label: 'Food', verb: 'eats' },
  weapon: { label: 'Weapons', verb: 'uses' },
  armor: { label: 'Armor', verb: 'uses' },
  relic: { label: 'Relics', verb: 'uses' },
  gold: { label: 'Gold', verb: 'uses' },
  junk: { label: 'Junk', verb: 'uses' },
};

// ---------------------------------------------------------------------------------------------
// Equipment (ETH-043)

/** Every equipment slot, in display order. Each holds at most one item. */
export const EQUIP_SLOTS = ['mainHand', 'offHand', 'head', 'body', 'hands', 'feet'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** How each slot reads: its label and tooltip text. */
export const EQUIP_SLOT_INFO: Readonly<Record<EquipSlot, { readonly label: string; readonly description: string }>> = {
  mainHand: { label: 'Main hand', description: 'The weapon an adventurer fights with.' },
  offHand: { label: 'Off hand', description: 'A shield, held in the other hand.' },
  head: { label: 'Head', description: 'A helm or cap.' },
  body: { label: 'Body', description: 'A coat of armor, from quilted cloth to riveted mail.' },
  hands: { label: 'Hands', description: 'Gloves or gauntlets.' },
  feet: { label: 'Feet', description: 'Boots.' },
};

/** True if `value` is an equipment slot. */
export function isEquipSlot(value: unknown): value is EquipSlot {
  return typeof value === 'string' && (EQUIP_SLOTS as readonly string[]).includes(value);
}

/** Every base gear type. Each item with `gear` names one; the type says the slot it is worn in. */
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
] as const;
export type GearType = (typeof GEAR_TYPES)[number];

/** What a base gear type is: its name, and the slot and item category it belongs to. */
export interface GearTypeInfo {
  readonly label: string;
  readonly slot: EquipSlot;
  readonly category: 'weapon' | 'armor';
  readonly description: string;
  /**
   * The attribute a weapon type's damage scales with (ETH-082: swords and daggers Finesse, axes
   * and maces Brawn, staves Wits). Not set or applied yet: until ETH-082 a blow uses the `damage`
   * stat alone.
   */
  readonly scalesWith?: AttributeId;
}

export const GEAR_TYPE_INFO: Readonly<Record<GearType, GearTypeInfo>> = {
  sword: { label: 'Sword', slot: 'mainHand', category: 'weapon', description: 'A straight blade, quick and accurate.' },
  dagger: { label: 'Dagger', slot: 'mainHand', category: 'weapon', description: 'A short blade: light and precise, never heavy-hitting.' },
  axe: { label: 'Axe', slot: 'mainHand', category: 'weapon', description: 'A hafted blade that hits hard.' },
  mace: { label: 'Mace', slot: 'mainHand', category: 'weapon', description: 'A club or flanged head that crushes rather than cuts.' },
  staff: { label: 'Staff', slot: 'mainHand', category: 'weapon', description: 'A long shaft of wood, good for keeping foes at bay.' },
  shield: { label: 'Shield', slot: 'offHand', category: 'armor', description: 'Held in the off hand to turn blows aside.' },
  helm: { label: 'Helm', slot: 'head', category: 'armor', description: 'Protection for the head.' },
  lightArmor: { label: 'Light armor', slot: 'body', category: 'armor', description: 'Cloth or leather: a little protection, no hindrance.' },
  mediumArmor: { label: 'Medium armor', slot: 'body', category: 'armor', description: 'Mail or scale: real protection, a little less nimble.' },
  heavyArmor: { label: 'Heavy armor', slot: 'body', category: 'armor', description: 'Plate: the most protection, at a cost in nimbleness.' },
  gloves: { label: 'Gloves', slot: 'hands', category: 'armor', description: 'A better grip, and some protection for the hands.' },
  boots: { label: 'Boots', slot: 'feet', category: 'armor', description: 'Sure footing.' },
};

/** What makes an item wearable: its base type, which names its slot. */
export interface ItemGear {
  readonly type: GearType;
}

/** The slot an item is worn in, or `null` if it can't be worn. */
export function gearSlot(def: ItemDef): EquipSlot | null {
  return def.gear === undefined ? null : GEAR_TYPE_INFO[def.gear.type].slot;
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
    })
    .refine((d) => (d.loot?.qty?.max ?? 1) <= (d.stack ?? 1), {
      message: 'a loot pile must fit in one stack',
      path: ['loot', 'qty', 'max'],
    })
    .refine((d) => (d.category === 'weapon' || d.category === 'armor') === (d.gear !== undefined), {
      message: 'weapons and armor need a gear type, and nothing else may have one',
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

// ---------------------------------------------------------------------------------------------
// Starter items (original names and text)

export const ITEM_MENDING_DRAUGHT = defineItem({
  id: 'item.mending_draught',
  name: 'Mending draught',
  description: 'A stoppered vial of cloudy red tonic that knits torn flesh in moments. Bitter, and worth every drop.',
  tags: ['healing'],
  glyph: { ch: '!', color: '#e3706b' },
  category: 'potion',
  weight: 1,
  value: 30,
  stack: 5,
  bundle: { effects: [{ kind: 'heal', amount: 12 }] },
  loot: { weight: 10 },
});

export const ITEM_QUICKSTEP_TONIC = defineItem({
  id: 'item.quickstep_tonic',
  name: 'Quickstep tonic',
  description: 'A fizzing green tonic that sets the heart racing. For a while its drinker moves and acts far faster.',
  tags: [],
  glyph: { ch: '!', color: '#8fd16a' },
  category: 'potion',
  weight: 1,
  value: 60,
  stack: 5,
  bundle: { effects: [{ kind: 'applyStatus', status: 'status.hasted', turns: 20 }] },
  loot: { weight: 3, minDepth: 2 },
});

export const ITEM_SCROLL_OF_RENEWAL = defineItem({
  id: 'item.scroll_of_renewal',
  name: 'Scroll of renewal',
  description: 'A strip of vellum inked with a slow, looping chant. Read aloud, it closes wounds over the next several turns.',
  tags: ['healing'],
  glyph: { ch: '?', color: '#d9c58a' },
  category: 'scroll',
  weight: 1,
  value: 35,
  stack: 5,
  bundle: { effects: [{ kind: 'applyStatus', status: 'status.regenerating', turns: 15 }] },
  loot: { weight: 4 },
});

export const ITEM_TRAIL_BISCUIT = defineItem({
  id: 'item.trail_biscuit',
  name: 'Trail biscuit',
  description: 'A hard square of oat and dried fruit, baked to last a season in a pack. A small comfort underground.',
  tags: [],
  glyph: { ch: '%', color: '#c9a36b' },
  category: 'food',
  weight: 1,
  value: 5,
  stack: 10,
  bundle: { effects: [{ kind: 'heal', amount: 2 }] },
  loot: { weight: 6, qty: { min: 1, max: 3 } },
});

export const ITEM_IRON_HATCHET = defineItem({
  id: 'item.iron_hatchet',
  name: 'Iron hatchet',
  description: 'A short-hafted iron axe, notched from use. Good for kindling and for anything that bites.',
  tags: [],
  glyph: { ch: ')', color: '#b8c4cf' },
  category: 'weapon',
  weight: 6,
  value: 25,
  gear: { type: 'axe' },
  bundle: { modifiers: [{ stat: 'damage', op: 'add', value: 2 }] },
  loot: { weight: 1.5 },
});

export const ITEM_QUILTED_JERKIN = defineItem({
  id: 'item.quilted_jerkin',
  name: 'Quilted jerkin',
  description: 'Layers of stitched wool and linen that soften a blow. Heavy, warm, and never quite dry.',
  tags: [],
  glyph: { ch: '[', color: '#9c8f7a' },
  category: 'armor',
  weight: 10,
  value: 20,
  gear: { type: 'lightArmor' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 1 }] },
  loot: { weight: 1 },
});

export const ITEM_SKINNING_KNIFE = defineItem({
  id: 'item.skinning_knife',
  name: 'Skinning knife',
  description: 'A hunter’s thin, curved knife. It finds the gaps in a hide better than it bites through one.',
  tags: [],
  glyph: { ch: ')', color: '#c9d1d9' },
  category: 'weapon',
  weight: 2,
  value: 15,
  gear: { type: 'dagger' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 1 },
      { stat: 'accuracy', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 1 },
});

export const ITEM_OAK_CUDGEL = defineItem({
  id: 'item.oak_cudgel',
  name: 'Oak cudgel',
  description: 'A knotted length of oak, heavier at one end. Crude and cheap, and better than bare fists.',
  tags: [],
  glyph: { ch: ')', color: '#a07850' },
  category: 'weapon',
  weight: 5,
  value: 8,
  gear: { type: 'mace' },
  bundle: { modifiers: [{ stat: 'damage', op: 'add', value: 1 }] },
  loot: { weight: 1 },
});

export const ITEM_ASHWOOD_STAFF = defineItem({
  id: 'item.ashwood_staff',
  name: 'Ashwood staff',
  description: 'A pale, springy staff as tall as its bearer. Its reach keeps claws a step further off.',
  tags: [],
  glyph: { ch: ')', color: '#d8c9a3' },
  category: 'weapon',
  weight: 4,
  value: 20,
  gear: { type: 'staff' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 1 },
      { stat: 'evasion', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 0.5 },
});

export const ITEM_ARMING_SWORD = defineItem({
  id: 'item.arming_sword',
  name: 'Arming sword',
  description: 'A plain, well-balanced blade with a cross guard, made for a soldier’s belt rather than a lord’s wall.',
  tags: [],
  glyph: { ch: ')', color: '#e6edf3', bold: true },
  category: 'weapon',
  weight: 5,
  value: 45,
  gear: { type: 'sword' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 2 },
      { stat: 'accuracy', op: 'add', value: 1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 2 },
});

export const ITEM_FLANGED_MACE = defineItem({
  id: 'item.flanged_mace',
  name: 'Flanged mace',
  description: 'An iron head ringed with flanges on a short haft. Every blow lands like a falling stone, if it lands.',
  tags: [],
  glyph: { ch: ')', color: '#9aa7b3', bold: true },
  category: 'weapon',
  weight: 8,
  value: 50,
  gear: { type: 'mace' },
  bundle: {
    modifiers: [
      { stat: 'damage', op: 'add', value: 3 },
      { stat: 'accuracy', op: 'add', value: -1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 3 },
});

export const ITEM_RIVETED_MAIL = defineItem({
  id: 'item.riveted_mail',
  name: 'Riveted mail',
  description: 'A shirt of small iron rings, each one riveted shut. It stops a cut cold but drags at every dodge.',
  tags: [],
  glyph: { ch: '[', color: '#b8c4cf', bold: true },
  category: 'armor',
  weight: 14,
  value: 60,
  gear: { type: 'mediumArmor' },
  bundle: {
    modifiers: [
      { stat: 'armor', op: 'add', value: 2 },
      { stat: 'evasion', op: 'add', value: -1 },
    ],
  },
  loot: { weight: 0.5, minDepth: 3 },
});

export const ITEM_ROUND_SHIELD = defineItem({
  id: 'item.round_shield',
  name: 'Round shield',
  description: 'Planks of linden under a painted hide, with an iron boss in the middle. Scarred, but sound.',
  tags: [],
  glyph: { ch: '[', color: '#c08a52' },
  category: 'armor',
  weight: 6,
  value: 25,
  gear: { type: 'shield' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_IRON_CAP = defineItem({
  id: 'item.iron_cap',
  name: 'Iron cap',
  description: 'A plain bowl of hammered iron with a leather lining. Dented, which means it worked.',
  tags: [],
  glyph: { ch: '[', color: '#8f9ba6' },
  category: 'armor',
  weight: 3,
  value: 20,
  gear: { type: 'helm' },
  bundle: { modifiers: [{ stat: 'armor', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_GRIP_GLOVES = defineItem({
  id: 'item.grip_gloves',
  name: 'Grip gloves',
  description: 'Close-fitting gloves of tanned hide, rough on the palm. A hilt doesn’t slip in them.',
  tags: [],
  glyph: { ch: '[', color: '#a8865e' },
  category: 'armor',
  weight: 1,
  value: 15,
  gear: { type: 'gloves' },
  bundle: { modifiers: [{ stat: 'accuracy', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_SOFT_BOOTS = defineItem({
  id: 'item.soft_boots',
  name: 'Soft boots',
  description: 'Supple boots with felt soles. Quiet on stone and quick on the turn.',
  tags: [],
  glyph: { ch: '[', color: '#7d6a55' },
  category: 'armor',
  weight: 2,
  value: 15,
  gear: { type: 'boots' },
  bundle: { modifiers: [{ stat: 'evasion', op: 'add', value: 1 }] },
  loot: { weight: 0.5 },
});

export const ITEM_GOLD = defineItem({
  id: 'item.gold',
  name: 'Gold coins',
  description: 'Coins of many old mints, dropped and forgotten. They go into the party’s purse for the rest of the run.',
  tags: [],
  glyph: { ch: '$', color: '#f2c14e', bold: true },
  category: 'gold',
  weight: 0,
  value: 1,
  stack: 100_000,
  loot: { weight: 8, qty: { min: 3, max: 12 } },
});

export const ITEM_BENT_NAIL = defineItem({
  id: 'item.bent_nail',
  name: 'Bent nail',
  description: 'A rusty nail, bent double. Worthless, and nobody sensible carries it.',
  tags: ['junk'],
  glyph: { ch: ',', color: '#8a8f96' },
  category: 'junk',
  weight: 1,
  value: 0,
  loot: { weight: 4 },
});
