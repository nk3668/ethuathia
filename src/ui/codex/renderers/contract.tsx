/** Codex view of contracts (main quests, ETH-024): what is asked and what it pays. */
import { CONTRACTS } from '../../../content';
import { describeObjective } from '../../../sim';
import { rewardText } from '../../shell/logText/quests';
import { defineCodexRenderer } from '../types';

export default defineCodexRenderer({
  registry: CONTRACTS,
  label: 'Contracts',
  order: 100,
  // The Prepare screen lists every contract, so the Codex knows them all.
  alwaysKnown: true,
  fields: (def) => [
    // The objective engine words every objective kind (ETH-114).
    { label: 'Objective', value: describeObjective(def.objective), hint: 'What completes the contract.', key: true },
    {
      label: 'Reward',
      value: rewardText(def.reward),
      hint: 'Paid into the run’s at-risk total when the contract is complete. A wipe loses a share of it.',
      key: true,
    },
  ],
});
