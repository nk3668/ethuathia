/**
 * Selling carried items when the party leaves the dungeon (ETH-171, CLAUDE.md §3: "Gear does not
 * carry over"). On a victory or a retreat everything the living party members carry or wear is
 * sold for Trophies at its value; on a wipe nothing is sold and it is all lost.
 *
 * - `soldOnExit` is the one predicate that says whether an item is sold. Kit items (ETH-176) and
 *   items worth nothing (quest relics) and gold are not; heirlooms (M7) will be the next exception.
 * - The price is the def's base `value` per item: enchantment and affixes don't change it yet.
 */
import { ITEM_GOLD, itemValueToTrophies, VALUE_PER_TROPHY } from '../../content';
import type { RunOutcome } from '../run/result';
import type { RunState } from '../state';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';
import { isKitItem } from './kit';
import { inventoryOf } from './inventory';
import { wornItems } from './equipment';

/** The item sale recorded in `RunResult.extras['run.items']` (ETH-171). */
export interface ItemSaleRecord {
  /** How many items (counting each one in a stack) were sold, or lost on a wipe. */
  readonly items: number;
  /** Their summed base value. */
  readonly value: number;
  /** The Trophies it paid: `0` on a wipe. */
  readonly trophies: number;
  /** Value per Trophy (`VALUE_PER_TROPHY`). */
  readonly rate: number;
  /** The Smithy's trade bonus in percent (ETH-159), already in `trophies`; absent when there is none. */
  readonly bonus?: number;
}

/** The trade bonus (percent) the run's config carries (Smithy Smelting Pit, ETH-159): 0 when none. Not Omen-multiplied. */
export function tradeBonusOf(state: RunState): number {
  const bonus = state.config.tradeBonus;
  return typeof bonus === 'number' && Number.isFinite(bonus) && bonus > 0 ? bonus : 0;
}

/** True if `item` is sold for Trophies when the party leaves. The hook for later exceptions (heirlooms, M7). */
export function soldOnExit(item: ItemInstance): boolean {
  if (isKitItem(item)) return false;
  const def = itemDef(item);
  return def.id !== ITEM_GOLD.id && def.value > 0;
}

/**
 * What the party's items come to. `outcome` decides whose: the living members' on a victory or a
 * retreat (the fallen's items are lost with them), everyone's on a wipe, where it is the amount
 * lost and `trophies` is `0`. The Trophies are rounded down once, over the whole sum.
 */
export function itemSale(state: RunState, outcome: RunOutcome): ItemSaleRecord {
  const bonus = tradeBonusOf(state);
  let items = 0;
  let value = 0;
  for (const id of state.party) {
    const entity = state.entities[id];
    if (entity === undefined) continue;
    if (outcome !== 'wipe' && (entity.actor === undefined || entity.actor.hp <= 0)) continue;
    const carried = [...inventoryOf(entity), ...wornItems(entity).map((w) => w.item)];
    for (const item of carried) {
      if (!soldOnExit(item)) continue;
      items += item.qty;
      value += itemDef(item).value * item.qty;
    }
  }
  return { items, value, trophies: outcome === 'wipe' ? 0 : itemValueToTrophies(value, VALUE_PER_TROPHY, bonus), rate: VALUE_PER_TROPHY, ...(bonus > 0 ? { bonus } : {}) };
}
