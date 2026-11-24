/**
 * The contracts section (CLAUDE.md §2, step 7; ETH-024): which contracts the run takes on, one
 * per contract slot (`capacity(profile, 'contractSlots', BASE_CONTRACT_SLOTS)`; the Guild Hall's
 * Contract Board adds one). Victory needs every one complete and the party back out.
 *
 * A run always takes at least one contract: a choice left empty, or naming only contracts that
 * no longer exist or are locked, falls back to the first available one (Recover the relic).
 * Only one building quest (ETH-093, `buildingQuests.ts`) may be taken per run; it uses a slot.
 */
import { z } from 'zod';
import { CONTRACT_RECOVER_RELIC, CONTRACTS } from '../../content';
import type { ContractDef } from '../../content';
import { idSchema } from '../../content/schema';
import type { Profile } from '../profile';
import { capacity } from '../upgrades';
import { isAvailable } from './available';
import { buildingQuestRefusal, questOffer } from './buildingQuests';
import { defineRunChoice } from './choice';

/** Contract slots before any upgrade (CLAUDE.md §6: one to start). */
export const BASE_CONTRACT_SLOTS = 1;

export interface ContractsChoice {
  /** The chosen contract ids, in the order they were picked. */
  readonly contractIds: readonly string[];
}

/** How many contracts a run may take on with this profile. */
export function contractSlots(profile: Profile): number {
  return capacity(profile, 'contractSlots', BASE_CONTRACT_SLOTS);
}

/**
 * The contracts the player may pick from: those no upgrade keeps locked and, for a building quest
 * (ETH-093), whose building is still locked and whose offer share is met (`questOffer`).
 */
export function availableContracts(profile: Profile): ContractDef[] {
  return CONTRACTS.all().filter((def) => isAvailable(profile, def.id) && questOffer(profile, def).state === 'offered');
}

/** The building quests shown greyed in the list: their building is locked, but too little is bought yet. */
export function lockedBuildingQuests(profile: Profile): { def: ContractDef; need: string }[] {
  return CONTRACTS.all().flatMap((def) => {
    const offer = questOffer(profile, def);
    return offer.state === 'locked' ? [{ def, need: offer.need }] : [];
  });
}

/**
 * The contracts a run with this choice takes on: the chosen ones that exist and are available,
 * without repeats, at most one building quest (the first picked) and at most one per slot; if
 * none is left, the first available contract.
 */
export function chosenContracts(profile: Profile, choice: ContractsChoice): ContractDef[] {
  const open = availableContracts(profile);
  const picked: ContractDef[] = [];
  for (const id of choice.contractIds) {
    const def = open.find((d) => d.id === id);
    if (def !== undefined && !picked.includes(def) && buildingQuestRefusal(picked, def) === null) picked.push(def);
  }
  const chosen = picked.slice(0, contractSlots(profile));
  if (chosen.length === 0 && open[0] !== undefined) chosen.push(open[0]);
  return chosen;
}

export const CONTRACTS_CHOICE = defineRunChoice<ContractsChoice>({
  schema: z.object({ contractIds: z.array(idSchema('contract')).max(16) }),
  init: () => ({ contractIds: [CONTRACT_RECOVER_RELIC.id] }),
  apply: ({ profile, config }, choice) => {
    config.contracts = chosenContracts(profile, choice).map((d) => d.id);
  },
});
