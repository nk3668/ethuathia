/**
 * Field Salvage Kit (ETH-188): while the Smithy's opt-in node is switched on for a run
 * (`RunConfig.salvage`), an overloaded adventurer whose least valuable pack entry is plain, identified
 * gear breaks it down into scrap instead of dropping it. The scrap weighs nothing and is not an item:
 * it is a tally of value (`track.salvage`) that pays Trophies at the exit-sale rate
 * (`VALUE_PER_TROPHY`). Those Trophies join the run's at-risk total (a wipe loses its share like any
 * earning) but the Omen reward multiplier does not apply to them (`unmultiplied`, CLAUDE.md §3), so
 * hoarding loot can't inflate an Omen run.
 *
 * What can be salvaged is chosen only from what the party knows: the item must already be identified
 * and plain, never kit, never a clear upgrade for its wearer. An unidentified piece is never salvaged,
 * whether or not it rolled anything, so the choice can't reveal it (ETH-142).
 */
import { itemValueToTrophies, VALUE_PER_TROPHY } from '../../content';
import type { RunTracker } from '../domain';
import { TROPHIES } from '../run/result';
import type { Entity, RunState } from '../state';
import { upgradeSlot } from './equipment';
import { hasHiddenProperties, isGearDef, isItemIdentified } from './identify';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';
import { isKitItem } from './kit';

export const SALVAGE_TRACKER_ID = 'track.salvage';

/** State of `SALVAGE_TRACKER`: what has been salvaged this run. */
export interface SalvageTrackerState {
  /** Items broken down. */
  readonly items: number;
  /** Their summed base value. */
  readonly value: number;
}

/**
 * `track.salvage`: the scrap the party made, from `itemSalvaged` events. Its Trophies are
 * `itemValueToTrophies(value)` over the whole tally (rounded down once) and `unmultiplied`.
 */
export const SALVAGE_TRACKER: RunTracker<SalvageTrackerState> = {
  id: SALVAGE_TRACKER_ID,
  init: () => ({ items: 0, value: 0 }),
  reduce: (s, e) => (e.type === 'itemSalvaged' ? { items: s.items + e.qty, value: s.value + e.value } : s),
  rewards: (s) => ({ [TROPHIES]: itemValueToTrophies(s.value, VALUE_PER_TROPHY) }),
  unmultiplied: true,
};

/** What the party has salvaged so far this run, from `track.salvage`. */
export function runSalvage(state: RunState): SalvageTrackerState {
  const s = state.domains.run.trackers[SALVAGE_TRACKER_ID] as Partial<SalvageTrackerState> | undefined;
  return { items: typeof s?.items === 'number' ? s.items : 0, value: typeof s?.value === 'number' ? s.value : 0 };
}

/** True if the run has Field Salvage Kit switched on. */
export function salvageOn(state: RunState): boolean {
  return state.config.salvage === true;
}

/**
 * True if `item` may be broken down for `actor`: the kit is on, and it is weighty gear the party knows is
 * plain (identified, no enchantment, blessing or curse), not kit, not a clear upgrade for `actor`.
 */
export function canSalvage(state: RunState, actor: Entity, item: ItemInstance): boolean {
  if (!salvageOn(state)) return false;
  if (!isGearDef(item.def) || isKitItem(item)) return false;
  if (!isItemIdentified(state, item) || hasHiddenProperties(item)) return false;
  if (itemDef(item).weight <= 0) return false;
  return upgradeSlot(state, actor, item) === null;
}
