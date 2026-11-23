/**
 * Item properties (ETH-118): the one extension point for "this particular item is different".
 *
 * A property kind owns one optional top-level field of `ItemInstance` (`origin`, later `enchant`,
 * `blessing`, `identified`, `affixes`, `charges`) and says, in one place, how that field changes
 * the item:
 *
 * - `bundles`: extra bundles while the item is worn. `gearBundles` adds them after the def's
 *   bundle, so `getStat` (one part per bundle, credited to the item), triggers and the AI's
 *   `compareGear` see them at once. `ctx.wearer` lets a derived property (ETH-082 weapon scaling)
 *   read the wearer's attributes.
 * - `value`: the worth of one item after this property, given the worth so far. One
 *   `ITEM_VALUE_HOOKS` entry (`value.properties`) applies every kind's `value` in registry order.
 * - `name`: a prefix and/or suffix for `itemName` ("+2", "cursed", "of Embers"). `hidden(value,
 *   known)` leaves the part out until the viewer knows the item; `known` is false while any kind's
 *   `known(ctx, value)` says so (ETH-044's `identified`).
 * - `stacks`: `never` (an item with the field never stacks, even with an equal one) or `equal`
 *   (it stacks with items whose field is deep-equal; absent only matches absent).
 * - `schema`: what a present value must look like (the `items.properties` invariant checks it).
 *
 * A *derived* property (`ItemDerivedProperty`, ETH-082 weapon scaling) owns no field: it reads
 * the item's def and the wearer, and adds bundles to every item it applies to. Derived properties
 * come after the field kinds in `propertyBundleParts`. Their bundles may be credited to another
 * source than the item and carry a tooltip label (`ItemBundle`).
 *
 * `ITEM_PROPERTIES` lists the kinds in a fixed order: that order is the order of bundles, value
 * adjustments and name parts. New kinds from the items domain go in `ITEM_PROPERTY_LIST` below;
 * add the field to `ItemInstance` (optional, so no save needs a migration) at the same time. A
 * kind owned by another domain would come through a `SimDomain.itemProperties` list (not needed
 * yet). `registerItemProperty` exists for tests.
 *
 * Planned users: ETH-044 `enchant` / `blessing` / `identified`, ETH-045 `affixes` (and artifacts
 * as fixed affixes), ETH-082 weapon scaling, ETH-096 `charges`, ETH-069 heirlooms and ETH-109
 * through `origin`.
 */
import { z } from 'zod';
import type { Bundle } from '../../content';
import type { Entity, RunState } from '../state';
import { enchantmentProblems, PROP_BLESSING, PROP_ENCHANT, PROP_ENCHANTMENTS, PROP_IDENTIFIED } from './enchant';
import type { ItemInstance, ItemOrigin } from './instance';
import { PROP_WEAPON_SCALING } from './scaling';

/** The fields of `ItemInstance` a property may own: every one but `def` and `qty`. */
export type ItemPropertyField = Exclude<keyof ItemInstance, 'def' | 'qty'>;

/** What a property's hooks get. Must not change anything. */
export interface ItemPropertyCtx {
  readonly state: RunState;
  readonly item: ItemInstance;
  /** Who wears (or would wear) the item, when there is one: gear comparison, worn stats, naming. */
  readonly wearer?: Entity;
  /**
   * When true (AI gear evaluation, ETH-044), properties hidden from `wearer` are skipped so the
   * AI never peeks at unidentified enchantments or curses. Worn stats always use `false`.
   */
  readonly knownOnly?: boolean;
}

/** A name part from one property: before the base name or after it. */
export interface ItemNamePart {
  prefix?: string;
  suffix?: string;
}

/** One property kind. `T` is the type of the field it owns. */
export interface ItemPropertyKind<T = unknown> {
  /** Unique, e.g. `prop.origin`. */
  readonly id: string;
  /** The `ItemInstance` field it owns. Two kinds never own the same field. */
  readonly field: ItemPropertyField;
  /** What a present value must look like. */
  readonly schema: z.ZodType<T>;
  /** Extra bundles while the item is worn, after the def's bundle. Default: none. */
  bundles?(ctx: ItemPropertyCtx, value: T): readonly Bundle[];
  /**
   * Like `bundles`, but lets the property credit a specific content source, tooltip label, or
   * trigger potency (`ItemBundle`, ETH-044). Checked before `bundles`.
   */
  bundleParts?(ctx: ItemPropertyCtx, value: T): readonly ItemBundle[];
  /** The worth of one item after this property, given the worth so far (`base`). Default: unchanged. */
  value?(ctx: Omit<ItemPropertyCtx, 'wearer'>, value: T, base: number): number;
  /** Name parts. Default: none. */
  name?(value: T): ItemNamePart;
  /** Whether this property's name part is hidden from a viewer who does (`known`) or doesn't know the item. Default: never hidden. */
  hidden?(value: T, known: boolean): boolean;
  /**
   * Whether the viewer knows the item, as far as this kind is concerned. Called for every kind,
   * with `undefined` when the field is absent; the item is known when no kind says otherwise.
   */
  known?(ctx: ItemPropertyCtx, value: T | undefined): boolean;
  /** How the field affects stacking: `never` keeps the item apart; `equal` stacks with an equal value. */
  readonly stacks: 'never' | 'equal';
}

/**
 * One bundle an item applies while worn, as `getStat` credits it: to `source` (a content id;
 * default the item's def) under `label` (default the source's name), at `potency` (default 1).
 */
export interface ItemBundle {
  readonly bundle: Bundle;
  readonly source?: string;
  readonly label?: string;
  readonly potency?: number;
}

