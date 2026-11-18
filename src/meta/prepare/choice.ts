/**
 * A run-choice section (ETH-064): one part of what the player sets on the Prepare screen
 * (CLAUDE.md §2, "Starting a run"): the party, the dungeon, later contracts, bounties, Omens and
 * the patron. Sections are composed in `RUN_CHOICES` (`./index.ts`) the way profile slices are
 * composed in `PROFILE_SLICES`: a new one is a file here and one line there, and the choice
 * type, its saved copy in the profile and `buildRunConfig` follow.
 */
import type { z } from 'zod';
import type { Rng } from '../../core';
import type { RunConfig } from '../../sim';
import type { Profile } from '../profile';

/** What a section's `apply` works with while `buildRunConfig` builds a config. */
export interface BuildCtx {
  readonly profile: Profile;
  /**
   * Seeded from the run's seed, for anything random about the setup (recruits). Sections draw
   * in `RUN_CHOICES` order, so a new section never changes an earlier one's draws.
   */
  readonly rng: Rng;
  /** The config so far, which `apply` adds to. Starts as `{ party: [] }`. */
  readonly config: RunConfig;
}

export interface RunChoiceSection<C> {
  /** Validates the saved choice. A saved value that fails it is replaced by `init()` on load. */
  readonly schema: z.ZodType<C>;
  /** The choice before the player has made one. */
  init(): C;
  /**
   * Adds this section's part of the run to `ctx.config`. Pure apart from `ctx.rng` draws. A
   * choice the profile no longer allows (a locked class, a dungeon given up in a respec) falls
   * back to what is allowed rather than failing.
   */
  apply(ctx: BuildCtx, choice: C): void;
}

/** The choice type a section holds. */
export type ChoiceOf<T> = T extends RunChoiceSection<infer C> ? C : never;

/** Identity helper that infers `C` from the definition. */
export function defineRunChoice<C>(section: RunChoiceSection<C>): RunChoiceSection<C> {
  return section;
}
