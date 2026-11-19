/**
 * The shape of log wording (docs/ARCHITECTURE.md, Contracts, "Log text"). Each sim domain has a
 * file beside this one exporting a `LogTextRecord` over its event union; `../text.ts` joins them
 * into one record over every event type, so an event without wording fails to compile.
 */
import type { Pos } from '../../../core';
import type { ChronicleEntry, EntityId, FloorId } from '../../../sim';

/** Log categories (docs/VISUAL-DESIGN.md §2.3). */
export type LogCategory = 'combat' | 'loot' | 'discovery' | 'ai' | 'system';

/** Looks up an entity's display name. */
export type NameOf = (id: EntityId) => string;

/**
 * A kind of highlight: a notable moment the Highlights feed lists and the player can choose to
 * auto-pause on (Options). Declare one with `defineHighlight` in the domain's log-text file and
 * name it in the `highlight` of each event entry that is that kind of moment. The Options list
 * and the feed are built from the entries, so there is no central list to edit.
 */
export interface HighlightKind {
  /** Unique across every domain, e.g. `stuck`, `bossEngaged`. Saved in the auto-pause choices. */
  readonly id: string;
  /** The Options label, e.g. "An adventurer gets stuck". */
  readonly label: string;
  /** The Options tooltip: what counts as this moment. */
  readonly description: string;
}

/** Declares a highlight kind. Keep one constant per kind and reuse it across event entries. */
export function defineHighlight(kind: HighlightKind): HighlightKind {
  return Object.freeze({ ...kind });
}

/** Where a highlighted event happened: the map centers here when its log line is clicked. */
export interface Place {
  floor: FloorId;
  pos: Pos;
}

/** How one event type reads in the log. */
export interface LogText<E> {
  /** The filter tab and color it goes under. */
  readonly category: LogCategory;
  /** Left out of the log, because the map already shows it and it happens every turn. */
  readonly quiet?: boolean;
  /**
   * Marks the event as a highlight of this kind. Only events that say where they happened can be
   * highlights: the event must carry `floor` and `pos` (a type error otherwise).
   */
  readonly highlight?: E extends Place ? HighlightKind : never;
  /**
   * Narrows `highlight` to some events of the type, e.g. damage that leaves an adventurer near
   * death. Without it every event of the type is a highlight.
   */
  readonly highlightWhen?: (event: E) => boolean;
  /**
   * The sentence, e.g. "Mira opens a door." Return parts instead of a string to make content
   * mentions `Explain` links: `[`${nameOf(e.actor)} opens a `, mention('feature.door', 'door'), '.']`.
   */
  text(event: E, nameOf: NameOf): string | readonly LogPart[];
}

/** A content id mentioned in a log line: shown as `label` (default: the def's name) with an Explain tooltip. */
export interface Mention {
  readonly ref: string;
  readonly label?: string;
}

/** A piece of a log sentence: plain text or a content mention. */
export type LogPart = string | Mention;

/** A content mention for a log sentence. `label` is the wording, e.g. `door` for `feature.door`. */
export function mention(ref: string, label?: string): Mention {
  return label === undefined ? { ref } : { ref, label };
}

/**
 * Wording for every event type of the union `E`, keyed by type. Exhaustive: an event type with
 * no entry, or an entry for no event type, fails to compile.
 */
export type LogTextRecord<E extends { type: string }> = {
  readonly [K in E['type']]: LogText<Extract<E, { type: K }> & { turn: number }>;
};

/**
 * How one run chronicle moment kind reads (ETH-120): the Highlights feed, the run summary's
 * "Moments" and the run history word chronicle entries with it. Each domain's log-text file
 * exports a `MomentTextRecord` keyed by its chronicle kind ids; `../text.ts` joins them into
 * `MOMENT_TEXT`, and a test fails on a sim chronicle kind with no wording.
 */
export interface MomentText {
  /**
   * The kind's label and description: the same constant as the log highlight when the moment is
   * one (it is for every kind but the wipe's loss).
   */
  readonly kind: HighlightKind;
  /** The log category it shows under. */
  readonly category: LogCategory;
  /** The sentence, in the past tense: "Mira reached level 3." */
  text(entry: ChronicleEntry, nameOf: NameOf): string | readonly LogPart[];
}

/** Moment wording keyed by chronicle kind id. */
export type MomentTextRecord = Readonly<Record<string, MomentText>>;

/** " on floor 4", or nothing when the depth is unknown (0). */
export function onFloor(depth: number): string {
  return depth > 0 ? ` on floor ${depth}` : '';
}
