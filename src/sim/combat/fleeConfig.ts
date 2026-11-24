/**
 * The tunable numbers behind fleeing (ETH-148), in a file of their own with no imports so the
 * combat rules and `threat.ts` can both read them at load time (ETH-080 tunes them).
 */

/** The HP percentage below which an adventurer with a threat in sight starts to flee. */
export const BASELINE_FLEE_PERCENT = 35;
/** Once fleeing, the HP percentage at which the adventurer stops (so it does not flip at the edge of the start threshold). */
export const FLEE_RELEASE_PERCENT = 60;
/** Turns without seeing a threat after which fleeing ends even if HP is still low. */
export const FLEE_CALM_TURNS = 12;
/** Turns a remembered threat sighting is kept (and avoided, fading). */
export const THREAT_MEMORY_TURNS = 60;
/** Tiles (either axis) around a remembered threat that cost extra to walk through while wounded. */
export const AVOID_RADIUS = 6;
/** The extra cost of the tile a remembered threat was last seen on, at the moment it was seen. */
export const AVOID_PENALTY = 24;
/** Decisions in a row an adventurer holds still, fleeing with nowhere left to run, before it gives up fleeing. */
export const FLEE_HOLD_TURNS = 12;
