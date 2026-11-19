/** Log wording for the quests domain's events (`src/sim/quests/`). One entry per event type. */
import { formatNumber } from '../../../core';
import type { QuestsEvent, RewardAmounts } from '../../../sim';
import { currencyName } from '../runSummaryText';
import { defineHighlight, mention } from './types';
import type { LogPart, LogTextRecord } from './types';

/** A contract is complete. */
export const HIGHLIGHT_CONTRACT_COMPLETE = defineHighlight({
  id: 'contractComplete',
  label: 'A contract is complete',
  description: 'The party completes one of the contracts it took on, such as picking up the relic.',
});

/** "100 Renown", "100 Renown and 20 Trophies". */
export function rewardText(reward: RewardAmounts): string {
  const parts = Object.entries(reward).map(([key, amount]) => `${formatNumber(amount)} ${currencyName(key)}`);
  if (parts.length === 0) return 'nothing';
  return parts.length === 1 ? (parts[0] as string) : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) as string}`;
}

function contractList(contracts: readonly { contract: string; reward: RewardAmounts }[]): LogPart[] {
  const out: LogPart[] = [];
  contracts.forEach((c, i) => {
    if (i > 0) out.push(i === contracts.length - 1 ? ' and ' : ', ');
    out.push(mention(c.contract), ` (${rewardText(c.reward)})`);
  });
  return out;
}

export const QUESTS_LOG_TEXT: LogTextRecord<QuestsEvent> = {
  contractsTaken: {
    category: 'system',
    text: (e) => [e.contracts.length === 1 ? 'Contract: ' : 'Contracts: ', ...contractList(e.contracts), '.'],
  },
  contractProgress: {
    category: 'discovery',
    text: (e) => [mention(e.contract), `: ${e.current} of ${e.target}.`],
  },
  contractCompleted: {
    category: 'loot',
    highlight: HIGHLIGHT_CONTRACT_COMPLETE,
    text: (e, nameOf) => [
      'Contract complete: ',
      mention(e.contract),
      e.actor === null ? '' : ` (${nameOf(e.actor)})`,
      `. ${rewardText(e.reward)} at risk until the party is out.`,
    ],
  },
  contractLost: {
    category: 'combat',
    text: (e) => [mention(e.contract), ' is no longer complete: its bearer has fallen.'],
  },
};
