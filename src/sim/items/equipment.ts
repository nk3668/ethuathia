/**
 * Equipment (ETH-043): what an actor wears, one item per slot (`EQUIP_SLOTS`), and how worn gear
 * changes its stats.
 *
 * - Worn items sit in `InventoryPart.equipped`, keyed by slot. They are not pack entries and
 *   don't count against the Carry limit.
 * - `SOURCE_EQUIPPED` is a `BundleSource`: every worn item's bundles (`gearBundles`) feed
 *   `getStat`, credited to the item's def (so a stat tooltip says "Iron hatchet +2"), and their
 *   triggers fire with `fireTrigger`. Taking an item off removes them with nothing else to undo.
 * - `compareGear` and `bestUpgrade` decide what a clear upgrade is, for the baseline's
 *   `act.equip_upgrade`: one that is at least as good in every stat and better in one. Anything
 *   with a tradeoff (or with triggers, whose worth the AI can't weigh) is left to the player's
 *   rules or to possession.
 * - A gear type may fit several slots (a ring fits either ring slot, ETH-111): `slotFor` picks
 *   where a piece goes when put on, `upgradeSlot` where it would be an upgrade.
 *
 * Enchantment (ETH-044) and affixes (ETH-045) add their bundles in `gearBundles`, so stats,
 * triggers and the upgrade comparison all pick them up.
 */
import { EQUIP_SLOTS, gearSlots } from '../../content';
import type { Bundle, EquipSlot, Modifier } from '../../content';
import type { Entity } from '../state';
import type { BundleSource } from '../stats/types';
import { isStatId, STAT_INFO } from '../stats/statIds';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';
import { inventoryOf } from './inventory';

/** One worn item and its slot. */
export interface WornItem {
  slot: EquipSlot;
  item: ItemInstance;
}

/** The item `entity` wears in `slot`, or `null`. Don't change the result. */
export function equippedIn(entity: Entity, slot: EquipSlot): ItemInstance | null {
  return entity.inventory?.equipped?.[slot] ?? null;
}

/** Everything `entity` wears, in `EQUIP_SLOTS` order. Don't change the items. */
export function wornItems(entity: Entity): WornItem[] {
  const equipped = entity.inventory?.equipped;
  if (equipped === undefined) return [];
  const out: WornItem[] = [];
  for (const slot of EQUIP_SLOTS) {
    const item = equipped[slot];
    if (item !== undefined) out.push({ slot, item });
  }
  return out;
}

/**
 * The bundles a worn item applies: its def's bundle, for now. ETH-044 (enchantment) and ETH-045
 * (affixes) add theirs here, which reaches stats, triggers and the AI's comparison at once.
 */
export function gearBundles(item: ItemInstance): Bundle[] {
  const bundle = itemDef(item).bundle;
  return bundle === undefined ? [] : [bundle];
}

