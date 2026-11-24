import { groupNodes, maxRank, UPGRADE_HELP, UPGRADES } from '../../content';
import type { UpgradeNodeDef } from '../../content';
import { canPurchase, describeGrant, formatCurrencies, nextRankCost, owns, rankCost, rankOf, respecFee } from '../../meta';
import type { NodeStatus, Profile } from '../../meta';
import { feeText, roman, STATUS_TEXT } from './nodeText';
import styles from './UpgradeTree.module.css';

/** The node's effect in words with `times` ranks stacked. */
function effectText(node: UpgradeNodeDef, times: number): string {
  return node.grants.map((g) => describeGrant(g, times)).join('; ');
}

/** The facts every node shows, in its tooltip and its detail card. A ranked node adds its ranks. */
export function NodeFacts({ node, profile }: { node: UpgradeNodeDef; profile: Profile }) {
  const group = node.exclusiveGroup;
  const rivals = group === undefined ? [] : groupNodes(group).filter((n) => n.id !== node.id);
  const max = maxRank(node);
  const rank = rankOf(profile, node.id);
  const next = nextRankCost(profile, node.id);
  return (
    <dl className={styles.facts}>
      {max > 1 ? (
        <>
          <dt>Rank</dt>
          <dd>
            {rank} of {max}
            {rank === max && ' (maxed)'}
          </dd>
          <dt>Effect now</dt>
          <dd>{rank === 0 ? 'None yet' : effectText(node, rank)}</dd>
          {next !== null && (
            <>
              <dt>Next rank</dt>
              <dd>
                {roman(rank + 1)}: {effectText(node, rank + 1)} for {formatCurrencies(next)}
              </dd>
            </>
          )}
          <dt>All ranks</dt>
          <dd>
            {Array.from({ length: max }, (_, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                {i + 1 <= rank ? '✓ ' : ''}
                {roman(i + 1)} {formatCurrencies(rankCost(node, i + 1))}
              </span>
            ))}
          </dd>
        </>
      ) : (
        <>
          <dt>Effect</dt>
          <dd>{effectText(node, 1)}</dd>
          <dt>Cost</dt>
          <dd>{formatCurrencies(rankCost(node, 1))}</dd>
        </>
      )}
      <dt>Requires</dt>
      <dd>
        {node.requires.length === 0
          ? 'Nothing'
          : node.requires.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                {UPGRADES.has(id) ? UPGRADES.get(id).name : id} {owns(profile, id) ? '(✓ owned)' : '(not owned)'}
              </span>
            ))}
      </dd>
      {rivals.length > 0 && (
        <>
          <dt>Pick one</dt>
          <dd>
            Instead of {rivals.map((n) => n.name).join(' or ')}. Switching later between runs has{' '}
            {feeText(respecFee(node, {}, Math.max(1, rank)))}.
          </dd>
        </>
      )}
    </dl>
  );
}

export function NodeTooltip({ node, profile, status }: { node: UpgradeNodeDef; profile: Profile; status: NodeStatus }) {
  const check = canPurchase(profile, node.id);
  const rank = rankOf(profile, node.id);
  const ranked = maxRank(node) > 1;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>
        <strong>
          {node.name}
          {ranked && rank > 0 ? ` ${roman(rank)}` : ''}
        </strong>{' '}
        · {STATUS_TEXT[status]}
      </p>
      <NodeFacts node={node} profile={profile} />
      {!check.ok && status !== 'owned' && <p className={styles.reason}>{check.reason}</p>}
      {ranked && (
        <p className={styles.help}>
          {UPGRADE_HELP.ranks.name}: {UPGRADE_HELP.ranks.about}
        </p>
      )}
    </div>
  );
}
