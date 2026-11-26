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

/** Flee episodes without recovering (HP back to `FLEE_RELEASE_PERCENT`) that make a flee/return cycle (ETH-189). */
export const FLEE_CYCLE_LIMIT = 3;
/** Turns between one flee starting and the next for them to count as the same cycle (ETH-189). */
export const FLEE_CYCLE_WINDOW = 150;
/** How close (tiles, either axis) one flight starts to the last for them to count as the same cycle: a loop returns to the same spot (ETH-189). */
export const FLEE_CYCLE_RADIUS = 8;
/** Flights in one cycle, rest or no rest, after which the cycle is hopeless and the foe's surroundings become off-limits (ETH-189). */
export const FLEE_CYCLE_GIVE_UP = 8;
/** Rests that ended without HP coming back, after which the cycle is hopeless (ETH-189). */
export const FLEE_REST_GIVE_UP = 2;
/** Tiles (either axis) around the foe a hopeless cycle keeps fleeing that exploring and descending treat as off-limits (ETH-189). */
export const FLEE_BLOCK_RADIUS = 6;
/** HP percentage a hopeless cycle rests back up to before the foe's area is tried again: more than a normal release, since that one failed (ETH-189). */
export const FLEE_HOPELESS_RECOVER_PERCENT = 90;
/** The longest a cycle-breaking rest lasts, in turns: about 40 HP at `RECOVERY_INTERVAL` (ETH-189). */
export const FLEE_REST_TURNS = 500;

/** How much worse (in flee-map cost) an escape step may be than the best one and still count as "otherwise equal", so allies and the stairs up can break the tie (ETH-154). */
export const ESCAPE_TIE_MARGIN = 2;
/** How close (tiles, either axis) a remembered threat must be to a way forward for it to count as guarded; the same reach as the wounded route penalty (ETH-154). */
export const GUARDED_RADIUS = AVOID_RADIUS;
