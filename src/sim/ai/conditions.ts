/**
 * The core rule conditions: the "if" half of a rule (docs/ARCHITECTURE.md §4). Each is a
 * `ConditionDef`; rules name them by id. `domains.ts` registers `CORE_CONDITIONS` and every
 * domain's `conditions` in `CONDITIONS`. The Library (M3) unlocks them for the player's rules
 * editor, which is generated from that registry.
 */
import { RULE_ACTIONS } from '../registries';
import { defineCondition, noParams } from './types';
import type { ConditionDef } from './types';

/** Always true. The condition of rules that should run whenever their action can. */
export const COND_ALWAYS = defineCondition({
  id: 'cond.always',
  name: 'Always',
  description: 'Always true. The rule fires whenever its action can be done.',
  parse: noParams,
  evaluate: () => ({ ok: true, detail: '' }),
  describe: () => 'always',
});

/** True while a goal dropped by stuck detection is being skipped. */
export const COND_STUCK = defineCondition({
  id: 'cond.stuck',
  name: 'Recently stuck',
  description:
    'True for a while after the adventurer gave up on a goal because it stopped making progress: ' +
    'the adventurer had not moved and the party had not seen anything new for several turns.',
  parse: noParams,
  evaluate({ state, actor }) {
    const dropped = actor.ai.memory.dropped;
    if (dropped === null || state.turn >= dropped.until) return { ok: false, detail: '' };
    const what = RULE_ACTIONS.has(dropped.action) ? RULE_ACTIONS.get(dropped.action).name : dropped.action;
    const ago = state.turn - dropped.since;
    return { ok: true, detail: `gave up on ${what} ${ago} ${ago === 1 ? 'turn' : 'turns'} ago` };
  },
  describe: () => 'recently stuck',
});

/** The core conditions, in registration order. */
export const CORE_CONDITIONS: readonly ConditionDef[] = [COND_ALWAYS, COND_STUCK];
