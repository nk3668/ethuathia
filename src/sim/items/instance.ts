/**
 * Item instances (ETH-061): one item, or a stack of identical ones, as plain data.
 *
 * An `ItemInstance` names its def and a quantity. Later features add optional fields to it
 * (ETH-043 where it is equipped, ETH-044 enchantment and identification, ETH-045 affixes, ETH-069
 * heirloom history); an instance without them is a plain one, so no save needs a migration when
 * a field arrives. Two instances stack only when every field but `qty` matches (`canStack`), so a
 * new field automatically keeps different items apart.
 *
 * The same shape is used everywhere an item can be: the `item` part of an entity lying on a
 * floor, an entry of an actor's `inventory`, a planned item in a floor plan.
 */
import { ITEMS } from '../../content';
import { clonePlain } from '../../core';
import type { EquipSlot, ItemDef } from '../../content';

/** One item or a stack of identical ones. Plain data; leave optional fields out rather than `undefined`. */
export interface ItemInstance {
  /** The item def's id, e.g. `item.mending_draught`. */
  def: string;
  /** How many, from 1 to the def's `stack` (default 1). */
  qty: number;
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

/** Every field but `qty`, as a comparable string. Keys are sorted, so field order never matters. */
function identity(item: ItemInstance): string {
  const rest: Record<string, unknown> = { ...item };
  delete rest.qty;
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
}

/** True if `a` and `b` may share a stack: the same def, stackable, and equal in every field but `qty`. */
export function canStack(a: ItemInstance, b: ItemInstance): boolean {
  return a.def === b.def && stackSize(itemDef(a)) > 1 && identity(a) === identity(b);
}

/** Total weight of an instance: the def's weight times the quantity. */
export function itemWeight(item: ItemInstance): number {
  return itemDef(item).weight * item.qty;
}

/**
 * Adds `item` to `stacks` in place: first topping up stacks it can share (`canStack`), up to the
 * stack size, then as new entries at the end. `item` itself is never stored, only copies.
 */
export function addToStacks(stacks: ItemInstance[], item: ItemInstance): void {
  const size = stackSize(itemDef(item));
  let left = item.qty;
  for (const stack of stacks) {
    if (left === 0) break;
    if (!canStack(stack, item) || stack.qty >= size) continue;
    const moved = Math.min(left, size - stack.qty);
    stack.qty += moved;
    left -= moved;
  }
  while (left > 0) {
    const qty = Math.min(left, size);
    stacks.push({ ...clonePlain(item), qty });
    left -= qty;
  }
}

/** Why `item` is not a valid instance, or `null` if it is. */
export function instanceProblem(item: ItemInstance): string | null {
  if (typeof item.def !== 'string' || !ITEMS.has(item.def)) return `unknown item "${String(item.def)}"`;
  const size = stackSize(ITEMS.get(item.def));
  if (!Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > size) {
    return `"${item.def}" has quantity ${item.qty} (1 to ${size})`;
  }
  return null;
}
