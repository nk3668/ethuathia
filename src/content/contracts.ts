/**
 * Contracts: the main quests picked on the Prepare screen (CLAUDE.md §6, Quests). Victory needs
 * every selected contract complete and the party back out of the dungeon (ETH-024).
 *
 * A contract def says what is asked (`objective`, by `kind` with that kind's parameters) and what
 * completing it pays (`reward`, currency id → amount, paid into the run's at-risk total the moment
 * it completes). The sim's quests domain (`src/sim/quests/`) gives each objective kind its
 * meaning. Kinds so far:
 *
 * - `recover`: an item (`item`, a `relic` category item) lies on the dungeon's bottom floor; the
 *   contract is complete while a living party member carries it.
 *
 * Later kinds (ETH-026 slay, ETH-027 gather and delve, ETH-032 rescue) add a member to
 * `ContractObjective` and an option to `objectiveSchema`, then their meaning in the quests domain.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { defineItem } from './items';
import type { ContentKind, ContentRef } from './kind';
import { defShape, idSchema, positiveInt } from './schema';
import { CURRENCY_KEY } from './upgrades';

/** Recover an item placed on the bottom floor and carry it out. */
export interface RecoverObjective {
  readonly kind: 'recover';
  /** The item to recover (an `item.*` id of category `relic`). */
  readonly item: string;
}

/** What a contract asks for. One member per objective kind. */
export type ContractObjective = RecoverObjective;

/** Every objective kind, for the Codex and tooltips. */
export const OBJECTIVE_KINDS = ['recover'] as const;
export type ObjectiveKind = (typeof OBJECTIVE_KINDS)[number];

export interface ContractDef extends Def {
  readonly objective: ContractObjective;
  /**
   * What completing it pays into the run's at-risk total: currency id (`renown`, `trophies`,
   * `favor:deity.<id>`) → amount. Like every at-risk earning, a wipe loses a share of it (§3).
   */
  readonly reward: Readonly<Record<string, number>>;
}

export const CONTRACTS = new Registry<ContractDef>('contract');

const objectiveSchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('recover'), item: idSchema('item') })]);

export const CONTRACT_KIND: ContentKind<ContractDef> = {
  registry: CONTRACTS,
  schema: z.strictObject({
    ...defShape('contract'),
    objective: objectiveSchema,
    reward: z
      .record(z.string().regex(CURRENCY_KEY, 'must be renown, trophies or favor:deity.<id>'), positiveInt)
      .refine((reward) => Object.keys(reward).length > 0, 'must pay something'),
  }),
  refs: (def) => {
    const refs: ContentRef[] = [{ path: 'objective.item', kind: 'item', id: def.objective.item }];
    for (const key of Object.keys(def.reward)) {
      if (key.startsWith('favor:')) refs.push({ path: `reward.${key}`, kind: 'deity', id: key.slice('favor:'.length) });
    }
    return refs;
  },
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineContract(def: ContractDef): ContractDef {
  return CONTRACTS.register(def);
}

// ---------------------------------------------------------------------------------------------
// The first contract (original names and text)

/** The relic the first contract asks for. Placed only by that contract, never by loot. */
export const ITEM_EMBER_RELIQUARY = defineItem({
  id: 'item.ember_reliquary',
  name: 'Ember Reliquary',
  description:
    'A palm-sized casket of blackened bronze, warm to the touch, with a coal-red glow behind its lattice. ' +
    'The town wants it back from the bottom of the dungeon. It is never dropped.',
  tags: ['relic', 'contract'],
  glyph: { ch: '&', color: '#ffb347', bold: true },
  category: 'relic',
  weight: 3,
  value: 0,
});

/** Recover the relic (CLAUDE.md §6): fetch the Ember Reliquary from the bottom floor and walk out with it. */
export const CONTRACT_RECOVER_RELIC = defineContract({
  id: 'contract.recover_relic',
  name: 'Recover the relic',
  description:
    'The Ember Reliquary lies somewhere on the bottom floor of the dungeon. Find it, carry it, and walk back out ' +
    'of the dungeon with it. If its bearer falls, the contract is no longer complete.',
  tags: ['contract'],
  objective: { kind: 'recover', item: ITEM_EMBER_RELIQUARY.id },
  reward: { renown: 100 },
});
