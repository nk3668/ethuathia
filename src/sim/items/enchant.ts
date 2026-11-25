/**
 * Enchantment, beatitude (blessed / cursed) and identification item properties (ETH-044).
 *
 * Built directly on `ETH-118`'s `ItemPropertyKind` registry so stats, triggers, `compareGear`,
 * `itemValue`, `itemName` and `canStack` all flow through one seam:
 *
 * - `PROP_ENCHANT` (`enchant`): numeric `+N` / `-N` driven by `baseEnchantmentFor(def)`.
 * - `PROP_BLESSING` (`blessing`): `blessed` / `cursed` beatitude (gear bonus/penalty, sticky
 *   cursed gear, value multiplier, and consumable potency via `consumablePotency`).
 * - `PROP_ENCHANTMENTS` (`enchantments`): extensible list of `{ id, level }` entries from
 *   `ENCHANTMENTS` (both stat modifiers and `trigger.*` bundles).
 * - `PROP_IDENTIFIED` (`identified`): drives `itemKnown` and hides `enchant` / `blessing` /
 *   `enchantments` until the instance is identified.
 */
import { z } from 'zod';
import {
  baseEnchantmentFor,
  BLESSING_INFO,
  enchantmentFits,
  ENCHANTMENTS,
  isAppearanceCategory,
  ITEM_BLESSINGS,
  ITEM_STATE_INFO,
  ITEMS,
  scaleBundle,
} from '../../content';
import type { AppearanceCategory, ItemBlessing } from '../../content';
import type { Entity, RunState } from '../state';
import { isItemIdentified, isInstanceTypeKnown } from './identify';
import type { ItemEnchantment, ItemInstance } from './instance';
import type { ItemMix } from './mix';
import type { ItemBundle, ItemPropertyKind } from './properties';

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

function roman(n: number): string {
  return n <= 1 ? '' : n === 2 ? ' II' : n === 3 ? ' III' : ` ${n}`;
}

/** Numeric `+N` / `-N` enhancement backed by `baseEnchantmentFor(def)` (`prop.enchant`). */
export const PROP_ENCHANT: ItemPropertyKind<number> = {
  id: 'prop.enchant',
  field: 'enchant',
  schema: z
    .number()
    .int()
    .min(-5)
    .max(10)
    .refine((n) => n !== 0, 'enchantment level 0 should be omitted'),
  bundleParts({ item }, level) {
    const def = ITEMS.get(item.def);
    const base = baseEnchantmentFor(def);
    if (base === undefined) return [];
    const bundle = scaleBundle(base.bundle, level);
    return [{ bundle, source: item.def, label: `${def.name} (${signed(level)})` }];
  },
  value({ state, item }, level, base) {
    if (!isItemIdentified(state, item)) return base;
    const ench = baseEnchantmentFor(ITEMS.get(item.def));
    return base + level * (ench?.valuePerLevel ?? 15);
  },
  name: (level) => ({ prefix: level > 0 ? `+${level}` : `${level}` }),
  hidden: (_level, known) => !known,
  stacks: 'equal',
};

/** Blessed or cursed beatitude (`prop.blessing`). Absent means uncursed. */
export const PROP_BLESSING: ItemPropertyKind<ItemBlessing> = {
  id: 'prop.blessing',
  field: 'blessing',
  schema: z.enum(ITEM_BLESSINGS),
  bundleParts({ item }, blessing) {
    const def = ITEMS.get(item.def);
    const base = baseEnchantmentFor(def);
    if (base === undefined) return [];
    const info = BLESSING_INFO[blessing];
    const bundle = scaleBundle(base.bundle, info.gearDelta);
    return [{ bundle, source: item.def, label: `${def.name} (${blessing})` }];
  },
  value({ state, item }, blessing, base) {
    if (!isItemIdentified(state, item)) return base;
    return Math.round(base * BLESSING_INFO[blessing].valueMul);
  },
  name: (blessing) => ({ prefix: BLESSING_INFO[blessing].prefix }),
  hidden: (_blessing, known) => !known,
  stacks: 'equal',
};

const enchantmentEntrySchema = z
  .object({
    id: z.string().min(1),
    level: z.number().int().min(1).max(10),
  })
  .strict();

