/**
 * The rest of the roles, ranges and focuses (ETH-193, CLAUDE.md §5.2). *Damage*, *Healer*, *Front
 * line*, *Back line*, *Weakest* and *Strongest* are in `tactics.ts`; this file adds the options
 * that need the new rule actions of `src/sim/ai/roleActions.ts` and `src/sim/combat/focus.ts`.
 *
 * Roles contribute rule rows. Ranges and focuses are parameters the combat actions read
 * (`engage` in `act.hold_range` and `act.approach_enemy`, `prefer` in `chooseTarget`).
 */
import { defineTactic } from './tactics';

export const ROLE_TANK = defineTactic({
  id: 'tactic.tank',
  name: 'Tank',
  description:
    'Holds the front: when an ally in sight is nearer an enemy than you are, steps up between the two so the ' +
    'blows land on you. With no ally ahead of you it fights as normal.',
  hint: 'The shield the others stand behind.',
  tags: [],
  axis: 'role',
  rows: [{ condition: { id: 'cond.ally_ahead' }, action: { id: 'act.guard_front' } }],
});

export const ROLE_SCOUT = defineTactic({
  id: 'tactic.scout',
  name: 'Scout',
  description:
    'Ranges ahead and keeps out of fights it can walk away from: backs away from enemies that are not yet next to ' +
    'it, and keeps exploring instead of falling back to the party, up to twice the formation’s leash from the ' +
    'lead. Cornered, or with an enemy next to it, it fights as normal.',
  hint: 'First to see the way, last to be caught.',
  tags: [],
  axis: 'role',
  rows: [
    { condition: { id: 'cond.enemy_visible' }, action: { id: 'act.avoid_fight' } },
    { condition: { id: 'cond.party_scattered' }, action: { id: 'act.scout_ahead' } },
  ],
});

export const RANGE_CLOSE_SUPPORT = defineTactic({
  id: 'tactic.close_support',
  name: 'Close support',
  description: 'Prefers to engage from two tiles back, one step behind whoever holds the front. With no one in front it fights up close.',
  hint: 'Fights over a friend’s shoulder.',
  tags: [],
  axis: 'range',
  params: { engage: 2 },
});

export const RANGE_KEEP_AWAY = defineTactic({
  id: 'tactic.keep_away',
  name: 'Keep away',
  description:
    'Prefers to engage from six tiles away, and steps back from an enemy another ally is already fighting. With no one in front ' +
    'it fights up close.',
  hint: 'Never within arm’s reach if someone else can take it.',
  tags: [],
  axis: 'range',
  params: { engage: 6 },
});

export const FOCUS_NEAREST = defineTactic({
  id: 'tactic.nearest',
  name: 'Nearest',
  description: 'Strikes the closest enemy, whatever its health.',
  hint: 'Whatever is in front of the blade.',
  tags: [],
  axis: 'focus',
  params: { prefer: 'nearest' },
});

export const FOCUS_CASTERS = defineTactic({
  id: 'tactic.casters',
  name: 'Casters',
  description:
    'Goes for enemies that attack from range or mend and spur on their kin. When none is in reach it strikes the weakest ' +
    'and says so in the log.',
  hint: 'Silence the one behind the line first.',
  tags: [],
  axis: 'focus',
  params: { prefer: 'casters' },
});

export const FOCUS_MELEE = defineTactic({
  id: 'tactic.melee',
  name: 'Melee',
  description: 'Goes for enemies that fight up close, leaving ranged ones for later. When none is in reach it strikes the weakest.',
  hint: 'Deal with the ones at the door first.',
  tags: [],
  axis: 'focus',
  params: { prefer: 'melee' },
});

export const FOCUS_RANGED = defineTactic({
  id: 'tactic.ranged',
  name: 'Ranged',
  description: 'Goes for enemies that attack from a distance. When none is in reach it strikes the weakest and says so.',
  hint: 'The archer comes before the axeman.',
  tags: [],
  axis: 'focus',
  params: { prefer: 'ranged' },
});

export const FOCUS_PROTECT_ALLIES = defineTactic({
  id: 'tactic.protect_allies',
  name: 'Protect allies',
  description:
    'Goes for whoever is hitting an ally: an enemy next to a party member, or one that struck one last turn. When nobody ' +
    'is, it strikes the weakest.',
  hint: 'Whoever lays a hand on a friend answers to you.',
  tags: [],
  axis: 'focus',
  params: { prefer: 'protect' },
});
