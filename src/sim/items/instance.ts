/**
 * Item instances (ETH-061): one item, or a stack of identical ones, as plain data.
 *
 * An `ItemInstance` names its def and a quantity. Every other field is an item property
 * (ETH-118, `properties.ts`): optional, owned by one `ItemPropertyKind` that says how it changes
 * the item's bundles, worth, name and stacking. An instance without them is a plain one, so no
 * save needs a migration when a field arrives. Two instances stack only when each property field
 * allows it (`canStack`: `never` kinds keep the item apart, `equal` kinds compare the values).
 *
 * The same shape is used everywhere an item can be: the `item` part of an entity lying on a
 * floor, an entry of an actor's `inventory`, a planned item in a floor plan.
 */
import { ITEMS } from '../../content';
import { clonePlain } from '../../core';
import type { EquipSlot, ItemBlessing, ItemDef } from '../../content';
import { hiddenCounts, isSecretConsumable, mergeHidden, setHiddenCounts, takeInOrder } from './mix';
import type { ItemMix } from './mix';
import { propertyKindFor } from './properties';

/** One special named/effect enchantment carried by an item (`prop.enchantments`, ETH-044). */
export interface ItemEnchantment {
  /** Content id from `ENCHANTMENTS` (`enchant.*`, `kind: 'special'`). */
  id: string;
  /** Positive integer rank (`1..maxLevel`). */
  level: number;
}

/** One item or a stack of identical ones. Plain data; leave optional fields out rather than `undefined`. */
export interface ItemInstance {
  /** The item def's id, e.g. `item.mending_draught`. */
  def: string;
  /** How many, from 1 to the def's `stack` (default 1). */
  qty: number;
  /** Numeric enhancement (+N / -N), backed by `baseEnchantmentFor(def)` (ETH-044). */
  enchant?: number;
  /** Blessed or cursed beatitude; absent means uncursed (ETH-044). */
  blessing?: ItemBlessing;
  /** Special named/effect enchantments from `ENCHANTMENTS` (ETH-044). */
  enchantments?: ItemEnchantment[];
  /**
   * Whether this instance's hidden properties (and base type, for potions/scrolls/jewelry) are
   * known (ETH-044). Absent means known; loot generation sets `false` on items that start unidentified.
   */
  identified?: false;
  /**
   * Set once the Wits `identify` roll on pickup has been made for this instance (ETH-142), so
   * dropping and picking it up again can't reroll. Only present while `identified: false`; it
   * never affects stacking.
   */
  identifyTried?: true;
  /**
   * Hidden blessing counts of a stack of unidentified potions or scrolls whose copies differ
   * (ETH-147, `prop.mix`). Only ever on an `identified: false` stack, never in a snapshot.
   */
  mix?: ItemMix;
  /** Heirloom history and flavor (ETH-118 `prop.origin`; ETH-069, ETH-109). Never stacks. */
  origin?: ItemOrigin;
}

/** Where an item came from (`prop.origin`). Every field is optional; leave absent ones out. */
export interface ItemOrigin {
  /** The adventurer record id of who carried it (ETH-119). */
  by?: string;
  /** The run it came from: its number in the profile's history. */
  run?: number;
  /** Flavor text shown with the item. */
  note?: string;
}

/** What an actor carries and wears. */
export interface InventoryPart {
  /** Carried items, in the order they were picked up; stacks of one def merge. */
  items: ItemInstance[];
  /**
   * What it wears (ETH-043), one item (qty 1) per slot; an empty slot is left out, and so is the
   * whole field while nothing is worn. Worn items are not pack entries and don't count toward
   * the carried weight: pack indices, dropping, using and the Carry limit never see them.
   */
  equipped?: Partial<Record<EquipSlot, ItemInstance>>;
}

/** The def of an instance. Throws on an unknown id. */
export function itemDef(item: ItemInstance): ItemDef {
  return ITEMS.get(item.def);
}

/** How many of `def` fit in one stack. */
export function stackSize(def: ItemDef): number {
  return def.stack ?? 1;
}