/** Special named/effect enchantments from `ENCHANTMENTS` (`prop.enchantments`). */
export const PROP_ENCHANTMENTS: ItemPropertyKind<ItemEnchantment[]> = {
  id: 'prop.enchantments',
  field: 'enchantments',
  schema: z.array(enchantmentEntrySchema).min(1),
  bundleParts({ item }, list) {
    const def = ITEMS.get(item.def);
    const out: ItemBundle[] = [];
    for (const entry of list) {
      if (!ENCHANTMENTS.has(entry.id)) continue;
      const ench = ENCHANTMENTS.get(entry.id);
      // Pass the unscaled bundle with `potency = entry.level` so `getStat` and `fireTrigger` both
      // scale once by rank without double-scaling modifiers.
      out.push({
        bundle: ench.bundle,
        source: ench.id,
        label: `${ench.name}${roman(entry.level)} (${def.name})`,
        potency: entry.level,
      });
    }
    return out;
  },
  value({ state, item }, list, base) {
    if (!isItemIdentified(state, item)) return base;
    let total = base;
    for (const entry of list) {
      if (!ENCHANTMENTS.has(entry.id)) continue;
      total += entry.level * ENCHANTMENTS.get(entry.id).valuePerLevel;
    }
    return total;
  },
  name(list) {
    const prefixes: string[] = [];
    const suffixes: string[] = [];
    for (const entry of list) {
      if (!ENCHANTMENTS.has(entry.id)) continue;
      const ench = ENCHANTMENTS.get(entry.id);
      const r = roman(entry.level);
      if (ench.prefix !== undefined) prefixes.push(`${ench.prefix}${r}`);
      if (ench.suffix !== undefined) suffixes.push(`${ench.suffix}${r}`);
    }
    return {
      ...(prefixes.length > 0 ? { prefix: prefixes.join(' ') } : {}),
      ...(suffixes.length > 0 ? { suffix: suffixes.join(' ') } : {}),
    };
  },
  hidden: (_list, known) => !known,
  stacks: 'equal',
};

/** Uniform perceived worth of an appearance-category item whose base type is still unknown (ETH-044, ETH-131). */
export const UNKNOWN_TYPE_VALUE: Readonly<Record<AppearanceCategory, number>> = {
  potion: 30,
  scroll: 30,
  jewelry: 20,
};

/** Identification flag (`prop.identified`): absent means known; `false` hides properties until identified. */
export const PROP_IDENTIFIED: ItemPropertyKind<false> = {
  id: 'prop.identified',
  field: 'identified',
  schema: z.literal(false),
  value({ state, item }, _flag, base) {
    if (isInstanceTypeKnown(state, item) || !ITEMS.has(item.def)) return base;
    const category = ITEMS.get(item.def).category;
    return isAppearanceCategory(category) ? UNKNOWN_TYPE_VALUE[category] : base;
  },
  known: ({ state, item }) => isItemIdentified(state, item),
  stacks: 'equal',
};

/**
 * "The Wits roll on pickup was already made for this instance" (`prop.identify_tried`, ETH-142).
 * It changes nothing about the item: not its stats, name, value or stacking.
 */
export const PROP_IDENTIFY_TRIED: ItemPropertyKind<true> = {
  id: 'prop.identify_tried',
  field: 'identifyTried',
  schema: z.literal(true),
  stacks: 'ignore',
};

/**
 * "A class starting kit item" (`prop.kit`, ETH-176). Only ever `true`; absent means not kit.
 * Never stacks, so a kit item doesn't merge into a stack of found ones. It changes nothing about
 * the item's stats, name or value; `isKitItem` (`kit.ts`) reads it and `itemStateNote` words it.
 */
export const PROP_KIT: ItemPropertyKind<true> = {
  id: 'prop.kit',
  field: 'kit',
  schema: z.literal(true),
  stacks: 'never',
};

/**
 * Hidden blessing counts of an unidentified potion or scroll stack whose copies differ
 * (`prop.mix`, ETH-147). Changes nothing visible: not its name, value or note. `canStack` skips
 * it (and `blessing`) for unidentified consumables, so they share stacks whatever they hold.
 */
export const PROP_MIX: ItemPropertyKind<ItemMix> = {
  id: 'prop.mix',
  field: 'mix',
  schema: z
    .object({
      plain: z.number().int().min(1).optional(),
      blessed: z.number().int().min(1).optional(),
      cursed: z.number().int().min(1).optional(),
    })
    .strict()
    .refine((m) => Object.keys(m).length >= 2, 'a mix needs at least two groups'),
  stacks: 'equal',
};

