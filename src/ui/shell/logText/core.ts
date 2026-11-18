/** Log wording for the core domain's events (`src/sim/coreEvents.ts`). */
import { FEATURE_DOOR } from '../../../content';
import type { CoreEvent, RuleRef } from '../../../sim';
import { defineHighlight, mention } from './types';
import type { LogTextRecord } from './types';

/** An adventurer made no progress and dropped its goal: often a sign of a bad rule or a blocked path. */
export const HIGHLIGHT_STUCK = defineHighlight({
  id: 'stuck',
  label: 'An adventurer gets stuck',
  description: 'An adventurer made no progress for several turns and gave up on its goal for a while.',
});

/** `rule #3` for the adventurer's own rules, `baseline #2` for the built-in ones (1-based). */
export function ruleLabel(rule: RuleRef): string {
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
  actionFailed: { category: 'system', text: (e, nameOf) => `${nameOf(e.actor)} can't ${e.action} (${e.reason})` },
  ruleFired: { category: 'ai', text: (e, nameOf) => `${nameOf(e.actor)}: ${e.detail} (${ruleLabel(e.rule)})` },
  stuck: { category: 'ai', highlight: HIGHLIGHT_STUCK, text: (e, nameOf) => `${nameOf(e.actor)}: ${e.detail} (${ruleLabel(e.rule)})` },
  commandRejected: { category: 'system', text: (e) => `Command "${e.command}" ignored (${e.reason})` },
};
