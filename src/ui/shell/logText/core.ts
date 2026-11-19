/** Log wording for the core domain's events (`src/sim/coreEvents.ts`). */
import { FEATURE_DOOR } from '../../../content';
import type { CoreEvent, RuleRef } from '../../../sim';
import { defineHighlight, mention } from './types';
import { onFloor } from './types';
import type { LogTextRecord, MomentTextRecord } from './types';

/** An adventurer made no progress and dropped its goal: often a sign of a bad rule or a blocked path. */
export const HIGHLIGHT_STUCK = defineHighlight({
  id: 'stuck',
  label: 'An adventurer gets stuck',
  description: 'An adventurer made no progress for several turns and gave up on its goal for a while.',
});

/**
 * `rule #3` for the adventurer's own rules, `baseline #2` for the built-in ones (1-based), and
 * `player` for an action the player chose while possessing it (ETH-066).
 */
export function ruleLabel(rule: RuleRef): string {
  if (rule.set === 'player') return 'player';
  return `${rule.set === 'own' ? 'rule' : 'baseline'} #${rule.index + 1}`;
}

export const CORE_LOG_TEXT: LogTextRecord<CoreEvent> = {
  moved: { category: 'system', quiet: true, text: (e, nameOf) => `${nameOf(e.actor)} moves.` },
  waited: { category: 'system', quiet: true, text: (e, nameOf) => `${nameOf(e.actor)} waits.` },
  swapped: { category: 'system', text: (e, nameOf) => `${nameOf(e.actor)} squeezes past ${nameOf(e.other)}.` },
  doorOpened: {
    category: 'discovery',
    text: (e, nameOf) => [`${nameOf(e.actor)} opens a `, mention(FEATURE_DOOR.id, 'door'), '.'],
  },
  actionFailed: {
    category: 'system',
    // A possessed adventurer's movement key is a `bump` (ETH-066): say it in words.
    text: (e, nameOf) => `${nameOf(e.actor)} can't ${e.action === 'bump' ? 'go that way' : e.action} (${e.reason})`,
  },
  ruleFired: { category: 'ai', text: (e, nameOf) => `${nameOf(e.actor)}: ${e.detail} (${ruleLabel(e.rule)})` },
  stuck: { category: 'ai', highlight: HIGHLIGHT_STUCK, text: (e, nameOf) => `${nameOf(e.actor)}: ${e.detail} (${ruleLabel(e.rule)})` },
  possessed: {
    category: 'ai',
    text: (e, nameOf) => `You take control of ${nameOf(e.actor)}. Their turns now wait for your commands.`,
  },
  released: { category: 'ai', text: (e, nameOf) => `You release ${nameOf(e.actor)}; the AI takes over again.` },
  commandRejected: { category: 'system', text: (e) => `Command "${e.command}" ignored (${e.reason})` },
};

/** How the core chronicle moments read (ETH-120). */
export const CORE_MOMENT_TEXT: MomentTextRecord = {
  stuck: {
    kind: HIGHLIGHT_STUCK,
    category: 'ai',
    text: (m, nameOf) => `${nameOf(m.actors[0] ?? 0)} got stuck${onFloor(m.depth)} and gave up on a goal for a while.`,
  },
};
