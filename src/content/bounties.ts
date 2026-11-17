/**
 * Bounties: side quests from the bounty board and from encounters (CLAUDE.md §6, Quests). They never end a run.
 *
 * A placeholder kind (docs/ARCHITECTURE.md, Contracts): the registry, schema and `define`
 * helper exist so other work can refer to `bounty.*` ids, but there are no defs yet. The
 * fields and the first defs arrive with the bounty board item (M2): extend the type and the schema together.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

export type BountyDef = Def;

export const BOUNTIES = new Registry<BountyDef>('bounty');

export const BOUNTY_KIND: ContentKind<BountyDef> = {
  registry: BOUNTIES,
  schema: z.strictObject({
    ...defShape('bounty'),
  }),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineBounty(def: BountyDef): BountyDef {
  return BOUNTIES.register(def);
}
