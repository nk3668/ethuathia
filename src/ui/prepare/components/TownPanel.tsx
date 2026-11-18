/**
 * What the town gives this run (ETH-064): every owned upgrade's party bundle, which
 * `buildRunConfig` attaches to each adventurer. Read-only; the Town tab is where they are bought.
 */
import { UPGRADES } from '../../../content';
import { describeGrant, upgradePartyBundles } from '../../../meta';
import { Explain } from '../../codex/Explain';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

export function TownPanel({ profile }: PreparePanelProps) {
  const nodes = upgradePartyBundles(profile).map((id) => UPGRADES.get(id));
  if (nodes.length === 0) {
    return <p className={styles.note}>No town upgrades strengthen the party yet. The Town tab has them.</p>;
  }
  return (
    <ul className={styles.list}>
      {nodes.map((node) => (
        <li key={node.id}>
          <Explain id={node.id} />
          <span className={styles.note}>
            {' '}
            {node.grants
              .filter((g) => g.kind === 'bundle' && g.scope === 'party')
              .map(describeGrant)
              .join('; ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

