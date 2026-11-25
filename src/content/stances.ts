/**
 * The party stances (ETH-071, CLAUDE.md §5.2): how the whole party approaches a floor. Steady, the
 * default, is in `tactics.ts` and changes nothing. Each stance below acts through rule rows and/or
 * stance parameters (`STANCE_PARAM_LIMITS`):
 *
 * - Rows name guarded conditions (`src/sim/ai/stanceRules.ts`): they are only true when the
 *   baseline has nothing urgent to do (no fight, no flight, no healing needed), because a stance's
 *   rows sit ahead of the whole baseline.
 * - Parameters replace a baseline constant (the flee thresholds, the pickup detour, the turn cap,
 *   the leash). A stance with no key plays the baseline's number.
 *
 * Every number is a named constant here, and each description reads from them, so the text and the
 * rules cannot drift apart. The values are first guesses for the smoke runs, to be tuned in the M3
 * balance capstone. Stances only change when the player picks one.
 */
import { defineTactic } from './tactics';

/** Cautious: the party turns for home once its living members' combined HP is below this percent. */
export const CAUTIOUS_WORN_PERCENT = 40;
/** Cautious: starts fleeing below this HP percent, and stops at `CAUTIOUS_FLEE_RELEASE`. */
export const CAUTIOUS_FLEE_BELOW = 50;
export const CAUTIOUS_FLEE_RELEASE = 75;
/** Cautious: tiles from the party's lead before walking back (the baseline's is 8). Until ETH-151 folds it into formation. */
export const CAUTIOUS_LEASH = 5;
/** Cautious, Delve and Reckless: tiles walked for an item (the baseline's is 8). */
export const HURRIED_PICKUP_DETOUR = 4;

/** Reckless: flees only below this HP percent, and stops at `RECKLESS_FLEE_RELEASE`. */
export const RECKLESS_FLEE_BELOW = 20;
export const RECKLESS_FLEE_RELEASE = 40;
/** Reckless: tiles from the lead before walking back. */
export const RECKLESS_LEASH = 14;
/** Reckless: descends once the stairs are known and this percent of the floor has been seen. */
export const RECKLESS_DESCEND_PERCENT = 60;

/** Delve: descends once the stairs are known and this percent of the floor has been seen. */
export const DELVE_DESCEND_PERCENT = 25;

/** Plunder: tiles walked for an item, and the share of the per-floor turn cap the party gets. */
export const PLUNDER_PICKUP_DETOUR = 40;
export const PLUNDER_FLOOR_CAP_PERCENT = 150;

export const STANCE_CAUTIOUS = defineTactic({
  id: 'tactic.cautious',
  name: 'Cautious',
  description:
    `Flees at ${CAUTIOUS_FLEE_BELOW}% HP and runs until ${CAUTIOUS_FLEE_RELEASE}%, stays within ${CAUTIOUS_LEASH} tiles of the party’s lead, ` +
    `and detours only ${HURRIED_PICKUP_DETOUR} steps for loot. When the party’s combined HP falls below ${CAUTIOUS_WORN_PERCENT}% with ` +
    'nothing in sight, everyone turns for home: the run ends as a retreat and the party keeps what it earned. ' +
    'Once the party turns for home it doesn’t turn back.',
  hint: 'Better to walk out alive than to be a hero.',
  tags: [],
  axis: 'stance',
  rows: [{ condition: { id: 'cond.party_worn', params: { percent: CAUTIOUS_WORN_PERCENT } }, action: { id: 'act.retreat_run' } }],
  params: { fleeBelow: CAUTIOUS_FLEE_BELOW, fleeRelease: CAUTIOUS_FLEE_RELEASE, pickupDetour: HURRIED_PICKUP_DETOUR, leash: CAUTIOUS_LEASH },
});

export const STANCE_RECKLESS = defineTactic({
  id: 'tactic.reckless',
  name: 'Reckless',
  description:
    `Walks up to every enemy in sight, flees only below ${RECKLESS_FLEE_BELOW}% HP (and stops at ${RECKLESS_FLEE_RELEASE}%), may drift ` +
    `${RECKLESS_LEASH} tiles from the party’s lead, and heads down once the stairs are known and ${RECKLESS_DESCEND_PERCENT}% of the ` +
    `floor has been seen. Loot is picked up only within ${HURRIED_PICKUP_DETOUR} steps.`,
  hint: 'Deeper, faster, and ask questions later.',
  tags: [],
  axis: 'stance',
  rows: [
    { condition: { id: 'cond.reckless_charge' }, action: { id: 'act.charge' } },
    { condition: { id: 'cond.delve_ready', params: { percent: RECKLESS_DESCEND_PERCENT } }, action: { id: 'act.descend' } },
    { condition: { id: 'cond.delve_ready', params: { percent: RECKLESS_DESCEND_PERCENT } }, action: { id: 'act.gather' } },
  ],
  params: { fleeBelow: RECKLESS_FLEE_BELOW, fleeRelease: RECKLESS_FLEE_RELEASE, pickupDetour: HURRIED_PICKUP_DETOUR, leash: RECKLESS_LEASH },
});

export const STANCE_DELVE = defineTactic({
  id: 'tactic.delve',
  name: 'Delve',
  description:
    `Heads for the stairs down as soon as they are known and ${DELVE_DESCEND_PERCENT}% of the floor has been seen, leaving the rest ` +
    `unexplored. Still fights, flees and picks up loot within ${HURRIED_PICKUP_DETOUR} steps, and still fetches a contract’s item once seen.`,
  hint: 'The stairs are the point; the rest is detail.',
  tags: [],
  axis: 'stance',
  rows: [
    { condition: { id: 'cond.delve_ready', params: { percent: DELVE_DESCEND_PERCENT } }, action: { id: 'act.descend' } },
    { condition: { id: 'cond.delve_ready', params: { percent: DELVE_DESCEND_PERCENT } }, action: { id: 'act.gather' } },
  ],
  params: { pickupDetour: HURRIED_PICKUP_DETOUR },
});

export const STANCE_PLUNDER = defineTactic({
  id: 'tactic.plunder',
  name: 'Plunder',
  description:
    `Clears every floor and detours up to ${PLUNDER_PICKUP_DETOUR} steps for loot, with ${PLUNDER_FLOOR_CAP_PERCENT}% of the usual ` +
    'turn limit per floor so a thorough sweep isn’t cut short. Never leaves a floor before it is explored.',
  hint: 'Leave nothing behind but footprints.',
  tags: [],
  axis: 'stance',
  params: { pickupDetour: PLUNDER_PICKUP_DETOUR, floorCapPercent: PLUNDER_FLOOR_CAP_PERCENT },
});

/** Head home now: the whole party climbs out and the run ends as a retreat. */
export const STANCE_FALL_BACK = defineTactic({
  id: 'tactic.fall_back',
  name: 'Fall back',
  description:
    'Head for the stairs up and out of the dungeon, whatever is left to explore, fighting off anything next to the party ' +
    'first. The run ends as a retreat: the party keeps everything it earned and every survivor returns to the roster. ' +
    'Once the party turns for home it doesn’t turn back.',
  hint: 'The order to stop pushing and bring everyone home.',
  tags: [],
  axis: 'stance',
  rows: [{ condition: { id: 'cond.fall_back_ready' }, action: { id: 'act.retreat_run' } }],
});
