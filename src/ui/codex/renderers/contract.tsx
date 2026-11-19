/** Codex view of contracts (main quests, ETH-024): what is asked and what it pays. */
import { CONTRACTS, findDef } from '../../../content';
import type { ContractDef } from '../../../content';
import { rewardText } from '../../shell/logText/quests';
import { defineCodexRenderer } from '../types';

function objectiveText(def: ContractDef): string {
  switch (def.objective.kind) {
    case 'recover':
      return `Find the ${findDef(def.objective.item)?.name ?? def.objective.item} on the bottom floor and carry it out`;
  }
}

export default defineCodexRenderer({
  registry: CONTRACTS,
  label: 'Contracts',
  order: 100,
  // The Prepare screen lists every contract, so the Codex knows them all.
  alwaysKnown: true,
  fields: (def) => [
    { label: 'Objective', value: objectiveText(def), hint: 'What completes the contract.', key: true },
    {
      label: 'Reward',
      value: rewardText(def.reward),
      hint: 'Paid into the run’s at-risk total when the contract is complete. A wipe loses a share of it.',
      key: true,
    },
  ],
});
