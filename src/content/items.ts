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
 *
 * Extend the type and the schema together (ETH-043 adds slots, ETH-054 food buffs).
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
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
  /** Effects run on use; modifiers and triggers once equipped (ETH-043). */
  readonly bundle?: Bundle;
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
      loot: lootSchema.optional(),
    })
    .refine((d) => (d.loot?.qty?.max ?? 1) <= (d.stack ?? 1), {
      message: 'a loot pile must fit in one stack',
      path: ['loot', 'qty', 'max'],
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
  loot: { weight: 3 },
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
  loot: { weight: 2 },
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
