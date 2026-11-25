/**
 * The Omens section (ETH-185, CLAUDE.md §6): which unlocked Omens are switched on for the next
 * run, and at what rank. Rank 0 (or absent) is off, and every Omen starts off. Owning the town
 * node that unlocks an Omen adds nothing to a run; only a rank the player picks does. The choice
 * is remembered like the others, so auto-restart and Rematch keep it.
 *
 * One reward multiplier pays for all of them: `1 + Σ` of the chosen ranks' rewards
 * (`omenMultiplier`), shown on the Prepare screen with `omenBreakdown` as its tooltip.
 */
import { z } from 'zod';
import { OMENS, omenRank } from '../../content';
import type { OmenDef, OmenSelection } from '../../content';
import { idSchema } from '../../content/schema';
import type { Profile } from '../profile';
import { isUnlocked } from '../upgrades';
import { defineRunChoice } from './choice';

export interface OmensChoice {
  /** Omen id → rank (1 and up). An Omen that is missing, 0, locked or out of range is off. */
  readonly ranks: Readonly<Record<string, number>>;
}

/** The Omens the profile has unlocked, in registration order. An Omen no node unlocks stays locked. */
export function availableOmens(profile: Profile): OmenDef[] {
  return OMENS.all().filter((def) => isUnlocked(profile, def.id));
}

/** The Omens `choice` switches on for this profile, in registration order, each at a rank it really has. */
export function activeOmens(profile: Profile, choice: OmensChoice): OmenSelection[] {
  return availableOmens(profile).flatMap((def) => {
    const rank = choice.ranks[def.id] ?? 0;
    return omenRank(def, rank) === undefined ? [] : [{ id: def.id, rank }];
  });
}

/** One line of the multiplier's itemization: an Omen at a rank and the bonus it pays. */
export interface OmenBreakdownLine {
  readonly id: string;
  readonly name: string;
  readonly rank: number;
  readonly bonus: number;
}

/** What each active Omen adds to the reward multiplier. Empty with none on. */
export function omenBreakdown(selections: readonly OmenSelection[]): OmenBreakdownLine[] {
  return selections.flatMap((o) => {
    const def = OMENS.has(o.id) ? OMENS.get(o.id) : undefined;
    const rank = def === undefined ? undefined : omenRank(def, o.rank);
    return def === undefined || rank === undefined ? [] : [{ id: o.id, name: def.name, rank: o.rank, bonus: rank.reward }];
  });
}

/** The reward multiplier these Omens pay: 1 with none on. Applies to Renown, Trophies and Favor as earned. */
export function omenMultiplier(selections: readonly OmenSelection[]): number {
  return 1 + omenBreakdown(selections).reduce((sum, line) => sum + line.bonus, 0);
}

/** What the multiplier covers, for tooltips and the run summary (CLAUDE.md §3). */
export const OMEN_MULTIPLIER_TEXT =
  'The Omen multiplier applies to Renown, Trophies and Favor as the run earns them, before a wipe takes its share. ' +
  'It does not apply to the Trophies from leftover gold, sold items or salvage.';

/** "×1.30" for a multiplier of 1.3. */
export function multiplierText(multiplier: number): string {
  return `×${(Math.round(multiplier * 100) / 100).toFixed(2)}`;
}

export const OMENS_CHOICE = defineRunChoice<OmensChoice>({
  schema: z.object({ ranks: z.record(idSchema('omen'), z.number().int().min(0).max(9)) }),
  init: () => ({ ranks: {} }),
  apply({ profile, config }, choice) {
    const omens = activeOmens(profile, choice);
    if (omens.length > 0) config.omens = omens;
  },
});
