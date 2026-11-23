/**
 * Item identification and per-run generic appearances (ETH-044).
 *
 * - **Type-level identification:** potions, scrolls and jewelry (`APPEARANCE_CATEGORIES`) start
 *   hidden behind a deterministic per-seed appearance name (`appearanceName(seed, defId)`) until
 *   that def id is recorded in `state.domains.items.identifiedTypes`. Plain items created without
 *   `identified: false` (e.g. hand-built tests) count as already known.
 * - **Instance-level identification:** enchanted, blessed, or cursed items keep `identified: false`
 *   until identified by a Wits `identify` check on pickup, equipping, using, or a Scroll of Identify.
 *   Once a potion/scroll/jewelry type is in `identifiedTypes`, plain uncursed instances of that type
 *   are immediately known while blessed/cursed/enchanted ones reveal their base type and keep their
 *   extra properties hidden until instance-identified.
 */
import { APPEARANCE_POOLS, isAppearanceCategory, ITEMS } from '../../content';
import type { AppearanceCategory, ItemDef } from '../../content';
import { Rng } from '../../core';
import type { RunState } from '../state';
import type { ItemInstance } from './instance';

/** True if `def`'s base type is hidden behind a per-run generic appearance while unidentified. */
export function needsTypeId(def: ItemDef): boolean {
  return isAppearanceCategory(def.category);
}

/** True if `item` carries instance properties (`enchant`, `blessing`, `enchantments`) hidden until identified. */
export function hasHiddenProperties(item: ItemInstance): boolean {
  return item.enchant !== undefined || item.blessing !== undefined || (item.enchantments?.length ?? 0) > 0;
}

/** True if the party has identified item type `defId` this run (always true for weapons, armor, food, gold, relics, junk). */
export function isTypeIdentified(state: RunState, defId: string): boolean {
  if (!ITEMS.has(defId)) return true;
  return !needsTypeId(ITEMS.get(defId)) || state.domains.items.identifiedTypes.includes(defId);
}

/**
 * True if `item`'s base type is known: plain items (`identified !== false`), non-appearance
 * categories (weapons/armor), or types already learned in `identifiedTypes`.
 */
export function isInstanceTypeKnown(state: RunState, item: ItemInstance): boolean {
  return item.identified !== false || isTypeIdentified(state, item.def);
}

/**
 * True if `item` is fully known to the party (both its base type and any hidden properties).
 * Plain items (`identified !== false`) are always known; an unidentified instance with no hidden
 * properties becomes fully known as soon as its type is identified.
 */
export function isItemIdentified(state: RunState, item: ItemInstance): boolean {
  if (item.identified !== false) return true;
  if (!isTypeIdentified(state, item.def)) return false;
  return !hasHiddenProperties(item);
}

/** Records `defId` in `state.domains.items.identifiedTypes` (sorted, unique). Returns true if newly learned. */
export function identifyType(state: RunState, defId: string): boolean {
  if (!ITEMS.has(defId) || !needsTypeId(ITEMS.get(defId))) return false;
  const list = state.domains.items.identifiedTypes;
  if (list.includes(defId)) return false;
  list.push(defId);
  list.sort();
  return true;
}

/**
 * Marks `item` identified in place (clearing `identified: false` and recording its def in
 * `identifiedTypes` when applicable). Returns whether anything changed.
 */
export function identifyInstance(state: RunState, item: ItemInstance): { changed: boolean; typeNewlyKnown: boolean } {
  const wasKnown = isItemIdentified(state, item);
  const typeNewlyKnown = identifyType(state, item.def);
  let cleared = false;
  if (item.identified !== undefined) {
    Reflect.deleteProperty(item, 'identified');
    cleared = true;
  }
  return { changed: !wasKnown || typeNewlyKnown || cleared, typeNewlyKnown };
}

// ---------------------------------------------------------------------------------------------
// Deterministic per-seed generic appearances (no save bloat: derived purely from `state.seed`)

const appearanceCache = new Map<number, Map<string, string>>();
const MAX_CACHED_SEEDS = 64;

function buildAppearanceMap(seed: number): Map<string, string> {
  const map = new Map<string, string>();
  const categories: readonly AppearanceCategory[] = ['potion', 'scroll', 'jewelry'];
  for (const category of categories) {
    const defs = ITEMS.all().filter((d) => d.category === category);
    const pool = [...APPEARANCE_POOLS[category]];
    const rng = Rng.seeded(seed, `items/appearances/${category}`);
    // Fisher-Yates shuffle using the dedicated per-category seed.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = pool[i] as string;
      pool[i] = pool[j] as string;
      pool[j] = tmp;
    }
    defs.forEach((def, idx) => {
      const base = pool[idx % pool.length] ?? `Unidentified ${category}`;
      const suffix = idx >= pool.length ? ` #${Math.floor(idx / pool.length) + 1}` : '';
      map.set(def.id, `${base}${suffix}`);
    });
  }
  return map;
}

/**
 * The seeded generic appearance name for `defId` in a run with `seed` (e.g. `"Cloudy red vial"`
 * for an unidentified potion). Deterministic across save/load without storing appearances in state.
 */
export function appearanceName(seed: number, defId: string): string {
  let map = appearanceCache.get(seed);
  if (map === undefined) {
    if (appearanceCache.size >= MAX_CACHED_SEEDS) {
      const oldest = appearanceCache.keys().next().value;
      if (oldest !== undefined) appearanceCache.delete(oldest);
    }
    map = buildAppearanceMap(seed);
    appearanceCache.set(seed, map);
  }
  return map.get(defId) ?? (ITEMS.has(defId) ? `Unidentified ${ITEMS.get(defId).category}` : defId);
}
