/**
 * The number combat actually uses for a stat (ETH-181). Attribute formulas make fractions
 * (ETH-177: Brawn 12 gives +1.8 damage), but a stat's total is rounded to a whole number and
 * clamped to its `STAT_INFO` range before anything reads it. `getStat` and `statValue` both end
 * here, and every display of a derived total (party card, Prepare preview, Codex) calls it too, so
 * what the player reads is what the sim uses.
 */
import { STAT_INFO } from './statIds';
import type { StatId } from './statIds';

/** `raw` (the unrounded total, (sum of adds) × (product of muls)) as combat uses it: rounded, then clamped. */
export function combatValue(stat: StatId, raw: number): number {
  const info = STAT_INFO[stat];
  const value = Math.max(info.min, Math.round(raw));
  return info.max === undefined ? value : Math.min(info.max, value);
}

/** A number for a tooltip: at most two decimals, so float noise like 2.4000000000000004 never shows. */
export function exactText(value: number): string {
  return String(Number(value.toFixed(2)));
}

/**
 * "1.8, rounded to 2 in combat" for a total that isn't already what combat uses, else just the
 * number ("2"). The tooltip line that goes with a whole-number display.
 */
export function roundedText(stat: StatId, raw: number): string {
  const used = combatValue(stat, raw);
  const exact = exactText(raw);
  return exact === String(used) ? exact : `${exact}, rounded to ${used} in combat`;
}
