/**
 * The party formation numbers (ETH-151, CLAUDE.md §5.2): how far a straggler may be from the
 * party's lead before the baseline walks it back (`leash`), and how close it walks back to
 * (`close`), in tiles with diagonals counting as one. `close` is smaller than `leash` on purpose:
 * the gap is a hysteresis band, so a member whose exploring pulls it back out past the leash
 * doesn't flip between regrouping and exploring every turn.
 *
 * The options themselves are in `tactics.ts` (Stick together is the default) and read these
 * numbers, so the descriptions and the rules can't drift apart. Stances scale them with
 * `leashPercent` (`stances.ts`). Values are first guesses, tuned in the M3 balance capstone.
 */

/** Stick together: the baseline's own cohesion since ETH-145. */
export const STICK_TOGETHER_LEASH = 8;
export const STICK_TOGETHER_CLOSE = 3;
/** Loose. */
export const LOOSE_LEASH = 14;
export const LOOSE_CLOSE = 6;
/** Spread out: about a third of a floor, so regrouping only happens when someone is truly lost. */
export const SPREAD_OUT_LEASH = 30;
export const SPREAD_OUT_CLOSE = 12;
