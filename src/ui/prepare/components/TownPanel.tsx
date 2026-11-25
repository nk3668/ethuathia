/**
 * What the town gives this run (ETH-064): every owned upgrade's party bundle, which
 * `buildRunConfig` attaches to each adventurer. Read-only; the Town tab is where they are bought.
 */
import { UPGRADES, maxRank } from '../../../content';
import { describeGrant, rankOf, upgradePartyBundles, withOptIns } from '../../../meta';
import { Explain } from '../../codex/Explain';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

export function TownPanel({ profile, choices }: PreparePanelProps) {
  // A ranked node is listed once per rank; show it once with its rank.
  const nodes = [...new Set(upgradePartyBundles(withOptIns(profile, choices.optIns)))].map((id) => UPGRADES.get(id));
  if (nodes.length === 0) {
    return <p className={styles.note}>No town upgrades strengthen the party yet. The Town tab has them.</p>;
  }
  return (
    <ul className={styles.list}>
      {nodes.map((node) => {
        const rank = rankOf(profile, node.id);
        return (
          <li key={node.id}>
            <Explain id={node.id} />
            <span className={styles.note}>
              {' '}
              {node.grants
                .filter((g) => g.kind === 'bundle' && g.scope === 'party')
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
