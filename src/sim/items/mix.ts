/**
 * Hidden blessings inside a stack of unidentified potions or scrolls (ETH-147).
 *
 * Every unidentified potion or scroll looks the same whatever its blessing, so copies stack
 * together and a stack can hold plain, blessed and cursed copies at once. Its state is one of:
 * - `blessing` unset and `mix` unset: every copy is plain.
 * - `blessing` set and `mix` unset: every copy has that blessing.
 * - `mix` set (`blessing` unset): per-blessing copy counts, at least two of them non-zero and
 *   summing to `qty`.
 * Nothing here reaches a snapshot, name, note or AI choice. Drawing a copy out of a mixed stack
 * uses the loot stream, so it is seeded and deterministic.
 */
import { ITEMS } from '../../content';
import type { ItemBlessing } from '../../content';
import type { Rng } from '../../core';
import type { ItemInstance } from './instance';

/** Copy counts per hidden blessing (`prop.mix`). Zero groups are left out. */
export interface ItemMix {
  plain?: number;
  blessed?: number;
  cursed?: number;
}

/** Copy counts per hidden blessing, all three present. */
export interface HiddenCounts {
  plain: number;
  blessed: number;
  cursed: number;
}

/** The groups in a fixed order. */
export const MIX_GROUPS = ['plain', 'blessed', 'cursed'] as const;
export type MixGroup = (typeof MIX_GROUPS)[number];

/** True if `item` is a potion or scroll that is still unidentified, so its blessing is hidden. */
export function isSecretConsumable(item: ItemInstance): boolean {
  if (item.identified !== false || !ITEMS.has(item.def)) return false;
  const category = ITEMS.get(item.def).category;
  return category === 'potion' || category === 'scroll';
}

/** How many copies of `item` have each blessing (all of them plain when it carries none). */
export function hiddenCounts(item: ItemInstance): HiddenCounts {
  if (item.mix !== undefined) return { plain: item.mix.plain ?? 0, blessed: item.mix.blessed ?? 0, cursed: item.mix.cursed ?? 0 };
  return {
    plain: item.blessing === undefined ? item.qty : 0,
    blessed: item.blessing === 'blessed' ? item.qty : 0,
    cursed: item.blessing === 'cursed' ? item.qty : 0,
  };
}

/** Sets `item`'s `blessing` and `mix` to the canonical form for `counts` (its `qty` is the caller's). */
export function setHiddenCounts(item: ItemInstance, counts: HiddenCounts): void {
  Reflect.deleteProperty(item, 'blessing');
  Reflect.deleteProperty(item, 'mix');
  const groups = MIX_GROUPS.filter((g) => counts[g] > 0);
  if (groups.length >= 2) {
    const mix: ItemMix = {};
    for (const g of groups) mix[g] = counts[g];
    item.mix = mix;
  } else if (groups[0] === 'blessed') item.blessing = 'blessed';
  else if (groups[0] === 'cursed') item.blessing = 'cursed';
}

/** The blessing of group `g` (`undefined` for plain). */
export function groupBlessing(g: MixGroup): ItemBlessing | undefined {
  return g === 'plain' ? undefined : g;
}

/** `n` copies off the front of `counts`, in group order. Deterministic, never random. */
export function takeInOrder(counts: HiddenCounts, n: number): HiddenCounts {
  const out: HiddenCounts = { plain: 0, blessed: 0, cursed: 0 };
  let left = n;
  for (const g of MIX_GROUPS) {
    const k = Math.min(left, counts[g]);
    out[g] = k;
    left -= k;
  }
  return out;
}

/**
 * Joins `moved` copies of `b` to stack `a` (both secret consumables): sums their hidden counts.
 * Call before `a.qty` changes. When only part of a mixed `b` moves (a stack-size overflow), the
 * copies come off the front of its groups; nothing observable depends on which.
 */
export function mergeHidden(a: ItemInstance, b: ItemInstance, moved: number): void {
  const x = hiddenCounts(a);
  const y = moved < b.qty ? takeInOrder(hiddenCounts(b), moved) : hiddenCounts(b);
  setHiddenCounts(a, { plain: x.plain + y.plain, blessed: x.blessed + y.blessed, cursed: x.cursed + y.cursed });
}

/** Draws `n` copies from `counts` without replacement, weighted by what is left. */
export function drawHidden(counts: HiddenCounts, n: number, rng: Rng): HiddenCounts {
  const left = { ...counts };
  const out: HiddenCounts = { plain: 0, blessed: 0, cursed: 0 };
  for (let i = 0; i < n; i++) {
    const total = left.plain + left.blessed + left.cursed;
    let roll = rng.int(0, total - 1);
    for (const g of MIX_GROUPS) {
      if (roll < left[g]) {
        left[g]--;
        out[g]++;
        break;
      }
      roll -= left[g];
    }
  }
  return out;
}
