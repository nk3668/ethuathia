/**
 * The wipe loss (ETH-023, CLAUDE.md §3 "Banked vs. at-risk currency"): what a run earns stays at
 * risk until it ends. A victory or a retreat banks all of it; a wipe loses `WIPE_LOSS_SHARE` of
 * each currency and banks the rest, rounded down in the player's disfavor (75% kept, rounded down).
 *
 * Order (docs/ARCHITECTURE.md, Contracts, "Rewards"): base earnings → ×Omen multiplier → −25%.
 * The multiplier (ETH-067) belongs in `rewards.atRisk` itself, so the amounts handed to
 * `wipeLoss` are already multiplied. Until Omens exist the multiplier is 1.
 */
import type { RewardAmounts, RunOutcome } from './result';

/** The share of each at-risk currency a wipe loses. Final (Nate, 2026-11-18), but kept in one place. */
export const WIPE_LOSS_SHARE = 0.25;

/** The amount of `atRisk` (one currency) that survives a wipe: 75%, rounded down. */
export function keptAfterWipe(atRisk: number): number {
  // The small epsilon guards against `x.9999…` from a share that isn't a binary fraction.
  return Math.max(0, Math.floor(atRisk * (1 - WIPE_LOSS_SHARE) + 1e-9));
}

/**
 * What a run ending in `outcome` loses from `atRisk`, per currency: the wipe share on a wipe,
 * nothing otherwise. Never more than `atRisk`; currencies that lose nothing are left out.
 */
export function wipeLoss(atRisk: Readonly<RewardAmounts>, outcome: RunOutcome): RewardAmounts {
  const lost: RewardAmounts = {};
  if (outcome !== 'wipe') return lost;
  for (const [currency, amount] of Object.entries(atRisk)) {
    const gone = amount - keptAfterWipe(amount);
    if (gone > 0) lost[currency] = gone;
  }
  return lost;
}
