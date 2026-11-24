/**
 * What unidentified gear may be hiding, worked out from the loot roll chances (ETH-142).
 *
 * The baseline AI weighs unidentified gear against `hiddenGearMargin(def, depth)`: the expected
 * value of the properties `rollItemProperties` (`loot.ts`) may have rolled, plus a premium for the
 * rest-of-run slot lock of a curse. It depends only on the def and the depth, never on what a
 * particular item rolled. The tunables ETH-080 reviews are `LOOT_CURSE_CHANCE`, `CURSED_MILD_CHANCE`
 * (the cursed enchantment range, -1 or -2), the cursed `gearDelta` and `CURSE_LOCK_PREMIUM`.
 */
import { baseEnchantmentFor, BLESSING_INFO, specialEnchantmentsFor } from '../../content';
import type { ItemDef } from '../../content';
import {
  BLESSED_ENCHANT_CHANCE,
  CURSED_MILD_CHANCE,
  ENCHANT_MILD_CHANCE,
  LOOT_BLESS_CHANCE,
  LOOT_CURSE_CHANCE,
  LOOT_ENCHANT_CHANCE,
  LOOT_SPECIAL_BASE_CHANCE,
  LOOT_SPECIAL_MAX_CHANCE,
  LOOT_SPECIAL_PER_DEPTH,
} from './loot';

/**
 * Prices the rest-of-run slot lock of a curse (ETH-142). Cursed gear cannot be removed or
 * replaced unless a Scroll of Uncursing turns up, which costs more than the points it starts
 * with. The baseline AI puts on unidentified gear only when its known gain beats the expected
 * hidden value plus `CURSE_LOCK_PREMIUM × P(cursed) × expected curse penalty`.
 */
export const CURSE_LOCK_PREMIUM = 4;

/** What the baseline weighs before putting on unidentified gear, in enhancement points of the def's base enchantment. */
export interface HiddenGearMargin {
  /** Expected value of the hidden properties (blessing, enchantment, specials); may be negative. */
  expected: number;
  /** `CURSE_LOCK_PREMIUM × P(cursed) × expected curse penalty`: the rest-of-run slot lock, priced. */
  curseRisk: number;
  /** `max(expected, 0) + curseRisk`: the gain base stats must beat. */
  margin: number;
}

/**
 * The margin unidentified `def` gear at `depth` has to beat (ETH-142), computed from the roll
 * chances in `rollItemProperties` rather than written down: it enumerates the same distribution.
 * It depends only on the def and the depth, never on what a particular item rolled. Specials are
 * converted to enhancement points through `valuePerLevel` ratios.
 */
export function hiddenGearMargin(def: ItemDef, depth: number): HiddenGearMargin {
  const base = baseEnchantmentFor(def);
  if (base === undefined || def.gear === undefined) return { expected: 0, curseRisk: 0, margin: 0 };
  const cap = Math.min(base.maxLevel, depth >= 6 ? 3 : depth >= 3 ? 2 : 1);
  const meanEnchant = cap <= 1 ? 1 : ENCHANT_MILD_CHANCE + (1 - ENCHANT_MILD_CHANCE) * ((2 + cap) / 2);
  const pBlessedEnchant = BLESSED_ENCHANT_CHANCE + (1 - BLESSED_ENCHANT_CHANCE) * LOOT_ENCHANT_CHANCE;
  const cursedEnchant = CURSED_MILD_CHANCE * -1 + (1 - CURSED_MILD_CHANCE) * -2;
  const cursePenalty = -(cursedEnchant + BLESSING_INFO.cursed.gearDelta);
  let expected =
    LOOT_BLESS_CHANCE * (pBlessedEnchant * meanEnchant + BLESSING_INFO.blessed.gearDelta) -
    LOOT_CURSE_CHANCE * cursePenalty +
    (1 - LOOT_BLESS_CHANCE - LOOT_CURSE_CHANCE) * LOOT_ENCHANT_CHANCE * meanEnchant;
  const specials = specialEnchantmentsFor(def, depth);
  if (specials.length > 0 && base.valuePerLevel > 0) {
    const chance = Math.min(LOOT_SPECIAL_MAX_CHANCE, LOOT_SPECIAL_BASE_CHANCE + Math.max(0, depth - 2) * LOOT_SPECIAL_PER_DEPTH);
    const total = specials.reduce((n, e) => n + e.weight, 0);
    let points = 0;
    for (const e of specials) {
      const meanLevel = e.maxLevel >= 2 && depth >= 5 ? 0.75 * e.minLevel + 0.25 * 2 : e.minLevel;
      points += (e.weight / total) * ((meanLevel * e.valuePerLevel) / base.valuePerLevel);
    }
    expected += chance * points;
  }
  const curseRisk = CURSE_LOCK_PREMIUM * LOOT_CURSE_CHANCE * cursePenalty;
  return { expected, curseRisk, margin: Math.max(expected, 0) + curseRisk };
}