/** Every worn item's bundles, credited to the item's def id, in slot order. */
export const SOURCE_EQUIPPED: BundleSource = {
  id: 'items.equipped',
  visit(_state, entity, visit) {
    for (const { item } of wornItems(entity)) {
      for (const bundle of gearBundles(item)) visit(bundle, item.def, 1);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Comparing gear

/** "Damage +2", "Evasion −1", "Speed ×1.1": one modifier in words. */
export function modifierText(m: Pick<Modifier, 'stat' | 'op' | 'value'>): string {
  const label = isStatId(m.stat) ? STAT_INFO[m.stat].label : m.stat;
  if (m.op === 'mul') return `${label} ×${m.value}`;
  return `${label} ${m.value < 0 ? '−' : '+'}${Math.abs(m.value)}`;
}

/** An item's stat changes, keyed `add:<stat>` / `mul:<stat>`; `null` if it has triggers or effects. */
function statTotals(item: ItemInstance | null): Map<string, number> | null {
  const totals = new Map<string, number>();
  if (item === null) return totals;
  for (const bundle of gearBundles(item)) {
    if ((bundle.triggers?.length ?? 0) > 0 || (bundle.effects?.length ?? 0) > 0) return null;
    for (const m of bundle.modifiers ?? []) {
      const key = `${m.op}:${m.stat}`;
      const before = totals.get(key) ?? (m.op === 'mul' ? 1 : 0);
      totals.set(key, m.op === 'mul' ? before * m.value : before + m.value);
    }
  }
  return totals;
}

/** How `a` compares with `b` as gear for one slot (either may be an empty slot, `null`). */
export type GearComparison = 'better' | 'worse' | 'same' | 'mixed';

/**
 * Compares two pieces of gear stat by stat: `better` if `a` is at least as good in every stat
 * and better in one, `worse` the other way round, `same` if equal, `mixed` for a tradeoff. Gear
 * with triggers is always `mixed` (against anything but nothing at all on both sides): the AI
 * can't tell whether a trigger helps. Every stat counts higher as better.
 */
export function compareGear(a: ItemInstance | null, b: ItemInstance | null): GearComparison {
  const ta = statTotals(a);
  const tb = statTotals(b);
  if (ta === null || tb === null) return 'mixed';
  let up = false;
  let down = false;
  for (const key of new Set([...ta.keys(), ...tb.keys()])) {
    const neutral = key.startsWith('mul:') ? 1 : 0;
    const va = ta.get(key) ?? neutral;
    const vb = tb.get(key) ?? neutral;
    if (va > vb) up = true;
    else if (va < vb) down = true;
  }
  if (up && down) return 'mixed';
  return up ? 'better' : down ? 'worse' : 'same';
}

/**
 * Where `item` goes when put on without naming a slot: the first of its slots that is empty,
 * otherwise its first slot. `null` if it can't be worn.
 */
export function slotFor(entity: Entity, item: ItemInstance): EquipSlot | null {
  const slots = gearSlots(itemDef(item));
  return slots.find((s) => equippedIn(entity, s) === null) ?? slots[0] ?? null;
}

/**
 * The slot where putting on `item` would be a clear upgrade, or `null`. An empty slot it fits
 * comes first (taken only if `item` beats wearing nothing there). With every slot it fits full
 * (two rings worn), it replaces a worn item it beats: the weaker of them when one beats the
 * other, else the first. The replaced item never beats the one left in the other slot, so the AI
 * never swaps back and forth.
 */
export function upgradeSlot(entity: Entity, item: ItemInstance): EquipSlot | null {
  const slots = gearSlots(itemDef(item));
  const empty = slots.find((s) => equippedIn(entity, s) === null);
  if (empty !== undefined) return compareGear(item, null) === 'better' ? empty : null;
  const beaten = slots.filter((s) => compareGear(item, equippedIn(entity, s)) === 'better');
  const weaker = beaten.find((s) => beaten.some((o) => o !== s && compareGear(equippedIn(entity, o), equippedIn(entity, s)) === 'better'));
  return weaker ?? beaten[0] ?? null;
}

/** A clear upgrade found in a pack: the pack index, its slot and what it would replace. */
export interface GearUpgrade {
  index: number;
  slot: EquipSlot;
  item: ItemInstance;
  replaces: ItemInstance | null;
}

/**
 * The clear upgrade to put on next: a pack item that is `better` (`compareGear`) than what is
 * worn where it would go (`upgradeSlot`). Slots are checked in `EQUIP_SLOTS` order; within a
 * slot the candidate no other candidate beats, the earliest in the pack on a tie. `null` if there
 * is none. Taking one never makes the item it replaced (or any other) an upgrade again, so the AI
 * never swaps back and forth.
 */
export function bestUpgrade(entity: Entity): GearUpgrade | null {
  const pack = inventoryOf(entity);
  const targets = pack.map((item) => upgradeSlot(entity, item));
  for (const slot of EQUIP_SLOTS) {
    const worn = equippedIn(entity, slot);
    const candidates: number[] = [];
    targets.forEach((target, index) => {
      if (target === slot) candidates.push(index);
    });
    const best = candidates.find((i) => !candidates.some((j) => compareGear(pack[j] as ItemInstance, pack[i] as ItemInstance) === 'better'));
    if (best !== undefined) return { index: best, slot, item: pack[best] as ItemInstance, replaces: worn };
  }
  return null;
}

/** "Damage +2, Accuracy +1": an item's stat modifiers in words, or `null` if it has none. */
export function gearStatsText(item: ItemInstance): string | null {
  const parts = gearBundles(item).flatMap((b) => (b.modifiers ?? []).map(modifierText));
  return parts.length === 0 ? null : parts.join(', ');
}
