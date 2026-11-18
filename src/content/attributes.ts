/**
 * Attributes (ETH-033): the four innate qualities every adventurer has, Brawn, Finesse, Wits and
 * Grit. A class sets them, a race adjusts them, and leveling (ETH-034) raises them. They are not
 * stats themselves: the stats domain derives the stats (max HP, accuracy, damage…) from them
 * through one formula table (`ATTRIBUTE_FORMULAS` in `src/sim/stats/attributes.ts`).
 *
 * The names are original (CLAUDE.md §9 clean-room). Content names an attribute by its short key
 * (`brawn`); its def, with the Codex and tooltip text, has the id `attribute.<key>`.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

/** Every attribute key, in display order. */
export const ATTRIBUTE_IDS = ['brawn', 'finesse', 'wits', 'grit'] as const;

export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

/** A value for every attribute, e.g. a class's starting attributes. */
export type Attributes = Readonly<Record<AttributeId, number>>;

const ATTRIBUTE_SET: ReadonlySet<string> = new Set(ATTRIBUTE_IDS);

/** True if `value` is an attribute key. */
export function isAttributeId(value: unknown): value is AttributeId {
  return typeof value === 'string' && ATTRIBUTE_SET.has(value);
}

/** The content id of an attribute's def: `attribute.brawn`. */
export function attributeDefId(attribute: AttributeId): string {
  return `attribute.${attribute}`;
}

export interface AttributeDef extends Def {
  /** The attribute key this def describes. Its id is `attribute.<key>`. */
  readonly key: AttributeId;
  /** Three-letter abbreviation for compact displays, e.g. `BRN`. */
  readonly abbr: string;
}

export const ATTRIBUTES = new Registry<AttributeDef>('attribute');

const attributeKeySchema = z.enum(ATTRIBUTE_IDS);

/** A whole number for each attribute, all four required, each at least 1 (a class's attributes). */
export const attributesSchema = z.strictObject({
  brawn: z.number().int('must be a whole number').min(1, 'must be at least 1'),
  finesse: z.number().int('must be a whole number').min(1, 'must be at least 1'),
  wits: z.number().int('must be a whole number').min(1, 'must be at least 1'),
  grit: z.number().int('must be a whole number').min(1, 'must be at least 1'),
});

/** Whole-number adjustments to some attributes, which may be negative (a race's attributes). */
export const attributeBonusSchema = z.partialRecord(attributeKeySchema, z.number().int('must be a whole number'));

export const ATTRIBUTE_KIND: ContentKind<AttributeDef> = {
  registry: ATTRIBUTES,
  schema: z.strictObject({
    ...defShape('attribute'),
    key: attributeKeySchema,
    abbr: z.string().regex(/^[A-Z]{3}$/, 'must be three capital letters'),
  }),
  check(defs) {
    const problems: string[] = [];
    for (const def of defs) {
      if (def.id !== attributeDefId(def.key)) problems.push(`attribute "${def.id}": id must be "${attributeDefId(def.key)}" for key "${def.key}"`);
    }
    for (const key of ATTRIBUTE_IDS) {
      if (!defs.some((d) => d.key === key)) problems.push(`attribute "${key}" has no def (expected "${attributeDefId(key)}")`);
    }
    return problems;
  },
};

/** Registers an attribute def and returns it. Its shape is checked by `validateContent`. */
export function defineAttribute(def: AttributeDef): AttributeDef {
  return ATTRIBUTES.register(def);
}

export const ATTRIBUTE_BRAWN = defineAttribute({
  id: 'attribute.brawn',
  key: 'brawn',
  abbr: 'BRN',
  name: 'Brawn',
  description: 'Raw bodily power: how hard a blow lands and how much can be hauled out of the dark.',
  tags: [],
});

export const ATTRIBUTE_FINESSE = defineAttribute({
  id: 'attribute.finesse',
  key: 'finesse',
  abbr: 'FIN',
  name: 'Finesse',
  description: 'Sure hands and light feet: striking where it counts, and not being where the blow falls.',
  tags: [],
});

export const ATTRIBUTE_WITS = defineAttribute({
  id: 'attribute.wits',
  key: 'wits',
  abbr: 'WIT',
  name: 'Wits',
  description: 'A sharp, well-stocked mind, and the reservoir of power that spells and abilities draw on.',
  tags: [],
});

export const ATTRIBUTE_GRIT = defineAttribute({
  id: 'attribute.grit',
  key: 'grit',
  abbr: 'GRT',
  name: 'Grit',
  description: 'Stubborn endurance: how much punishment it takes before an adventurer falls.',
  tags: [],
});

/** The def for an attribute key. */
export function attributeDef(attribute: AttributeId): AttributeDef {
  return ATTRIBUTES.get(attributeDefId(attribute));
}
