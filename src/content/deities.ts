/**
 * Deities: patrons with a blessing, a taboo and a devotion tree (CLAUDE.md §6, Deities).
 *
 * A placeholder kind (docs/ARCHITECTURE.md, Contracts): the registry, schema and `define`
 * helper exist so other work can refer to `deity.*` ids, but there are no defs yet. The
 * fields and the first defs arrive with the deities item (M6): extend the type and the schema together.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

export type DeityDef = Def;

export const DEITIES = new Registry<DeityDef>('deity');

export const DEITY_KIND: ContentKind<DeityDef> = {
  registry: DEITIES,
  schema: z.strictObject({
    ...defShape('deity'),
  }),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineDeity(def: DeityDef): DeityDef {
  return DEITIES.register(def);
}
