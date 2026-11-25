/**
 * What the town gives this run (ETH-064): every active upgrade's party/run bundles, start perks,
 * and run capacities (XP, contract pay, trade bonus, rations) that `buildRunConfig` applies.
 * Read-only; the Town tab is where they are bought.
 */
import { maxRank } from '../../../content';
import type { UpgradeNodeDef } from '../../../content';
import { describeGrant, ownedNodes, rankOf, withOptIns } from '../../../meta';
import { Explain } from '../../codex/Explain';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

const RUN_CAPACITIES = new Set(['tradeBonus', 'contractRewardBonus', 'fieldRations', 'xpBonus']);

function runGrants(node: UpgradeNodeDef) {
  return node.grants.filter((g) => g.kind === 'bundle' || g.kind === 'start' || (g.kind === 'capacity' && RUN_CAPACITIES.has(g.key)));
}

export function TownPanel({ profile, choices }: PreparePanelProps) {
  const active = withOptIns(profile, choices.optIns);
  const nodes = ownedNodes(active).filter((node) => runGrants(node).length > 0);
  if (nodes.length === 0) {
    return <p className={styles.note}>No town upgrades strengthen the party yet. The Town tab has them.</p>;
  }
  return (
    <ul className={styles.list}>
      {nodes.map((node) => {
        const rank = rankOf(active, node.id);
        return (
          <li key={node.id}>
            <Explain id={node.id} />
            <span className={styles.note}>
              {' '}
              {runGrants(node)
                .map((g) => describeGrant(g, rank))
                .join('; ')}
              {maxRank(node) > 1 && ` (rank ${rank}/${maxRank(node)})`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
