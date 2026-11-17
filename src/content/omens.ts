/**
 * Omens: opt-in difficulty modifiers with ranks, each rank raising the reward multiplier (CLAUDE.md §6, Omens).
 *
 * A placeholder kind (docs/ARCHITECTURE.md, Contracts): the registry, schema and `define`
 * helper exist so other work can refer to `omen.*` ids, but there are no defs yet. The
 * fields and the first defs arrive with the Omens item (M4): extend the type and the schema together.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

export type OmenDef = Def;

export const OMENS = new Registry<OmenDef>('omen');

export const OMEN_KIND: ContentKind<OmenDef> = {
  registry: OMENS,
  schema: z.strictObject({
    ...defShape('omen'),
  }),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineOmen(def: OmenDef): OmenDef {
  return OMENS.register(def);
}
