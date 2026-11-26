/**
 * The habits (ETH-194, CLAUDE.md §5.2): small behaviors an adventurer stacks, limited by habit
 * slots (`habitSlots`, the Guild Hall's Habit Tutor; 1 to start). A habit is either **rule rows**
 * (condition -> action, checked ahead of the baseline in pick order) or a **parameter** the
 * baseline reads (`healBelow`, see `src/sim/ai/habitParams.ts`), never both.
 *
 * Every habit is neutral when it has nothing to act on: its action says so in the trace and the
 * baseline carries on. Their conditions and actions are in `src/sim/combat/habitRules.ts` and
 * `src/sim/items/habitRules.ts`. *Softens targets* comes with the first debuff sources (ETH-195),
 * *Ambusher* with sleeping monsters (ETH-097) and *Secret seeker* with secrets (M8).
 */
import { defineTactic } from './tactics';

/** Quaff healing at 60% rather than 35%. Exclusive with Sparing with potions. */
export const HABIT_QUICK_TO_QUAFF = defineTactic({
  id: 'tactic.quick_to_quaff',
  name: 'Quick to quaff',
  description:
    'Drinks the best healing it carries as soon as HP drops below 60%, rather than waiting for the usual 35%. ' +
    'Can’t be taken with Sparing with potions.',
  hint: 'Never lets the wounds pile up.',
  tags: [],
  axis: 'habit',
  params: { healBelow: 60 },
  exclusiveWith: ['tactic.sparing_with_potions'],
});

/** Quaff healing only at 20%. Exclusive with Quick to quaff. */
export const HABIT_SPARING_WITH_POTIONS = defineTactic({
  id: 'tactic.sparing_with_potions',
  name: 'Sparing with potions',
  description:
    'Saves its healing for real danger: drinks it only once HP drops below 20%, rather than the usual 35%. ' +
    'Can’t be taken with Quick to quaff.',
  hint: 'Potions are for the last moment.',
  tags: [],
  axis: 'habit',
  params: { healBelow: 20 },
  exclusiveWith: ['tactic.quick_to_quaff'],
});

export const HABIT_TREASURE_HUNTER = defineTactic({
  id: 'tactic.treasure_hunter',
  name: 'Treasure hunter',
  description:
    'Goes out of its way for loot: walks up to 30 steps (the usual is 8) to an item it has seen and wants, while no enemy ' +
    'is in sight and nothing more urgent is going on. Leaves junk and corpses alone.',
  hint: 'Can smell a coin through a wall.',
  tags: [],
  axis: 'habit',
  rows: [{ condition: { id: 'cond.calm' }, action: { id: 'act.pick_up', params: { maxDetour: 30 } } }],
});

export const HABIT_AVOIDS_COMBAT = defineTactic({
  id: 'tactic.avoids_combat',
  name: 'Avoids combat',
  description:
    'Steers clear of fights it can: backs away from an enemy that is not yet next to it while an ally nearer the enemy is ' +
    'already fighting. Cornered, alone, or with an enemy next to it, it fights as normal. Can’t be taken with Finisher.',
  hint: 'Somebody else can be the hero today.',
  tags: [],
  axis: 'habit',
  rows: [{ condition: { id: 'cond.enemy_visible' }, action: { id: 'act.avoid_fight' } }],
  exclusiveWith: ['tactic.finisher'],
});

export const HABIT_FINISHER = defineTactic({
  id: 'tactic.finisher',
  name: 'Finisher',
  description:
    'Goes for the kill: with nothing next to it, walks up to a wounded enemy (35% HP or less) within 6 tiles to finish it. ' +
    'Can’t be taken with Avoids combat.',
  hint: 'Smells blood and does not let it go.',
  tags: [],
  axis: 'habit',
  rows: [{ condition: { id: 'cond.finisher_target' }, action: { id: 'act.finish_wounded' } }],
  exclusiveWith: ['tactic.avoids_combat'],
});

export const HABIT_BODYGUARD = defineTactic({
  id: 'tactic.bodyguard',
  name: 'Bodyguard',
  description:
    'Stays near the party’s Healer: when the Healer is more than 3 tiles away and nothing is next to it, walks back to ' +
    'them. With no Healer in the party it does nothing.',
  hint: 'Whoever keeps the others alive needs keeping alive too.',
  tags: [],
  axis: 'habit',
  rows: [{ condition: { id: 'cond.healer_far' }, action: { id: 'act.stay_by_healer' } }],
});

export const HABIT_CURIOUS = defineTactic({
  id: 'tactic.curious',
  name: 'Curious',
  description:
    'Tests unknown potions when it is calm: with no enemy in sight, at 70% HP or more and a known way out, drinks a potion ' +
    'whose type it does not know yet, to learn what it is. It may drink something harmful.',
  hint: 'Never met a mystery it could leave corked.',
  tags: [],
  axis: 'habit',
  rows: [{ condition: { id: 'cond.curious_ready' }, action: { id: 'act.test_unknown' } }],
});