/**
 * A property that owns no field (ETH-082): it is worked out from the item's def and the wearer,
 * so it never affects stacking, value, naming or validation, only bundles.
 */
export interface ItemDerivedProperty {
  /** Unique, e.g. `prop.weapon_scaling`. */
  readonly id: string;
  /** Extra bundles while `ctx.wearer` wears `ctx.item`, after every field kind's. Must not change anything. */
  bundles(ctx: ItemPropertyCtx): readonly ItemBundle[];
}

/**
 * Heirloom history (ETH-069) and flavor (ETH-109): who carried the item, in which run, and a
 * note. Changes nothing about the item but its identity: it never stacks.
 */
export const PROP_ORIGIN: ItemPropertyKind<ItemOrigin> = {
  id: 'prop.origin',
  field: 'origin',
  schema: z
    .object({
      by: z.string().min(1).max(80).optional(),
      run: z.number().int().positive().optional(),
      note: z.string().min(1).max(500).optional(),
    })
    .strict()
    .refine((o) => o.by !== undefined || o.run !== undefined || o.note !== undefined, 'origin must set at least one field'),
  stacks: 'never',
};

/** The items domain's property kinds, in registry order (bundles, value, name parts follow it). */
const ITEM_PROPERTY_LIST: readonly ItemPropertyKind[] = [
  PROP_ENCHANT as ItemPropertyKind,
  PROP_BLESSING as ItemPropertyKind,
  PROP_ENCHANTMENTS as ItemPropertyKind,
  PROP_IDENTIFIED as ItemPropertyKind,
  PROP_ORIGIN as ItemPropertyKind,
];

const kinds: ItemPropertyKind[] = [];

/** Every property kind, in a fixed order. Read at run time only. */
export const ITEM_PROPERTIES: readonly ItemPropertyKind[] = kinds;

/** The items domain's derived properties, in order. */
const derived: ItemDerivedProperty[] = [PROP_WEAPON_SCALING];

/** Every derived property, in order. Read at run time only. */
export const ITEM_DERIVED_PROPERTIES: readonly ItemDerivedProperty[] = derived;

/** Adds a kind at the end of `ITEM_PROPERTIES`; returns a function that removes it (for tests). */
export function registerItemProperty<T>(kind: ItemPropertyKind<T>): () => void {
  const k = kind as ItemPropertyKind;
  if (kinds.some((o) => o.id === k.id)) throw new Error(`Duplicate item property "${k.id}"`);
  if (kinds.some((o) => o.field === k.field)) throw new Error(`Item property "${k.id}" claims field "${k.field}", which is taken`);
  kinds.push(k);
  return () => {
    const i = kinds.indexOf(k);
    if (i >= 0) kinds.splice(i, 1);
  };
}

for (const kind of ITEM_PROPERTY_LIST) registerItemProperty(kind);

/** The kind that owns `field`, if any. */
export function propertyKindFor(field: string): ItemPropertyKind | undefined {
  return kinds.find((k) => k.field === field);
}

/** Each property present on `item`, with its kind, in registry order. */
export function itemProperties(item: ItemInstance): { kind: ItemPropertyKind; value: unknown }[] {
  const out: { kind: ItemPropertyKind; value: unknown }[] = [];
  const fields = item as unknown as Record<string, unknown>;
  for (const kind of kinds) {
    const value = fields[kind.field];
    if (value !== undefined) out.push({ kind, value });
  }
  return out;
}

/**
 * The bundles `item`'s properties add, with how each is credited: each present field kind's in
 * registry order, then each derived property's (`gearBundleParts` puts the def's first). When
 * `ctx.knownOnly` is true, properties hidden from `ctx.wearer` are omitted.
 */
export function propertyBundleParts(ctx: ItemPropertyCtx): ItemBundle[] {
  const out: ItemBundle[] = [];
  const known = ctx.knownOnly !== true || ctx.wearer === undefined || itemKnown(ctx);
  for (const { kind, value } of itemProperties(ctx.item)) {
    if (ctx.knownOnly === true && kind.hidden?.(value, known) === true) continue;
    if (kind.bundleParts !== undefined) {
      out.push(...kind.bundleParts(ctx, value));
    } else if (kind.bundles !== undefined) {
      for (const bundle of kind.bundles(ctx, value)) out.push({ bundle });
    }
  }
  for (const prop of derived) out.push(...prop.bundles(ctx));
  return out;
}

/** The bundles `item`'s properties add, in `propertyBundleParts` order, without their credit. */
export function propertyBundles(ctx: ItemPropertyCtx): Bundle[] {
  return propertyBundleParts(ctx).map((p) => p.bundle);
}

/** Whether a viewer knows `item`: no kind's `known` says otherwise. */
export function itemKnown(ctx: ItemPropertyCtx): boolean {
  const fields = ctx.item as unknown as Record<string, unknown>;
  return kinds.every((k) => k.known === undefined || k.known(ctx, fields[k.field]));
}

/**
 * Why `item`'s extra fields are wrong, if they are: a field no kind owns, or a value its kind's
 * schema rejects. Empty when fine. `def` and `qty` are `instanceProblem`'s.
 */
export function propertyProblems(item: ItemInstance): string[] {
  const problems: string[] = [];
  for (const [field, value] of Object.entries(item)) {
    if (field === 'def' || field === 'qty') continue;
    const kind = propertyKindFor(field);
    if (kind === undefined) {
      problems.push(`"${item.def}" has unknown field "${field}"`);
      continue;
    }
    const result = kind.schema.safeParse(value);
    if (!result.success) problems.push(`"${item.def}" has a bad ${field}: ${result.error.issues[0]?.message ?? 'invalid'}`);
  }
  problems.push(...enchantmentProblems(item));
  return problems;
}
