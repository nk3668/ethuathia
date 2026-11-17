/** Log wording for the core domain's events (`src/sim/coreEvents.ts`). */
import type { CoreEvent, RuleRef } from '../../../sim';
import type { LogTextRecord } from './types';

/** `rule #3` for the adventurer's own rules, `baseline #2` for the built-in ones (1-based). */
export function ruleLabel(rule: RuleRef): string {
  return `${rule.set === 'own' ? 'rule' : 'baseline'} #${rule.index + 1}`;
}

export const CORE_LOG_TEXT: LogTextRecord<CoreEvent> = {
  moved: { category: 'system', quiet: true, text: (e, nameOf) => `${nameOf(e.actor)} moves.` },
  waited: { category: 'system', quiet: true, text: (e, nameOf) => `${nameOf(e.actor)} waits.` },
  doorOpened: { category: 'discovery', text: (e, nameOf) => `${nameOf(e.actor)} opens a door.` },
  actionFailed: { category: 'system', text: (e, nameOf) => `${nameOf(e.actor)} can't ${e.action} (${e.reason})` },
  ruleFired: { category: 'ai', text: (e, nameOf) => `${nameOf(e.actor)}: ${e.detail} (${ruleLabel(e.rule)})` },
  stuck: { category: 'ai', text: (e, nameOf) => `${nameOf(e.actor)}: ${e.detail} (${ruleLabel(e.rule)})` },
  commandRejected: { category: 'system', text: (e) => `Command "${e.command}" ignored (${e.reason})` },
};
