/**
 * Economy conversion constants and helpers (ETH-083).
 *
 * Leftover in-run gold is not at-risk currency: on victory or retreat it converts into Trophies at
 * `GOLD_PER_TROPHY` gold per Trophy (rounded down), applied after the Omen multiplier. On a wipe
 * all gold is lost.
 */

/** Number of leftover gold coins required per Trophy when the party exits the dungeon. */
export const GOLD_PER_TROPHY = 10;

/**
 * Converts leftover in-run `gold` into Trophies at `rate` gold per Trophy (rounded down).
 * Returns `0` for non-finite or non-positive `gold` (or invalid `rate`). `bonusPercent` (the Smithy's
 * trade bonus, ETH-159) adds that share before the one rounding down.
 */
export function goldToTrophies(gold: number, rate = GOLD_PER_TROPHY, bonusPercent = 0): number {
  if (!Number.isFinite(gold) || gold <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return bonusPercent > 0 ? Math.floor((gold * (100 + bonusPercent)) / (rate * 100)) : Math.floor(gold / rate);
}

/**
 * Total item value required per Trophy when the party exits the dungeon carrying gear (ETH-171).
 * The same rate as gold; ETH-161 tunes it.
 */
export const VALUE_PER_TROPHY = 10;

/**
 * Converts the summed item `value` into Trophies at `rate` value per Trophy (rounded down once,
 * over the sum). Returns `0` for non-finite or non-positive `value` (or invalid `rate`). `bonusPercent`
 * adds the Smithy's trade bonus (ETH-159) before the rounding.
 */
export function itemValueToTrophies(value: number, rate = VALUE_PER_TROPHY, bonusPercent = 0): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return bonusPercent > 0 ? Math.floor((value * (100 + bonusPercent)) / (rate * 100)) : Math.floor(value / rate);
}