/** Content ids of every enchantment on `item` (its base `+N`/`-N` enchantment, if any, plus specials). */
export function itemEnchantmentIds(item: ItemInstance): string[] {
  const ids: string[] = [];
  if (item.enchant !== undefined && ITEMS.has(item.def)) {
    const base = baseEnchantmentFor(ITEMS.get(item.def));
    if (base !== undefined) ids.push(base.id);
  }
  for (const e of item.enchantments ?? []) ids.push(e.id);
  return ids;
}

/** Effect potency multiplier when using a consumable (`1.5` blessed, `0.5` cursed, `1` uncursed). */
export function consumablePotency(item: ItemInstance): number {
  return item.blessing === undefined ? 1 : BLESSING_INFO[item.blessing].consumablePotency;
}

/** True if `item` is cursed (whether or not the party knows yet). */
export function isCursed(item: ItemInstance | null | undefined): boolean {
  return item?.blessing === 'cursed';
}

/** True if `item` is cursed and `viewer` knows its properties. */
export function isKnownCursed(state: RunState, item: ItemInstance): boolean {
  return isCursed(item) && isItemIdentified(state, item);
}

/**
 * Extra invariant checks for `enchant` and `enchantments` against `item`'s def and `ENCHANTMENTS`
 * (called by `propertyProblems`).
 */
export function enchantmentProblems(item: ItemInstance): string[] {
  const problems: string[] = [];
  if (!ITEMS.has(item.def)) return problems;
  const def = ITEMS.get(item.def);
  if (item.enchant !== undefined) {
    const base = baseEnchantmentFor(def);
    if (base === undefined) problems.push(`"${item.def}" is not gear and cannot carry enchant ${item.enchant}`);
  }
  if (item.enchantments !== undefined) {
    const seen = new Set<string>();
    for (const entry of item.enchantments) {
      if (seen.has(entry.id)) problems.push(`"${item.def}" lists enchantment "${entry.id}" twice`);
      seen.add(entry.id);
      if (!ENCHANTMENTS.has(entry.id)) {
        problems.push(`"${item.def}" has unknown enchantment "${entry.id}"`);
        continue;
      }
      const ench = ENCHANTMENTS.get(entry.id);
      if (ench.kind !== 'special') problems.push(`"${item.def}" lists non-special enchantment "${entry.id}"`);
      if (!enchantmentFits(ench, def)) problems.push(`enchantment "${entry.id}" does not fit "${item.def}"`);
      if (entry.level < ench.minLevel || entry.level > ench.maxLevel) {
        problems.push(`"${item.def}" enchantment "${entry.id}" level ${entry.level} outside ${ench.minLevel}..${ench.maxLevel}`);
      }
    }
  }
  return problems;
}

/** The tooltip line on a class starting kit item (ETH-176). */
export const KIT_NOTE = 'Starting kit: issued at the start of each run, so it is not sold for Trophies when carried out.';

/**
 * Concise tooltip note describing `item`'s visible states (enchantment, blessing, special
 * enchantments, or unidentified status) for `viewer`, or `null` for plain identified items.
 */
export function itemStateNote(state: RunState, item: ItemInstance, viewer?: Entity): string | null {
  const typeKnown = viewer === undefined || isInstanceTypeKnown(state, item);
  if (!typeKnown) return ITEM_STATE_INFO.unidentified;
  const known = viewer === undefined || isItemIdentified(state, item);
  if (!known && ITEMS.get(item.def).gear === undefined) return ITEM_STATE_INFO.blessingUnknown;
  if (!known) return 'Unidentified: any piece of gear starts this way, plain or not, so this says nothing about it. It may carry hidden enchantments, blessings or curses. High Wits on pickup (one roll per item), wearing it, or a Scroll of Identify reveals them.';

  const parts: string[] = [];
  if (item.enchant !== undefined) {
    const base = baseEnchantmentFor(ITEMS.get(item.def));
    parts.push(
      base === undefined
        ? `Enchantment ${signed(item.enchant)}.`
        : `${base.name} ${signed(item.enchant)} (${base.description})`,
    );
  }
  if (item.blessing !== undefined) {
    parts.push(BLESSING_INFO[item.blessing].description);
  }
  for (const entry of item.enchantments ?? []) {
    if (!ENCHANTMENTS.has(entry.id)) continue;
    const ench = ENCHANTMENTS.get(entry.id);
    parts.push(`${ench.name}${roman(entry.level)}: ${ench.description}`);
  }
  if (item.kit === true) parts.push(KIT_NOTE);
  return parts.length === 0 ? null : parts.join(' ');
}
