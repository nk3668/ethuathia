/** Codex view of contracts (main quests, ETH-024): what is asked and what it pays. */
import { BUILDINGS, CONTRACTS, opensBuilding, opensTier, tierBand } from '../../../content';
import type { ContractDef } from '../../../content';
import { describeObjective } from '../../../sim';
import { rewardText } from '../../shell/logText/quests';
import { defineCodexRenderer } from '../types';

/** What a building quest opens: "Smithy", or for a tier quest "Smithy, tier 2". */
function opensText(def: ContractDef): string {
  const id = opensBuilding(def) ?? '';
  if (!BUILDINGS.has(id)) return id;
  const building = BUILDINGS.get(id);
  const tier = opensTier(def);
  return tier === undefined ? building.name : `${building.name}, tier ${tierBand(building, tier)}`;
}

export default defineCodexRenderer({
  registry: CONTRACTS,
  label: 'Contracts',
  order: 100,
  // The Prepare screen lists every contract, so the Codex knows them all.
  alwaysKnown: true,
  fields: (def) => [
    // The objective engine words every objective kind (ETH-114).
    { label: 'Objective', value: describeObjective(def.objective), hint: 'What completes the contract.', key: true },
    ...(def.opens === undefined
      ? []
      : [
          {
            label: 'Opens',
            value: opensText(def),
            hint: 'A building quest: completing it and walking out of the dungeon opens this Town building, or the next tier of its upgrades. Only one building quest can be taken per run.',
            key: true,
          },
        ]),
    {
      label: 'Reward',
      value: rewardText(def.reward),
      hint: 'Paid into the run’s at-risk total when the contract is complete. A wipe loses a share of it.',
      key: true,
    },
  ],
});
