/** The Codex row for a class or race the Town sells (ETH-036): how it is revealed and what it costs. */
import { BUILDINGS, defName, describeMilestone, UPGRADES } from '../../content';
import { formatCurrencies, nodeCost } from '../../meta';
import { describeRequirement } from '../../sim';
import type { CodexField } from './types';

/**
 * The "Training" row for `id`, or nothing if no upgrade sells it (the Vanguard and Human are open
 * from the start). Content alone, so it reads the same for every player: how a run reveals it, and
 * which building sells it at what price.
 */
export function trainingFields(id: string): CodexField[] {
  const node = UPGRADES.all().find((n) => n.grants.some((g) => g.kind === 'unlock' && g.id === id));
  if (node === undefined) return [];
  const building = BUILDINGS.has(node.building) ? BUILDINGS.get(node.building).name : node.building;
  const reveal = node.reveal === undefined ? 'Open to buy from the start' : describeMilestone(node.reveal, describeRequirement, defName);
  return [
    {
      label: 'Training',
      value: `${reveal}. Then bought at the ${building} for ${formatCurrencies(nodeCost(node))}.`,
      hint:
        'A run reveals this when its goal is met; the town sells it after that. Until it is bought, it can only turn up ' +
        'as an occasional random recruit ("Not yet trained by the guild"), and its Mastery still counts.',
      key: true,
    },
  ];
}
