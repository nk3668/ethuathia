/**
 * Plain-text wording for the shell: content names, rule references and log lines. M1 replaces
 * the log wording with category filters and `Explain` links (docs/VISUAL-DESIGN.md §3.3).
 */
import type { EntityId, RuleRef, SimEvent } from '../../sim';

/**
 * A readable name for a content id until the content registry provides real ones (ETH-015):
 * the part after the last dot, capitalized. `class.vanguard` → `Vanguard`.
 */
export function contentName(id: string): string {
  const last = id.slice(id.lastIndexOf('.') + 1).replace(/[-_]/g, ' ');
  return last.charAt(0).toUpperCase() + last.slice(1);
}

/** `rule #3` for the adventurer's own rules, `baseline #2` for the built-in ones (1-based). */
export function ruleLabel(rule: RuleRef): string {
  return `${rule.set === 'own' ? 'rule' : 'baseline'} #${rule.index + 1}`;
}

/** Log categories (docs/VISUAL-DESIGN.md §2.3). */
export type LogCategory = 'combat' | 'loot' | 'discovery' | 'ai' | 'system';

/** Each category's prefix, so a line's category never rests on its color alone. */
export const LOG_PREFIX: Readonly<Record<LogCategory, string>> = {
  combat: '⚔',
  loot: '◆',
  discovery: '✦',
  ai: '➤',
  system: '·',
};

export interface LogLine {
  /** The event's sequence number in `simStore`, for list keys. */
  seq: number;
  turn: number;
  category: LogCategory;
  text: string;
}

/** Event types the log leaves out: the map shows them, and they happen every turn. */
const QUIET: ReadonlySet<SimEvent['type']> = new Set(['moved', 'waited']);

/**
 * The log's lines for a run of events, oldest first.
 *
 * - Moves and waits are left out.
 * - An AI decision is shown when an adventurer's goal changes: a `ruleFired` for the same rule
 *   and rule action as that adventurer's previous one is left out, since the engine traces
 *   every decision and most just continue the same goal.
 */
export function logLines(
  events: readonly { seq: number; event: SimEvent }[],
  nameOf: (id: EntityId) => string,
): LogLine[] {
  const goals = new Map<EntityId, string>();
  const lines: LogLine[] = [];
  for (const { seq, event } of events) {
    if (QUIET.has(event.type)) continue;
    if (event.type === 'ruleFired') {
      const goal = `${event.rule.set}:${event.rule.index}:${event.action}`;
      if (goals.get(event.actor) === goal) continue;
      goals.set(event.actor, goal);
    }
    if (event.type === 'stuck') goals.delete(event.actor);
    lines.push({ seq, turn: event.turn, ...describe(event, nameOf) });
  }
  return lines;
}

/** One event as a category and a sentence. */
export function describe(event: SimEvent, nameOf: (id: EntityId) => string): Pick<LogLine, 'category' | 'text'> {
  switch (event.type) {
    case 'moved':
      return { category: 'system', text: `${nameOf(event.actor)} moves.` };
    case 'waited':
      return { category: 'system', text: `${nameOf(event.actor)} waits.` };
    case 'doorOpened':
      return { category: 'discovery', text: `${nameOf(event.actor)} opens a door.` };
    case 'actionFailed':
      return { category: 'system', text: `${nameOf(event.actor)} can't ${event.action} (${event.reason})` };
    case 'ruleFired':
      return { category: 'ai', text: `${nameOf(event.actor)}: ${event.detail} (${ruleLabel(event.rule)})` };
    case 'stuck':
      return { category: 'ai', text: `${nameOf(event.actor)}: ${event.detail} (${ruleLabel(event.rule)})` };
    case 'commandRejected':
      return { category: 'system', text: `Command "${event.command}" ignored (${event.reason})` };
  }
}
