/**
 * Omens: opt-in difficulty modifiers with ranks, each rank raising the reward multiplier (CLAUDE.md §6, Omens; ETH-185).
 *
 * An Omen starts locked: a town upgrade node unlocks it with an `unlock` grant (the way classes
 * and races are unlocked), and the player switches it on, at a rank, on the Prepare screen. Rank 0
 * is off. The node never turns the Omen on or pays a bonus by itself: the one reward multiplier
 * (`1 + Σ rank rewards`, the run modifiers' `rewardBonus`) is the only payment for the risk.
 *
 * Each rank lists the *whole* effect at that rank, not an addition to the one below: a run
 * modifier (docs/ARCHITECTURE.md, "Run-wide modifiers") with a `bundle` and/or `flags`, and the
 * reward bonus the player has in total at that rank. The sim turns the chosen rank into a run
 * modifier credited "Gloom (Omen, rank 2)" (`src/sim/stats/omens.ts`).
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { bundleRefs, bundleSchema } from './bundles';
import type { Bundle } from './bundles';
import type { ContentKind } from './kind';
import { defShape } from './schema';

/** The most ranks an Omen can have. */
export const MAX_OMEN_RANKS = 5;

/** Who an Omen rank's bundle applies to: the same scopes as a run modifier. */
export type OmenScope = 'party' | 'monsters' | 'all';

/** One rank of an Omen: the whole effect at that rank and the reward bonus it pays in total. */
export interface OmenRank {
  /** The reward multiplier is `1 + Σ` of the chosen ranks' `reward`: 0.1 is +10% on every at-risk currency. Rises with each rank. */
  readonly reward: number;
  /** What this rank does, in a plain sentence, for the Codex and the Prepare tooltip. */
  readonly text: string;
  /** Who the bundle applies to. Default `monsters`. */
  readonly scope?: OmenScope;
  /** Stat changes and triggers the rank adds (through the `stats.run` bundle source). */
  readonly bundle?: Bundle;
  /** Named switches code reads with `runFlag` (`omen.dry_wells`). */
  readonly flags?: readonly string[];
}

export interface OmenDef extends Def {
  /** Rank 1 first; at most `MAX_OMEN_RANKS`. */
  readonly ranks: readonly OmenRank[];
}

export const OMENS = new Registry<OmenDef>('omen');

const rankSchema: z.ZodType<OmenRank> = z.strictObject({
  reward: z.number().positive('must be above 0').finite(),
  text: z.string().trim().min(1, 'must not be empty'),
  scope: z.enum(['party', 'monsters', 'all']).optional(),
  bundle: bundleSchema.optional(),
  flags: z.array(z.string().trim().min(1, 'must not be empty')).min(1, 'must name a flag').optional(),
});

export const OMEN_KIND: ContentKind<OmenDef> = {
  registry: OMENS,
  schema: z
    .strictObject({
      ...defShape('omen'),
      ranks: z.array(rankSchema).min(1, 'must have a rank').max(MAX_OMEN_RANKS, `must have at most ${MAX_OMEN_RANKS} ranks`),
    })
    .superRefine((def, ctx) => {
      def.ranks.forEach((rank, i) => {
        if (rank.bundle === undefined && rank.flags === undefined) {
          ctx.addIssue({ code: 'custom', path: ['ranks', i], message: 'must have a bundle or flags, or it changes nothing' });
        }
        if (i > 0 && rank.reward <= (def.ranks[i - 1]?.reward ?? 0)) {
          ctx.addIssue({ code: 'custom', path: ['ranks', i, 'reward'], message: 'must be above the previous rank’s reward' });
        }
      });
    }),
  refs: (def) => def.ranks.flatMap((rank, i) => (rank.bundle === undefined ? [] : bundleRefs(`ranks[${i}].bundle`, rank.bundle))),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineOmen(def: OmenDef): OmenDef {
  return OMENS.register(def);
}

/** The ranks an Omen has. */
export function maxOmenRank(def: OmenDef): number {
  return def.ranks.length;
}

/** The rank (1-based) of `def`, or `undefined` if there is no such rank. */
export function omenRank(def: OmenDef, rank: number): OmenRank | undefined {
  return Number.isInteger(rank) ? def.ranks[rank - 1] : undefined;
}

/** The reward bonus `def` pays at `rank` (0 for off or an unknown rank): 0.2 is +20%. */
export function omenRewardBonus(def: OmenDef, rank: number): number {
  return omenRank(def, rank)?.reward ?? 0;
}

/** An Omen switched on at a rank, as the run config records it. */
export interface OmenSelection {
  readonly id: string;
  readonly rank: number;
}

/** The roman numeral for a rank, for labels ("Gloom II"). */
export function rankNumeral(rank: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][rank] ?? String(rank);
}
