/**
 * `RunResult`: what a finished run hands to the meta layer (docs/ARCHITECTURE.md, Contracts,
 * "Rewards"). The run domain builds it at run end from `state.domains.run.rewards.atRisk`
 * (ETH-062); meta's `applyRunResult` banks it. Plain data, so it crosses the worker boundary.
 */

/**
 * Currency amounts keyed by currency id: `renown`, `trophies`, and `favor:<deity id>` for each
 * deity's Favor (build the key with `favorKey`). Absent means 0.
 */
export type RewardAmounts = Record<string, number>;

export const RENOWN = 'renown';
export const TROPHIES = 'trophies';
const FAVOR_PREFIX = 'favor:';

/** The reward key for a deity's Favor: `favor:deity.dawn`. */
export function favorKey(deityId: string): string {
  return FAVOR_PREFIX + deityId;
}

/** The deity id in a Favor reward key, or `null` if `key` is not one. */
export function favorDeity(key: string): string | null {
  return key.startsWith(FAVOR_PREFIX) && key.length > FAVOR_PREFIX.length ? key.slice(FAVOR_PREFIX.length) : null;
}

export type RunOutcome = 'victory' | 'retreat' | 'wipe';

export const RUN_OUTCOMES: readonly RunOutcome[] = ['victory', 'retreat', 'wipe'];

export interface RunResult {
  readonly outcome: RunOutcome;
  /** Each currency's at-risk total when the run ended, before any wipe loss. */
  readonly atRisk: Readonly<RewardAmounts>;
  /**
   * What the wipe took, per currency (ETH-023); empty for a victory or a retreat. Never more
   * than `atRisk`. Meta banks `(atRisk - lost) + (converted ?? {})`.
   */
  readonly lost: Readonly<RewardAmounts>;
  /**
   * Post-exit converted currencies (ETH-083), such as leftover gold converted into Trophies on
   * victory or retreat. Applied after Omen multipliers (not multiplied itself) and never subject
   * to wipe loss. Omitted when empty.
   */
  readonly converted?: Readonly<RewardAmounts>;
  /** Game turns the run took. */
  readonly turns: number;
  /** The deepest floor any party member reached (1 is the first floor). */
  readonly deepestDepth: number;
  /**
   * Open record for later trackers (kills, deaths, conducts, contracts…), keyed by the tracker
   * or domain that writes it (`'track.kills'`). Values are plain data. Profile slices read the
   * keys they know and ignore the rest.
   */
  readonly extras: Readonly<Record<string, unknown>>;
}

/** A run that earned nothing: a starting point for tests and for building results. */
export function emptyRunResult(outcome: RunOutcome): RunResult {
  return { outcome, atRisk: {}, lost: {}, turns: 0, deepestDepth: 0, extras: {} };
}
