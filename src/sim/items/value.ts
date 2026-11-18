/**
 * What an item is worth (ETH-061): the one scoring function every item decision uses (what to
 * pick up, what to drop first, later what a merchant pays and which heirloom a grave keeps).
 *
 * `unitValue` starts from the def's `value` and passes it through `ITEM_VALUE_HOOKS` in order.
 * Enchantment (ETH-044), affixes (ETH-045) and identification add a hook to that list here rather
 * than a second scoring function, so every caller picks the change up.
 */
import type { RunState } from '../state';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';

/** One adjustment to an item's worth. */
export interface ItemValueHook {
  /** Unique, e.g. `value.enchantment`. */
  readonly id: string;
  /** The worth of one of `item` after this hook, given the worth so far. Must not change anything. */
  adjust(state: RunState, item: ItemInstance, value: number): number;
}

/** The value hooks, in the order they apply. Later items add theirs here (enchantment, affixes). */
export const ITEM_VALUE_HOOKS: readonly ItemValueHook[] = [];

/** What one of `item` is worth: the def's `value`, then every hook. Never below 0. */
export function unitValue(state: RunState, item: ItemInstance): number {
  let value = itemDef(item).value;
  for (const hook of ITEM_VALUE_HOOKS) value = hook.adjust(state, item, value);
  return Math.max(0, value);
}

/** What the whole of `item` (every one in the stack) is worth. */
export function itemValue(state: RunState, item: ItemInstance): number {
  return unitValue(state, item) * item.qty;
}
