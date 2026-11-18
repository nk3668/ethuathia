/**
 * Draughts (ETH-072): what drinking from a fountain does. Every draught def is one row of the
 * fountain table, picked by `weight`. Its `bundle.effects` run on the drinker (heal, a status, or
 * nothing at all).
 *
 * Which draughts a fountain holds is rolled when its floor is built, from that floor's seeded RNG
 * (`gen.fountains` in `src/sim/floors/fountains.ts`), so the same seed always gives the same water.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { bundleRefs, bundleSchema } from './bundles';
import type { Bundle } from './bundles';
import type { ContentKind } from './kind';
import { defShape, positiveInt } from './schema';

/** How a draught turns out for the drinker, for the Codex grouping and the log. */
export type DraughtOutcome = 'boon' | 'bane' | 'plain';

export interface DraughtDef extends Def {
  /** Relative chance in the fountain table: the chance is weight / (sum of every weight). */
  readonly weight: number;
  /** Its `effects` run on the drinker. Modifiers and triggers are not used. */
  readonly bundle: Bundle;
  readonly outcome: DraughtOutcome;
}

export const DRAUGHTS = new Registry<DraughtDef>('draught');

export const DRAUGHT_KIND: ContentKind<DraughtDef> = {
  registry: DRAUGHTS,
  schema: z.strictObject({
    ...defShape('draught'),
    weight: positiveInt,
    bundle: bundleSchema,
    outcome: z.enum(['boon', 'bane', 'plain']),
  }),
  refs: (def) => bundleRefs('bundle', def.bundle),
};

/** Registers a draught def and returns it. Its shape is checked by `validateContent`. */
export function defineDraught(def: DraughtDef): DraughtDef {
  return DRAUGHTS.register(def);
}

/** The chance of `def` in the fountain table, from 0 to 1. */
export function draughtChance(def: DraughtDef): number {
  const total = DRAUGHTS.all().reduce((sum, d) => sum + d.weight, 0);
  return total === 0 ? 0 : def.weight / total;
}

export const DRAUGHT_MENDING = defineDraught({
  id: 'draught.mending',
  name: 'Mending water',
  description: 'Cold, clean water with a taste of iron. Cuts close and bruises fade: restores 8 HP.',
  tags: ['heal'],
  weight: 40,
  bundle: { effects: [{ kind: 'heal', amount: 8 }] },
  outcome: 'boon',
});

export const DRAUGHT_BRIGHT = defineDraught({
  id: 'draught.bright',
  name: 'Bright water',
  description: 'Water that seems to glow in the cupped hand. The drinker is Keen-eyed for 40 turns: sight +2.',
  tags: ['buff'],
  weight: 20,
  bundle: { effects: [{ kind: 'applyStatus', status: 'status.keen_eyed', turns: 40 }] },
  outcome: 'boon',
});

export const DRAUGHT_BRACKISH = defineDraught({
  id: 'draught.brackish',
  name: 'Brackish water',
  description: 'Salty, stale water that sits badly. The drinker is Queasy for 20 turns: speed ×0.85.',
  tags: ['debuff'],
  weight: 15,
  bundle: { effects: [{ kind: 'applyStatus', status: 'status.queasy', turns: 20 }] },
  outcome: 'bane',
});

export const DRAUGHT_STILL = defineDraught({
  id: 'draught.still',
  name: 'Still water',
  description: 'Just water, flat and cool. Nothing happens.',
  tags: [],
  weight: 25,
  bundle: {},
  outcome: 'plain',
});
