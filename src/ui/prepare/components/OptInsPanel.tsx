/**
 * The opt-ins panel (ETH-187): one checkbox for each owned opt-in upgrade node (a Guild Hall or
 * Smithy node that does nothing until switched on for a run). All start off. The panel is left out
 * while no opt-in node is owned (`optIns` panel's `shown`).
 */
import { maxRank } from '../../../content';
import { describeGrant, optInNodes, rankOf } from '../../../meta';
import { Explain } from '../../codex/Explain';
import styles from '../panels.module.css';
import type { PreparePanelProps } from '../types';

export function OptInsPanel({ profile, choices, update }: PreparePanelProps) {
  const nodes = optInNodes(profile);
  const enabled = choices.optIns.enabled;
  const toggle = (id: string, on: boolean) => {
    const rest = enabled.filter((e) => e !== id);
    update('optIns', { enabled: on ? [...rest, id] : rest });
  };
  return (
    <fieldset className={styles.choices}>
      <legend className={styles.label}>Optional upgrades · off unless ticked</legend>
      {nodes.map((node) => {
        const rank = rankOf(profile, node.id);
        return (
          <label key={node.id} className={styles.choice}>
            <input type="checkbox" name="prepare-opt-ins" value={node.id} checked={enabled.includes(node.id)} onChange={(e) => toggle(node.id, e.currentTarget.checked)} />
            <span className={styles.choiceText}>
              <span className={styles.choiceName}>
                <Explain id={node.id} />
              </span>
              <span className={styles.note}>
                {node.grants.map((g) => describeGrant(g, rank)).join('; ')}
                {maxRank(node) > 1 && ` (rank ${rank}/${maxRank(node)})`}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
