/**
 * Equipment (ETH-043): what an actor wears, one item per slot (`EQUIP_SLOTS`), and how worn gear
 * changes its stats.
 *
 * - Worn items sit in `InventoryPart.equipped`, keyed by slot. They are not pack entries and
 *   don't count against the Carry limit.
 * - `SOURCE_EQUIPPED` is a `BundleSource`: every worn item's bundles (`gearBundles`: the def's,
 *   then each item property's, ETH-118) feed `getStat`, each credited to the item's def (so a stat
 *   tooltip says "Iron hatchet +2", one part per bundle), and their
 *   triggers fire with `fireTrigger`. Taking an item off removes them with nothing else to undo.
 * - `compareGear` and `bestUpgrade` decide what a clear upgrade is, for the baseline's
 *   `act.equip_upgrade`: one that is at least as good in every stat and better in one. Anything
 *   with a tradeoff (or with triggers, whose worth the AI can't weigh) is left to the player's
 *   rules or to possession.
 * - A gear type may fit several slots (a ring fits either ring slot, ETH-111): `slotFor` picks
 *   where a piece goes when put on, `upgradeSlot` where it would be an upgrade.
 *
 * Enchantment (ETH-044), affixes (ETH-045) and weapon scaling (ETH-082, a derived property in
 * `scaling.ts`) are item properties (`properties.ts`) with `bundles`, so stats, triggers and the
 * upgrade comparison all pick them up through `gearBundles` with no change here. Since weapon
 * scaling depends on the wielder, `compareGear` weighs a sword higher for a deft wielder than for
 * a strong one.
 */
import { baseEnchantmentFor, EQUIP_SLOT_INFO, EQUIP_SLOTS, gearSlots, hasEffectKind, ITEM_SCROLL_OF_IDENTIFY } from '../../content';
import type { Bundle, EquipSlot, Modifier } from '../../content';
import type { Entity, RunState } from '../state';
import { scaleModifier } from '../stats/getStat';
import type { BundleSource } from '../stats/types';
import { isStatId, STAT_INFO } from '../stats/statIds';
import { isCursed, isKnownCursed } from './enchant';
import { isInstanceTypeKnown, isItemIdentified } from './identify';
import { itemDef } from './instance';
import type { ItemInstance } from './instance';
import { inventoryOf } from './inventory';
import { hiddenGearMargin } from './hiddenValue';
import { itemName } from './name';
import { propertyBundleParts } from './properties';
import type { ItemBundle } from './properties';

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
 * The bundles `item` applies while `wearer` wears it: its def's bundle, then each item property's
 * `bundles` in `ITEM_PROPERTIES` order (ETH-118). `wearer` is who wears it or would (the AI
 * comparing gear); leave it out where there is no one (a Codex entry), and a property that
 * depends on the wearer (ETH-082 scaling) adds nothing.
 */
export function gearBundles(state: RunState, wearer: Entity | undefined, item: ItemInstance, knownOnly = false): Bundle[] {
  return gearBundleParts(state, wearer, item, knownOnly).map((p) => p.bundle);
}

/**
 * `gearBundles` with how `getStat` credits each one: a property's bundle may name another source
 * and a label (ETH-082's weapon scaling credits the wielder's attributes) and a `potency` (ETH-044).
 * When `knownOnly` is true, hidden properties (and unidentified jewelry base stats) are omitted.
 */
export function gearBundleParts(state: RunState, wearer: Entity | undefined, item: ItemInstance, knownOnly = false): ItemBundle[] {
  if (knownOnly && wearer !== undefined && !isInstanceTypeKnown(state, item)) return [];
  const bundle = itemDef(item).bundle;
  const own: ItemBundle[] = bundle === undefined ? [] : [{ bundle }];
  const ctx = wearer === undefined ? { state, item, ...(knownOnly ? { knownOnly: true } : {}) } : { state, item, wearer, ...(knownOnly ? { knownOnly: true } : {}) };
  return [...own, ...propertyBundleParts(ctx)];
}

