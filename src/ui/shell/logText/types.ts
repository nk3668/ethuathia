/**
 * The shape of log wording (docs/ARCHITECTURE.md, Contracts, "Log text"). Each sim domain has a
 * file beside this one exporting a `LogTextRecord` over its event union; `../text.ts` joins them
 * into one record over every event type, so an event without wording fails to compile.
 */
import type { EntityId } from '../../../sim';

/** Log categories (docs/VISUAL-DESIGN.md §2.3). */
export type LogCategory = 'combat' | 'loot' | 'discovery' | 'ai' | 'system';

/** Looks up an entity's display name. */
export type NameOf = (id: EntityId) => string;

/** How one event type reads in the log. */
export interface LogText<E> {
  /** The filter tab and color it goes under. */
  readonly category: LogCategory;
  /** Left out of the log, because the map already shows it and it happens every turn. */
  readonly quiet?: boolean;
  /** The sentence, e.g. "Mira opens a door." */
  text(event: E, nameOf: NameOf): string;
}

/**
 * Wording for every event type of the union `E`, keyed by type. Exhaustive: an event type with
 * no entry, or an entry for no event type, fails to compile.
 */
export type LogTextRecord<E extends { type: string }> = {
  readonly [K in E['type']]: LogText<Extract<E, { type: K }> & { turn: number }>;
};
