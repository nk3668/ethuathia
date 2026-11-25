/**
 * Start perks (ETH-159): what a Town upgrade can change about how every later run begins, apart
 * from stats. A `start` upgrade grant (`UpgradeGrant`) carries one. They are the Smithy's kit and
 * identification nodes: the party knows some item kinds from the first turn, its starting gear is
 * enchanted, or it carries extra starting items. Like a class's kit, the items are issued with the
 * run and never sold on exit (ETH-176, ETH-171).
 *
 * `src/meta/prepare/startPerks.ts` turns the owned perks into `RunConfig` fields, and the sim
 * applies them in `createRun`. Wording for tooltips is `describeGrant` (`src/meta/grantText.ts`).
 */
import { z } from 'zod';
import type { ContentRef } from './kind';
import { idSchema, positiveInt } from './schema';

/** Item categories whose kinds can be known from the start of a run: potions, and rings and amulets (the `jewelry` category). */
export const START_KNOWN_CATEGORIES = ['potion', 'jewelry'] as const;
export type StartKnownCategory = (typeof START_KNOWN_CATEGORIES)[number];

/** Which starting kit piece is enchanted: the main-hand item, or the kit's first piece of armor. */
export const START_ENCHANT_PIECES = ['weapon', 'defense'] as const;
export type StartEnchantPiece = (typeof START_ENCHANT_PIECES)[number];

/** Names for the categories and pieces above, for tooltips. */
export const START_PERK_INFO = {
  potion: { name: 'potion', plural: 'potions' },
  jewelry: { name: 'ring and amulet', plural: 'rings and amulets' },
  weapon: { name: 'main-hand item', plural: 'main-hand items' },
  defense: { name: 'defensive piece', plural: 'defensive pieces' },
} as const satisfies Record<StartKnownCategory | StartEnchantPiece, { name: string; plural: string }>;

export type StartPerk =
  /** The party knows every kind in `category` from the first turn (it still has to identify which copies are special, ETH-142). */
  | { readonly perk: 'know'; readonly category: StartKnownCategory }
  /** Each adventurer's `piece` of their class kit is worn at +1, using that gear type's own enchantment. */
  | { readonly perk: 'enchant'; readonly piece: StartEnchantPiece }
  /** The party starts with `qty` of `item`, carried by its first member. Known on sight, never sold. */
  | { readonly perk: 'stock'; readonly item: string; readonly qty: number };

export const startPerkSchema = z.discriminatedUnion('perk', [
  z.strictObject({ perk: z.literal('know'), category: z.enum(START_KNOWN_CATEGORIES) }),
  z.strictObject({ perk: z.literal('enchant'), piece: z.enum(START_ENCHANT_PIECES) }),
  z.strictObject({ perk: z.literal('stock'), item: idSchema('item'), qty: positiveInt }),
]);

/** The content ids a start perk names, for reference checks. */
export function startPerkRefs(path: string, perk: StartPerk): ContentRef[] {
  return perk.perk === 'stock' ? [{ path: `${path}.item`, kind: 'item', id: perk.item }] : [];
}
