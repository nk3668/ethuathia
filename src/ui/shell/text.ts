/**
 * Plain-text wording for the shell: content names, rule references and log lines. M1 replaces
 * the log wording with category filters and `Explain` links (docs/VISUAL-DESIGN.md §3.3).
 *
 * Each event type's wording lives with its domain in `logText/<domain>.ts`; `LOG_TEXT` here only
 * joins them (docs/ARCHITECTURE.md, Contracts, "Log text").
 */
import { findDef } from '../../content';
import type { EntityId, SimEvent } from '../../sim';
import { COMBAT_LOG_TEXT } from './logText/combat';
import { CORE_LOG_TEXT } from './logText/core';
import { FLOORS_LOG_TEXT } from './logText/floors';
import { ITEMS_LOG_TEXT } from './logText/items';
import { QUESTS_LOG_TEXT } from './logText/quests';
import { RUN_DOMAIN_LOG_TEXT } from './logText/run';
import { STATS_LOG_TEXT } from './logText/stats';
import type { HighlightKind, LogCategory, LogText, LogTextRecord, NameOf, Place } from './logText/types';

export { ruleLabel } from './logText/core';
export { defineHighlight } from './logText/types';
export type { HighlightKind, LogCategory, LogText, LogTextRecord, NameOf, Place } from './logText/types';

/**
 * The name of a content id: its def's `name`, or for an id with no def (monsters until M1) the
 * part after the last dot, capitalized. `monster.cave_rat` → `Cave rat`.
 */
export function contentName(id: string): string {
  const def = findDef(id);
  if (def !== undefined) return def.name;
  const last = id.slice(id.lastIndexOf('.') + 1).replace(/[-_]/g, ' ');
  return last.charAt(0).toUpperCase() + last.slice(1);
}

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
  /** Set when the event is a highlight: its kind and where it happened. */
  highlight?: Highlight;
}

/** A highlighted event's kind and place. */
export interface Highlight {
  kind: HighlightKind;
  place: Place;
}

/**
 * The wording of every event type, one domain per line. The annotation makes it exhaustive: an
 * event type no domain file covers fails to compile.
 */
export const LOG_TEXT: LogTextRecord<SimEvent> = {
  ...CORE_LOG_TEXT,
  ...STATS_LOG_TEXT,
  ...FLOORS_LOG_TEXT,
  ...COMBAT_LOG_TEXT,
  ...ITEMS_LOG_TEXT,
  ...QUESTS_LOG_TEXT,
  ...RUN_DOMAIN_LOG_TEXT,
};

/** The wording for an event. The cast is safe because `LOG_TEXT` pairs every type with its entry. */
function textOf<E extends SimEvent>(event: E): LogText<E> {
  return LOG_TEXT[event.type as SimEvent['type']] as unknown as LogText<E>;
}

/**
 * Every highlight kind some event entry names, in the order of `LOG_TEXT`, each once. Two
 * different kinds with one id are a mistake and throw at load.
 */
export const HIGHLIGHT_KINDS: readonly HighlightKind[] = collectHighlightKinds(LOG_TEXT);

export function collectHighlightKinds(record: Readonly<Record<string, { highlight?: HighlightKind }>>): HighlightKind[] {
  const byId = new Map<string, HighlightKind>();
  for (const [type, entry] of Object.entries(record)) {
    const kind = entry.highlight;
    if (kind === undefined) continue;
    const seen = byId.get(kind.id);
    if (seen !== undefined && seen !== kind) {
      throw new Error(`Highlight kind "${kind.id}" is declared twice (again on event "${type}")`);
    }
    byId.set(kind.id, kind);
  }
  return [...byId.values()];
}

/** The event's highlight, or `undefined` if it isn't one. */
export function highlightOf(event: SimEvent): Highlight | undefined {
  const entry = textOf(event) as LogText<SimEvent> & { highlight?: HighlightKind };
  const kind = entry.highlight;
  if (kind === undefined) return undefined;
  if (entry.highlightWhen !== undefined && !entry.highlightWhen(event)) return undefined;
  // `LogText.highlight` only type-checks on events that carry `floor` and `pos`.
  const { floor, pos } = event as unknown as Place;
  return { kind, place: { floor, pos: { x: pos.x, y: pos.y } } };
}

/**
 * The log's lines for a run of events, oldest first.
 *
 * - Quiet events (moves and waits) are left out.
 * - An AI decision is shown when an adventurer's goal changes: a `ruleFired` for the same rule
 *   and rule action as that adventurer's previous one is left out, since the engine traces
 *   every decision and most just continue the same goal.
 */
export function logLines(events: readonly { seq: number; event: SimEvent }[], nameOf: NameOf): LogLine[] {
  const goals = new Map<EntityId, string>();
  const lines: LogLine[] = [];
  for (const { seq, event } of events) {
    if (textOf(event).quiet === true) continue;
    if (event.type === 'ruleFired') {
      const goal = `${event.rule.set}:${event.rule.index}:${event.action}`;
      if (goals.get(event.actor) === goal) continue;
      goals.set(event.actor, goal);
    }
    if (event.type === 'stuck') goals.delete(event.actor);
    const highlight = highlightOf(event);
    lines.push({ seq, turn: event.turn, ...describe(event, nameOf), ...(highlight && { highlight }) });
  }
  return lines;
}

/** One event as a category and a sentence. */
export function describe(event: SimEvent, nameOf: NameOf): Pick<LogLine, 'category' | 'text'> {
  const entry = textOf(event);
  return { category: entry.category, text: entry.text(event, nameOf) };
}
