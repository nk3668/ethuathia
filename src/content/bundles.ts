/**
 * Bundles (docs/ARCHITECTURE.md §2.2): the shared data shape for anything that changes an actor.
 * A bundle has stat `modifiers`, one-shot `effects` and `triggers` (an event kind that runs
 * effects). Statuses, traits, gear, food, blessings and Omen ranks all carry one in a `bundle`
 * field, so the sim reads them all the same way.
 *
 * Content names stats, statuses and trigger kinds by id string; `bundleRefs` lists them so
 * validation checks them against the sim's tables (`stat`, `status`, `trigger`).
 *
 * The `bundle` kind below is for bundles that are not part of another def (a trait, a blessing,
 * a test fixture). Its ids are `bundle.*`.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind, ContentRef } from './kind';
import { defShape, positiveInt } from './schema';

/** A stat change. `add` adds `value`; `mul` multiplies the stat by `value` (1.5 is +50%). */
export interface Modifier {
  /** A stat id (`hp`, `speed`, `sight`, …), checked against the sim's `STAT_IDS`. */
  readonly stat: string;
  readonly op: 'add' | 'mul';
  readonly value: number;
}

/** Who an effect lands on: the bundle's holder (default), or the other party to the event. */
export type EffectTarget = 'self' | 'other';

/**
 * One effect. The sim's interpreter (`runEffect` in `src/sim/stats/effects.ts`) has one case per
 * `kind`; a new kind is one member here, one schema option below and one case there.
 */
export type Effect =
  /** Restores `amount` HP, never above maximum HP. */
  | { readonly kind: 'heal'; readonly amount: number; readonly to?: EffectTarget }
  /** Removes `amount` HP, never below 0. Death is the combat domain's (ETH-060). */
  | { readonly kind: 'damage'; readonly amount: number; readonly to?: EffectTarget }
  /** Applies the status `status` for `turns` of the target's turns, at `potency` (default 1). */
  | {
      readonly kind: 'applyStatus';
      readonly status: string;
      readonly turns: number;
      readonly potency?: number;
      readonly to?: EffectTarget;
    }
  /**
   * Identifies unidentified carried or worn items (ETH-044): `one` (default) identifies one item,
   * `all` (or `potency >= 1.5`, e.g. a blessed scroll) identifies everything carried and worn.
   */
  | { readonly kind: 'identify'; readonly scope?: 'one' | 'all'; readonly to?: EffectTarget }
  /**
   * Lifts curses from items (ETH-044): `worn` (default) uncurses worn gear, `all` (or
   * `potency >= 1.5`, e.g. a blessed scroll) uncurses worn gear and carried items alike.
   */
  | { readonly kind: 'uncurse'; readonly scope?: 'worn' | 'all'; readonly to?: EffectTarget };

export type EffectKind = Effect['kind'];

/** "When `on` happens to the holder, run `effects`." `on` is a trigger kind id (`trigger.*`). */
export interface Trigger {
  readonly on: string;
  readonly effects: readonly Effect[];
}

export interface Bundle {
  readonly modifiers?: readonly Modifier[];
  /** Run once, by whatever uses the bundle (a potion, a scroll). Attaching a bundle doesn't run them. */
  readonly effects?: readonly Effect[];
  readonly triggers?: readonly Trigger[];
}

const targetSchema = z.enum(['self', 'other']).optional();

export const modifierSchema: z.ZodType<Modifier> = z
  .strictObject({
    stat: z.string().min(1),
    op: z.enum(['add', 'mul']),
    value: z.number().refine(Number.isFinite, 'must be a finite number'),
  })
  .refine((m) => m.op !== 'mul' || m.value >= 0, { message: 'a mul modifier must not be negative', path: ['value'] });

export const effectSchema: z.ZodType<Effect> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('heal'), amount: positiveInt, to: targetSchema }),
  z.strictObject({ kind: z.literal('damage'), amount: positiveInt, to: targetSchema }),
  z.strictObject({
    kind: z.literal('applyStatus'),
    status: z.string().min(1),
    turns: positiveInt,
    potency: z.number().positive('must be above 0').optional(),
    to: targetSchema,
  }),
  z.strictObject({
    kind: z.literal('identify'),
    scope: z.enum(['one', 'all']).optional(),
    to: targetSchema,
  }),
  z.strictObject({
    kind: z.literal('uncurse'),
    scope: z.enum(['worn', 'all']).optional(),
    to: targetSchema,
  }),
]);

export const triggerSchema: z.ZodType<Trigger> = z.strictObject({
  on: z.string().min(1),
  effects: z.array(effectSchema).min(1, 'must have at least one effect'),
});

export const bundleSchema: z.ZodType<Bundle> = z.strictObject({
  modifiers: z.array(modifierSchema).optional(),
  effects: z.array(effectSchema).optional(),
  triggers: z.array(triggerSchema).optional(),
});

/** The ids an effect list mentions, for `ContentKind.refs`. */
export function effectRefs(path: string, effects: readonly Effect[] | undefined): ContentRef[] {
  const refs: ContentRef[] = [];
  effects?.forEach((e, i) => {
    if (e.kind === 'applyStatus') refs.push({ path: `${path}[${i}].status`, kind: 'status', id: e.status });
  });
  return refs;
}

/**
 * The ids a bundle mentions (stats, statuses, trigger kinds), for `ContentKind.refs`. `path` is
 * where the bundle sits in its def, e.g. `bundle`.
 */
export function bundleRefs(path: string, bundle: Bundle): ContentRef[] {
  const refs: ContentRef[] = [];
  bundle.modifiers?.forEach((m, i) => refs.push({ path: `${path}.modifiers[${i}].stat`, kind: 'stat', id: m.stat }));
  refs.push(...effectRefs(`${path}.effects`, bundle.effects));
  bundle.triggers?.forEach((t, i) => {
    refs.push({ path: `${path}.triggers[${i}].on`, kind: 'trigger', id: t.on });
    refs.push(...effectRefs(`${path}.triggers[${i}].effects`, t.effects));
  });
  return refs;
}

/** A bundle that is a def of its own. */
export interface BundleDef extends Def {
  readonly bundle: Bundle;
}

export const BUNDLES = new Registry<BundleDef>('bundle');

export const BUNDLE_KIND: ContentKind<BundleDef> = {
  registry: BUNDLES,
  schema: z.strictObject({ ...defShape('bundle'), bundle: bundleSchema }),
  refs: (def) => bundleRefs('bundle', def.bundle),
};

/** Registers a bundle def and returns it. Its shape is checked by `validateContent`. */
export function defineBundle(def: BundleDef): BundleDef {
  return BUNDLES.register(def);
}
