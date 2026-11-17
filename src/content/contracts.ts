/**
 * Contracts: the main quests picked on the Prepare screen (CLAUDE.md §6, Quests). Victory needs every selected contract complete.
 *
 * A placeholder kind (docs/ARCHITECTURE.md, Contracts): the registry, schema and `define`
 * helper exist so other work can refer to `contract.*` ids, but there are no defs yet. The
 * fields and the first defs arrive with ETH-024 (contract model and Recover-relic): extend the type and the schema together.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape } from './schema';

export type ContractDef = Def;

export const CONTRACTS = new Registry<ContractDef>('contract');

export const CONTRACT_KIND: ContentKind<ContractDef> = {
  registry: CONTRACTS,
  schema: z.strictObject({
    ...defShape('contract'),
  }),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineContract(def: ContractDef): ContractDef {
  return CONTRACTS.register(def);
}
