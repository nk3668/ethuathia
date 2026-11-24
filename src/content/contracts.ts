/**
 * Contracts: the main quests picked on the Prepare screen (CLAUDE.md §6, Quests). Victory needs
 * every selected contract complete and the party back out of the dungeon (ETH-024).
 *
 * A contract def says what is asked (`objective`, by `kind` with that kind's parameters) and what
 * completing it pays (`reward`, currency id → amount, paid into the run's at-risk total the moment
 * it completes). The sim's quests domain (`src/sim/quests/`) gives each objective kind its
 * meaning. Kinds so far:
 *
 * - `recover`: an item (`item`, a `relic` category item) lies on the dungeon's bottom floor, or on
 *   floor `depth` (ETH-093); the contract is complete while a living party member carries it.
 *
 * A **building quest** (ETH-093) is a contract with `opens`: the Town building it opens. That
 * building's `unlock` is the matching `objectiveDone` milestone with `exited: true`. The building
 * quests themselves live in `buildingQuests.ts`.
 *
 * The objective is the shared `Objective` (ETH-114, `objectives.ts`), measured by the sim's
 * objective engine. Later contract types (ETH-026 slay, ETH-027 gather and delve, ETH-032 rescue)
 * add an objective kind there and, if they place something, a floor plan hook.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { defineItem } from './items';
import type { ContentKind, ContentRef } from './kind';
import { objectiveRefs, objectiveSchema } from './objectives';
import type { Objective } from './objectives';
import { DUNGEONS } from './dungeons';
import { defShape, idSchema, positiveInt } from './schema';
import { BUILDINGS, CURRENCY_KEY } from './upgrades';

/**
 * What a contract asks for: an objective (ETH-114, `src/content/objectives.ts`). Kept as a name
 * for the contract's own code; any objective kind works, though only `recover` places something.
 */
export type ContractObjective = Objective;

export interface ContractDef extends Def {
  readonly objective: ContractObjective;
  /**
   * What completing it pays into the run's at-risk total: currency id (`renown`, `trophies`,
   * `favor:deity.<id>`) → amount. Like every at-risk earning, a wipe loses a share of it (§3).
   */
  readonly reward: Readonly<Record<string, number>>;
  /**
   * The Town building this is the quest for (a `building.*` id), making it a building quest
   * (ETH-093): offered while that building is locked and enough of the open buildings' upgrades are
   * bought (`offerAt`), and only one building quest may be taken per run. The building's `unlock`
   * must be the `objectiveDone` milestone (`exited: true`) on this contract.
   */
  readonly opens?: string;
  /**
   * For a building quest: the share (0 to 1) of the open buildings' upgrade nodes that has to be
   * bought before it is offered. Default `BUILDING_QUEST_SHARE`; the first quest asks for none.
   */
  readonly offerAt?: number;
  /** For a building quest: what the party did, for the run summary's unlock line ("you brought the anvil home"). */
  readonly openedText?: string;
}

/** The share of the open buildings' nodes that must be bought before a later building's quest is offered (ETH-093). ETH-161 tunes it. */
export const BUILDING_QUEST_SHARE = 0.3;

/** The share a building quest asks for before it is offered: its `offerAt`, or `BUILDING_QUEST_SHARE`. */
export function offerShare(def: ContractDef): number {
  return def.offerAt ?? BUILDING_QUEST_SHARE;
}

/** True for a building quest: a contract that opens a Town building. */
export function isBuildingQuest(def: ContractDef): boolean {
  return def.opens !== undefined;
}

/** The floor a contract asks for, if it names one: a `recover` item's `depth` or a `reach` objective's. */
export function contractFloor(def: ContractDef): number | undefined {
  const { objective } = def;
  if (objective.kind === 'recover') return objective.depth;
  return objective.kind === 'reach' ? objective.depth : undefined;
}

/**
 * Building quests have to stay doable as dungeons change (ETH-093): the floor one asks for is no
 * deeper than the shallowest dungeon the player could take it into, and the building it opens
 * names it as its unlock (and the other way round).
 */
export function checkBuildingQuests(defs: readonly ContractDef[]): string[] {
  const problems: string[] = [];
  const shallowest = Math.min(...DUNGEONS.all().map((d) => d.depth.min));
  for (const def of defs) {
    if (def.opens === undefined) continue;
    const label = `contract "${def.id}"`;
    const floor = contractFloor(def);
    if (floor !== undefined && floor > shallowest) {
      problems.push(`${label}: asks for floor ${floor}, but a dungeon can be as shallow as ${shallowest} floors, so the quest could not always be done`);
    }
    const building = BUILDINGS.has(def.opens) ? BUILDINGS.get(def.opens) : undefined;
    if (building === undefined) continue; // an unknown id is reported by the ref check
    const u = building.unlock;
    if (u?.kind !== 'objectiveDone' || u.owner.kind !== 'contract' || u.owner.id !== def.id || u.exited !== true) {
      problems.push(`${label}: opens "${building.id}", whose unlock must be an objectiveDone milestone on this contract with exited: true`);
    }
  }
  for (const building of BUILDINGS.all()) {
    const u = building.unlock;
    if (u?.kind !== 'objectiveDone' || u.owner.kind !== 'contract' || !CONTRACTS.has(u.owner.id)) continue;
    if (CONTRACTS.get(u.owner.id).opens !== building.id) {
      problems.push(`building "${building.id}": unlocked by "${u.owner.id}", which does not say it opens this building (\`opens\`)`);
    }
  }
  return problems;
}

export const CONTRACTS = new Registry<ContractDef>('contract');

export const CONTRACT_KIND: ContentKind<ContractDef> = {
  registry: CONTRACTS,
  schema: z.strictObject({
    ...defShape('contract'),
    objective: objectiveSchema,
    reward: z
      .record(z.string().regex(CURRENCY_KEY, 'must be renown, trophies or favor:deity.<id>'), positiveInt)
      .refine((reward) => Object.keys(reward).length > 0, 'must pay something'),
    opens: idSchema('building').optional(),
    offerAt: z.number().min(0, 'must be 0 to 1').max(1, 'must be 0 to 1').optional(),
    openedText: z.string().trim().min(1, 'must not be empty').optional(),
  }),
  check: checkBuildingQuests,
  refs: (def) => {
    const refs: ContentRef[] = objectiveRefs('objective', def.objective);
    if (def.opens !== undefined) refs.push({ path: 'opens', kind: 'building', id: def.opens });
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
  hint: 'A coal-warm bronze casket waiting on the lowest floor.',
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
  hint: 'A guild writ to bring a lost bronze reliquary back from the bottom floor.',
  tags: ['contract'],
  objective: { kind: 'recover', item: ITEM_EMBER_RELIQUARY.id },
  reward: { renown: 100 },
});
