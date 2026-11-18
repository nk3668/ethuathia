/**
 * Stat ids: the names every modifier, bundle and tooltip uses for an actor's numbers
 * (docs/ARCHITECTURE.md §2.2 and Contracts, "Stats").
 *
 * - ETH-057 builds `getStat(state, actor, stat)` on these ids: base value plus modifiers, with
 *   the source of each part for tooltips.
 * - ETH-033's attributes are not stats: they are inputs that derive these ids (e.g. a strength
 *   bonus becomes a `damage` modifier). A new stat id is added here, in one place.
 * - Content refers to stats by id string. Its validation checks those ids against `STAT_REFS`.
 */
import type { RefTarget } from '../../content';

/** Every stat, in display order. */
export const STAT_IDS = [
  /** Maximum hit points. Current HP stays on the actor part. */
  'hp',
  /** Maximum magic points. Current MP stays on the actor part. */
  'mp',
  /** Chance to hit. */
  'accuracy',
  /** Chance to avoid being hit. */
  'evasion',
  /** Damage dealt by an attack. */
  'damage',
  /** Damage taken off each hit. */
  'armor',
  /** Energy gained per tick (docs/ARCHITECTURE.md §3.3). */
  'speed',
  /** Field-of-view radius in tiles. */
  'sight',
  /** How much can be carried before being overloaded. */
  'carry',
] as const;

export type StatId = (typeof STAT_IDS)[number];

const STAT_SET: ReadonlySet<string> = new Set(STAT_IDS);

/** True if `value` is a stat id. */
export function isStatId(value: unknown): value is StatId {
  return typeof value === 'string' && STAT_SET.has(value);
}

/** The stat ids as a lookup for content validation: content refs of kind `stat` are checked here. */
export const STAT_REFS: RefTarget = { kind: 'stat', has: isStatId };

/** What the UI and `getStat` need to know about a stat. */
export interface StatInfo {
  /** Short label for tooltips and the Codex, e.g. "Max HP". */
  readonly label: string;
  /** One sentence for the tooltip. */
  readonly description: string;
  /** The value before any provider or bundle, unless the entity's `stats.base` sets one. */
  readonly base: number;
  /** The lowest value the stat can end at; the final value is clamped to it. */
  readonly min: number;
}

/** How far an actor sees before any modifiers (docs/ARCHITECTURE.md §3.7). */
export const BASE_SIGHT_RADIUS = 8;

/** Every stat's label, tooltip text, base value and minimum. */
export const STAT_INFO: Readonly<Record<StatId, StatInfo>> = {
  hp: { label: 'Max HP', description: 'Hit points when fully healed. At 0 HP an adventurer falls.', base: 0, min: 1 },
  mp: { label: 'Max MP', description: 'Magic points when fully rested, spent on spells and abilities.', base: 0, min: 0 },
  accuracy: { label: 'Accuracy', description: 'How likely an attack is to hit.', base: 0, min: 0 },
  evasion: { label: 'Evasion', description: 'How likely an attack against this actor is to miss.', base: 0, min: 0 },
  damage: { label: 'Damage', description: 'Damage dealt by an attack, before armor.', base: 0, min: 0 },
  armor: { label: 'Armor', description: 'Damage taken off each hit.', base: 0, min: 0 },
  speed: { label: 'Speed', description: 'Energy gained each turn: 100 acts once a turn, 200 twice.', base: 0, min: 0 },
  sight: { label: 'Sight', description: 'How many tiles away this actor can see.', base: BASE_SIGHT_RADIUS, min: 0 },
  carry: { label: 'Carry', description: 'How much can be carried before being overloaded.', base: 0, min: 0 },
};
