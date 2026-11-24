/**
 * The `mastery` slice (ETH-087): each class's guild-wide Class Mastery XP and the runs that fed
 * it. Only XP is stored; the level and talent points are derived by the curve in
 * `src/meta/mastery.ts`, so retuning it never needs a migration. A save without the slice loads
 * as `{ classes: {} }`. Unknown class ids are kept and ignored, like unknown upgrade ids.
 */
import { z } from 'zod';
import { masteryShares } from '../mastery';
import { defineSlice } from '../slice';

export interface ClassMastery {
  /** Total Mastery XP banked for the class. */
  readonly xp: number;
  /** Runs that had the class in the party. */
  readonly runs: number;
}

export interface Mastery {
  readonly classes: Readonly<Record<string, ClassMastery>>;
}

const count = z.number().int().nonnegative();

const masterySchema = z.object({
  classes: z.record(z.string().min(1).max(80), z.object({ xp: count, runs: count })),
});

export const masterySlice = defineSlice<Mastery>({
  version: 1,
  schema: masterySchema,
  init: () => ({ classes: {} }),
  onRunResult: (mastery, result) => {
    const shares = masteryShares(result);
    if (shares.length === 0) return mastery;
    const classes = { ...mastery.classes };
    for (const share of shares) {
      const was = Object.hasOwn(classes, share.classId) ? (classes[share.classId] as ClassMastery) : { xp: 0, runs: 0 };
      classes[share.classId] = { xp: was.xp + share.xp, runs: was.runs + 1 };
    }
    return { classes };
  },
});