/** A fresh instance of `defId`, `qty` of them. */
export function newItem(defId: string, qty = 1): ItemInstance {
  return { def: defId, qty };
}

/** Plain data as a string with object keys sorted, so key order never matters. */
function stableText(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );
}

/**
 * True if `a` and `b` may share a stack: the same def, stackable, and every other field allows
 * it. A field whose property kind `stacks: 'never'` keeps either item apart; any other field
 * (an `equal` kind, or one no kind owns) must be equal on both, absent matching only absent.
 */
export function canStack(a: ItemInstance, b: ItemInstance): boolean {
  if (a.def !== b.def || stackSize(itemDef(a)) <= 1) return false;
  // Unidentified potions and scrolls look alike whatever their blessing, so they share stacks (ETH-147).
  const secret = isSecretConsumable(a) && isSecretConsumable(b);
  const fa = a as unknown as Record<string, unknown>;
  const fb = b as unknown as Record<string, unknown>;
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (field === 'def' || field === 'qty') continue;
    if (secret && (field === 'blessing' || field === 'mix')) continue;
    const va = fa[field];
    const vb = fb[field];
    if (va === undefined && vb === undefined) continue;
    const kind = propertyKindFor(field);
    if (kind?.stacks === 'ignore') continue;
    if (kind?.stacks === 'never') return false;
    if (va === undefined || vb === undefined || stableText(va) !== stableText(vb)) return false;
  }
  return true;
}

/** Total weight of an instance: the def's weight times the quantity. */
export function itemWeight(item: ItemInstance): number {
  return itemDef(item).weight * item.qty;
}

/**
 * Splits `k` copies off `rest` in place and returns them as a new instance. A stack of unidentified
 * potions or scrolls splits its hidden blessing counts off the front of its groups (ETH-147).
 */
export function takePart(rest: ItemInstance, k: number): ItemInstance {
  const piece = clonePlain(rest);
  piece.qty = k;
  if (isSecretConsumable(rest)) {
    const counts = hiddenCounts(rest);
    const taken = takeInOrder(counts, k);
    setHiddenCounts(piece, taken);
    setHiddenCounts(rest, { plain: counts.plain - taken.plain, blessed: counts.blessed - taken.blessed, cursed: counts.cursed - taken.cursed });
  }
  rest.qty -= k;
  return piece;
}

/**
 * Adds `item` to `stacks` in place: first topping up stacks it can share (`canStack`), up to the
 * stack size, then as new entries at the end. `item` itself is never stored, only copies.
 */
export function addToStacks(stacks: ItemInstance[], item: ItemInstance): void {
  const size = stackSize(itemDef(item));
  const rest = clonePlain(item);
  for (const stack of stacks) {
    if (rest.qty === 0) break;
    if (!canStack(stack, rest) || stack.qty >= size) continue;
    const moved = Math.min(rest.qty, size - stack.qty);
    if (isSecretConsumable(stack) && isSecretConsumable(rest)) mergeHidden(stack, rest, moved);
    stack.qty += moved;
    // A flag only some of the merged items carry (`stacks: 'ignore'`) can't be claimed for all of them.
    for (const field of Object.keys(stack)) {
      if (propertyKindFor(field)?.stacks === 'ignore' && !Object.hasOwn(rest, field)) Reflect.deleteProperty(stack, field);
    }
    takePart(rest, moved);
  }
  while (rest.qty > 0) stacks.push(takePart(rest, Math.min(rest.qty, size)));
}

/** Why `item`'s def or quantity is wrong, or `null` if they are fine. Property fields: `propertyProblems`. */
export function instanceProblem(item: ItemInstance): string | null {
  if (typeof item.def !== 'string' || !ITEMS.has(item.def)) return `unknown item "${String(item.def)}"`;
  const size = stackSize(ITEMS.get(item.def));
  if (!Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > size) {
    return `"${item.def}" has quantity ${item.qty} (1 to ${size})`;
  }
  return null;
}
