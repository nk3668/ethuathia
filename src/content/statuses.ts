/**
 * Timed statuses (buffs and debuffs): a bundle that lasts a number of the holder's turns.
 * The sim applies, ticks and expires them (`src/sim/stats/statuses.ts`); this file is the data.
 *
 * Stacking is set per status def. Two applications are "the same type" when they share a
 * `group` (the status id unless set), so a small and a large food buff of one effect type can
 * share a group and refresh each other (ETH-054's rule), while different groups stack freely.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { bundleRefs, bundleSchema } from './bundles';
import type { Bundle } from './bundles';
import type { ContentKind } from './kind';
import { defShape, glyphSchema, idSchema, positiveInt } from './schema';
import type { Glyph } from './schema';

/**
 * What happens when a status is applied while one of the same group is active:
 *
 * - `refresh`: one at a time. The remaining turns become the longer of the two, and the stronger
 *   potency is kept (the new status replaces the old one if it is stronger).
 * - `extend`: one at a time. The new turns are added to the remaining turns; the stronger potency is kept.
 * - `stack`: each application is a separate instance with its own turns, up to `maxStacks`;
 *   beyond that the instance with the fewest turns left is replaced.
 */
export type StatusStacking = 'refresh' | 'extend' | 'stack';

export interface StatusDef extends Def {
  /** What the status does while active. Its `modifiers` and `triggers` are scaled by potency. */
  readonly bundle: Bundle;
  readonly stacking: StatusStacking;
  /** Statuses with the same group are the same type for stacking. Defaults to the id. */
  readonly group?: string;
  /** For `stack`: how many instances can be active at once. Defaults to `DEFAULT_MAX_STACKS`. */
  readonly maxStacks?: number;
  /** A debuff. The UI colors it as danger (with a sign, never color alone). */
  readonly harmful: boolean;
  /** The badge shown on the party card. */
  readonly glyph: Glyph;
}

/** How many instances of a `stack` status can be active when its def doesn't say. */
export const DEFAULT_MAX_STACKS = 5;

export const STATUSES = new Registry<StatusDef>('status');

export const STATUS_KIND: ContentKind<StatusDef> = {
  registry: STATUSES,
  schema: z.strictObject({
    ...defShape('status'),
    bundle: bundleSchema,
    stacking: z.enum(['refresh', 'extend', 'stack']),
    group: idSchema('status').optional(),
    maxStacks: positiveInt.optional(),
    harmful: z.boolean(),
    glyph: glyphSchema,
  }),
  refs: (def) => bundleRefs('bundle', def.bundle),
};

/** Registers a status def and returns it. Its shape is checked by `validateContent`. */
export function defineStatus(def: StatusDef): StatusDef {
  return STATUSES.register(def);
}

/** The stacking group of a status: its `group`, or its id. */
export function statusGroup(def: StatusDef): string {
  return def.group ?? def.id;
}

export const STATUS_HASTED = defineStatus({
  id: 'status.hasted',
  name: 'Hasted',
  description: 'Moving in a blur: acts half again as often. Reapplying refreshes the duration.',
  tags: ['buff'],
  bundle: { modifiers: [{ stat: 'speed', op: 'mul', value: 1.5 }] },
  stacking: 'refresh',
  harmful: false,
  glyph: { ch: '»', color: '#7fd1ff' },
});

export const STATUS_REGENERATING = defineStatus({
  id: 'status.regenerating',
  name: 'Regenerating',
  description: 'Wounds close on their own: heals 1 HP at the start of each turn. Reapplying refreshes the duration.',
  tags: ['buff'],
  bundle: { triggers: [{ on: 'trigger.turn_start', effects: [{ kind: 'heal', amount: 1 }] }] },
  stacking: 'refresh',
  harmful: false,
  glyph: { ch: '+', color: '#7bd88f' },
});

export const STATUS_POISONED = defineStatus({
  id: 'status.poisoned',
  name: 'Poisoned',
  description: 'Venom in the blood: loses 1 HP at the start of each turn. Each new dose stacks, up to 3.',
  tags: ['debuff'],
  bundle: { triggers: [{ on: 'trigger.turn_start', effects: [{ kind: 'damage', amount: 1 }] }] },
  stacking: 'stack',
  maxStacks: 3,
  harmful: true,
  glyph: { ch: '!', color: '#a6e22e' },
});

/** From a fountain's bright water (ETH-072). */
export const STATUS_KEEN_EYED = defineStatus({
  id: 'status.keen_eyed',
  name: 'Keen-eyed',
  description: 'The dark seems thinner: sees 2 tiles further. Reapplying refreshes the duration.',
  tags: ['buff'],
  bundle: { modifiers: [{ stat: 'sight', op: 'add', value: 2 }] },
  stacking: 'refresh',
  harmful: false,
  glyph: { ch: '^', color: '#9fd8ff' },
});

/** From a fountain's brackish water (ETH-072). */
export const STATUS_QUEASY = defineStatus({
  id: 'status.queasy',
  name: 'Queasy',
  description: 'A sour, rolling stomach: acts a little more slowly (speed ×0.85). Reapplying refreshes the duration.',
  tags: ['debuff'],
  bundle: { modifiers: [{ stat: 'speed', op: 'mul', value: 0.85 }] },
  stacking: 'refresh',
  harmful: true,
  glyph: { ch: '~', color: '#b5a94a' },
});

export const STATUS_DAZZLED = defineStatus({
  id: 'status.dazzled',
  name: 'Dazzled',
  description: 'Spots before the eyes: sees 3 tiles less far. More of it lasts longer.',
  tags: ['debuff'],
  bundle: { modifiers: [{ stat: 'sight', op: 'add', value: -3 }] },
  stacking: 'extend',
  harmful: true,
  glyph: { ch: '*', color: '#f4d35e' },
});

export const STATUS_EMBOLDENED = defineStatus({
  id: 'status.emboldened',
  name: 'Emboldened',
  description:
    'Spurred on by a companion: +1 accuracy and +1 damage. Monsters that tend their kin hand it out in a fight. ' +
    'Reapplying refreshes the duration.',
  tags: ['buff'],
  bundle: {
    modifiers: [
      { stat: 'accuracy', op: 'add', value: 1 },
      { stat: 'damage', op: 'add', value: 1 },
    ],
  },
  stacking: 'refresh',
  harmful: false,
  glyph: { ch: '!', color: '#e8a33d' },
});