/** Every worn item's bundles, credited to the item's def id (or the source a property names), in slot order. */
export const SOURCE_EQUIPPED: BundleSource = {
  id: 'items.equipped',
  visit(state, entity, visit) {
    for (const { item } of wornItems(entity)) {
      for (const part of gearBundleParts(state, entity, item)) {
        visit(part.bundle, part.source ?? item.def, part.potency ?? 1, part.label);
      }
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
function statTotals(state: RunState, wearer: Entity | undefined, item: ItemInstance | null, knownOnly = false): Map<string, number> | null {
  const totals = new Map<string, number>();
  if (item === null) return totals;
  for (const part of gearBundleParts(state, wearer, item, knownOnly)) {
    const bundle = part.bundle;
    if ((bundle.triggers?.length ?? 0) > 0 || (bundle.effects?.length ?? 0) > 0) return null;
    const potency = part.potency ?? 1;
    for (const m of bundle.modifiers ?? []) {
      const scaled = scaleModifier(m.op, m.value, potency);
      const key = `${m.op}:${m.stat}`;
      const before = totals.get(key) ?? (m.op === 'mul' ? 1 : 0);
      totals.set(key, m.op === 'mul' ? before * scaled : before + scaled);
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
 * can't tell whether a trigger helps. Every stat counts higher as better. Both are weighed as
 * `wearer` would wear them (`gearBundles`), item properties included. When `knownOnly` is true,
 * unidentified hidden properties are ignored so the AI doesn't peek.
 */
export function compareGear(
  state: RunState,
  wearer: Entity | undefined,
  a: ItemInstance | null,
  b: ItemInstance | null,
  knownOnly = false,
): GearComparison {
  const ta = statTotals(state, wearer, a, knownOnly);
  const tb = statTotals(state, wearer, b, knownOnly);
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
 * otherwise the first uncursed slot it fits, otherwise its first slot. `null` if it can't be worn.
 */
export function slotFor(entity: Entity, item: ItemInstance): EquipSlot | null {
  const slots = gearSlots(itemDef(item));
  return (
    slots.find((s) => equippedIn(entity, s) === null) ??
    slots.find((s) => !isCursed(equippedIn(entity, s))) ??
    slots[0] ??
    null
  );
}

/**
 * The slot where putting on `item` would be a clear upgrade, or `null`. Known-cursed items are
 * never chosen, and slots holding cursed gear cannot be replaced (ETH-044). Uses `knownOnly` so
 * the AI compares only known stats.
 */
export function upgradeSlot(state: RunState, entity: Entity, item: ItemInstance): EquipSlot | null {
  return evaluateUpgrade(state, entity, item).slot;
}

/** What the baseline decided about putting `item` on (ETH-142): where, and why it did or didn't. */
export interface UpgradeVerdict {
  /** The slot it would go in, or `null` if it won't be put on. */
  slot: EquipSlot | null;
  /** Why an item that looks better was held back (a locked slot, an unidentified item not worth the risk, a pending identify). Stable while nothing changes. */
  held?: string;
  /** For an unidentified item put on anyway: the numbers it beat. */
  gate?: string;
}

/** `1.04`, `0.9`, `2`: a number to at most two decimals, without trailing zeros. */
function fmt(n: number): string {
  return String(Number(n.toFixed(2)));
}

/** True if `entity` carries a Scroll of Identify whose type is known: it can identify before it equips. */
function canIdentifyFirst(state: RunState, entity: Entity): boolean {
  return inventoryOf(entity).some((it) => isInstanceTypeKnown(state, it) && hasEffectKind(itemDef(it), 'identify'));
}

/**
 * Total change in known `add` stats from swapping `worn` for `item`, in enhancement points of the def's
 * base enchantment (one point is what one level of it adds), so a gain of +2 Damage on a weapon is 2 points.
 * Only stats the party can see count; a better item only gains, so the changes just add up.
 */
function knownGainPoints(state: RunState, entity: Entity, item: ItemInstance, worn: ItemInstance | null): number {
  const mod = baseEnchantmentFor(itemDef(item))?.bundle.modifiers?.[0];
  if (mod === undefined || mod.op !== 'add' || mod.value === 0) return 0;
  const now = statTotals(state, entity, worn, true);
  const next = statTotals(state, entity, item, true);
  if (now === null || next === null) return 0;
  let sum = 0;
  for (const key of new Set([...now.keys(), ...next.keys()])) {
    if (key.startsWith('add:')) sum += (next.get(key) ?? 0) - (now.get(key) ?? 0);
  }
  return sum / Math.abs(mod.value);
}

/**
 * `upgradeSlot` with its reasons (ETH-142). Known-cursed items and cursed slots are skipped as
 * before. An item that is not identified yet is put on only if the party cannot identify it first
 * and its gain in base stats beats `hiddenGearMargin` for the floor's depth: the expected value of
 * what it may be hiding plus a premium for the cursed slot lock. Everything here reads known stats
 * and the def and depth only, never the hidden properties.
 */
export function evaluateUpgrade(state: RunState, entity: Entity, item: ItemInstance): UpgradeVerdict {
  if (isKnownCursed(state, item)) return { slot: null };
  const def = itemDef(item);
  const cmp = (a: ItemInstance | null, b: ItemInstance | null) => compareGear(state, entity, a, b, true);
  const all = gearSlots(def);
  const slots = all.filter((s) => !isCursed(equippedIn(entity, s)));
  if (slots.length === 0) {
    const locked = all.find((s) => cmp(item, equippedIn(entity, s)) === 'better');
    if (locked === undefined) return { slot: null };
    const worn = equippedIn(entity, locked) as ItemInstance;
    return {
      slot: null,
      held: `the ${itemName(state, item, entity)} would be better, but the ${EQUIP_SLOT_INFO[locked].label.toLowerCase()} slot is locked by the cursed ${itemName(state, worn, entity)} (a Scroll of Uncursing frees it)`,
    };
  }
  const empty = slots.find((s) => equippedIn(entity, s) === null);
  let slot: EquipSlot | null;
  if (empty !== undefined) {
    slot = cmp(item, null) === 'better' ? empty : null;
  } else {
    const beaten = slots.filter((s) => cmp(item, equippedIn(entity, s)) === 'better');
    slot = beaten.find((s) => beaten.some((o) => o !== s && cmp(equippedIn(entity, o), equippedIn(entity, s)) === 'better')) ?? beaten[0] ?? null;
  }
  if (slot === null || isItemIdentified(state, item)) return { slot };

  const name = itemName(state, item, entity);
  if (canIdentifyFirst(state, entity)) return { slot: null, held: `the ${name} can wait: a ${ITEM_SCROLL_OF_IDENTIFY.name} will name it first` };
  const gain = knownGainPoints(state, entity, item, equippedIn(entity, slot));
  const { expected, curseRisk, margin } = hiddenGearMargin(def, floorDepth(state, entity));
  const numbers = `gain +${fmt(gain)} vs margin ${fmt(margin)} (expected hidden ${expected < 0 ? '' : '+'}${fmt(expected)}, curse lock risk +${fmt(curseRisk)})`;
  if (gain <= margin) return { slot: null, held: `the unidentified ${name} isn't worth the risk: ${numbers}` };
  return { slot, gate: `unidentified, but ${numbers}` };
}

/** The depth number of the floor `entity` is on (1 is the first floor): what the party can count, not the hidden dungeon depth. */
function floorDepth(state: RunState, entity: Entity): number {
  return state.dungeon.nodes[entity.floor]?.depth ?? 1;
}

/** The reasons items in `entity`'s pack that look like upgrades are being held back, without repeats (ETH-142). */
export function heldUpgradeNotes(state: RunState, entity: Entity): string[] {
  const notes: string[] = [];
  for (const item of inventoryOf(entity)) {
    const held = evaluateUpgrade(state, entity, item).held;
    if (held !== undefined && !notes.includes(held)) notes.push(held);
  }
  return notes;
}

/** A clear upgrade found in a pack: the pack index, its slot and what it would replace. */
export interface GearUpgrade {
  index: number;
  slot: EquipSlot;
  item: ItemInstance;
  replaces: ItemInstance | null;
  /** For an unidentified item put on anyway: the numbers it beat (ETH-142). */
  gate?: string;
}

/**
 * The clear upgrade to put on next: a pack item that is `better` (`compareGear`) than what is
 * worn where it would go (`upgradeSlot`). Slots are checked in `EQUIP_SLOTS` order; within a
 * slot the candidate no other candidate beats, the earliest in the pack on a tie. `null` if there
 * is none. Taking one never makes the item it replaced (or any other) an upgrade again, so the AI
 * never swaps back and forth.
 */
export function bestUpgrade(state: RunState, entity: Entity): GearUpgrade | null {
  const pack = inventoryOf(entity);
  const targets = pack.map((item) => upgradeSlot(state, entity, item));
  for (const slot of EQUIP_SLOTS) {
    const worn = equippedIn(entity, slot);
    const candidates: number[] = [];
    targets.forEach((target, index) => {
      if (target === slot) candidates.push(index);
    });
    const best = candidates.find((i) => !candidates.some((j) => compareGear(state, entity, pack[j] as ItemInstance, pack[i] as ItemInstance, true) === 'better'));
    if (best !== undefined) {
      const item = pack[best] as ItemInstance;
      const gate = evaluateUpgrade(state, entity, item).gate;
      return { index: best, slot, item, replaces: worn, ...(gate === undefined ? {} : { gate }) };
    }
  }
  return null;
}

/**
 * "Damage +2, Accuracy +1": an item's stat modifiers (as `wearer` would wear it) in words, or
 * `null` if it has none. Modifiers of one stat and op are summed into one (weapon scaling's
 * parts net into the damage, ETH-082), and one that sums to nothing is left out.
 */
export function gearStatsText(state: RunState, wearer: Entity | undefined, item: ItemInstance, knownOnly = false): string | null {
  const totals = new Map<string, Pick<Modifier, 'stat' | 'op' | 'value'>>();
  for (const part of gearBundleParts(state, wearer, item, knownOnly)) {
    const potency = part.potency ?? 1;
    for (const m of part.bundle.modifiers ?? []) {
      const scaled = scaleModifier(m.op, m.value, potency);
      const key = `${m.op}:${m.stat}`;
      const before = totals.get(key);
      const value = before === undefined ? scaled : m.op === 'mul' ? before.value * scaled : before.value + scaled;
      totals.set(key, { stat: m.stat, op: m.op, value });
    }
  }
  const parts = [...totals.values()].filter((m) => m.value !== (m.op === 'mul' ? 1 : 0)).map(modifierText);
  return parts.length === 0 ? null : parts.join(', ');
}

/** "Damage +2, Accuracy +1": the stat modifiers of `bundles` in words, or `null` if there are none. The Codex uses it on a def's bundle. */
export function bundleStatsText(bundles: readonly Bundle[]): string | null {
  const parts = bundles.flatMap((b) => (b.modifiers ?? []).map(modifierText));
  return parts.length === 0 ? null : parts.join(', ');
}
