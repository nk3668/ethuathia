import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { buildingNodes, groupNodes, UPGRADES } from '../../content';
import type { UpgradeNodeDef } from '../../content';
import { formatNumber } from '../../core';
import {
  canPurchase,
  describeGrant,
  formatCurrencies,
  nodeCost,
  nodeStatus,
  owns,
  respecFee,
  respecPlan,
  shortfall,
} from '../../meta';
import type { Currencies, NodeStatus, Profile } from '../../meta';
import { Button, Card, Tooltip } from '../kit';
import { cx } from '../kit/cx';
import { useProfileStore } from '../stores/profileStore';
import styles from './UpgradeTree.module.css';

/** Row height and gap of the graph in px. Set here once and passed to CSS, so edges line up. */
const ROW_HEIGHT = 60;
const ROW_GAP = 24;

/** How each status is named next to the node (never by color alone, VISUAL-DESIGN §5.2). */
const STATUS_TEXT: Readonly<Record<NodeStatus, string>> = {
  owned: 'Owned',
  available: 'Available',
  expensive: 'Too expensive',
  locked: 'Locked',
  excluded: 'Not chosen',
};

const STATUS_ICON: Readonly<Partial<Record<NodeStatus, string>>> = { owned: '✓', locked: '🔒' };

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export interface UpgradeTreeProps {
  /** The building whose tree to draw (`building.guild_hall`). */
  buildingId: string;
}

/**
 * A building's upgrade tree as a node graph (docs/VISUAL-DESIGN.md §5.2): one row per tier,
 * prerequisite lines between rows and an "or" between the nodes of a pick-one group. Every
 * node has a tooltip; selecting one shows its details with Buy and Respec below the graph.
 */
export function UpgradeTree({ buildingId }: UpgradeTreeProps) {
  const profile = useProfileStore((s) => s.profile);
  const [selected, setSelected] = useState<string | null>(null);
  const nodes = buildingNodes(buildingId);
  if (nodes.length === 0) return <p className={styles.empty}>Nothing to build here yet.</p>;

  const tiers = Math.max(...nodes.map((n) => n.tier));
  const columns = Math.max(...nodes.map((n) => n.column)) + 1;
  const height = tiers * ROW_HEIGHT + (tiers - 1) * ROW_GAP;
  const x = (column: number) => `${((column + 0.5) / columns) * 100}%`;
  const top = (tier: number) => (tier - 1) * (ROW_HEIGHT + ROW_GAP);
  const selectedNode = selected !== null && UPGRADES.has(selected) ? UPGRADES.get(selected) : null;
  const vars = { '--row-height': `${ROW_HEIGHT}px`, '--row-gap': `${ROW_GAP}px`, '--columns': columns } as CSSProperties;

  return (
    <div className={styles.tree}>
      <div className={styles.graphRow} style={vars}>
        <ol className={styles.tiers} aria-hidden="true">
          {Array.from({ length: tiers }, (_, i) => (
            <li key={i} className={styles.tierLabel}>
              {ROMAN[i] ?? i + 1}
            </li>
          ))}
        </ol>
        <div className={styles.graph} style={{ height }}>
          <svg className={styles.edges} aria-hidden="true" focusable="false">
            {nodes.flatMap((node) =>
              node.requires.filter(UPGRADES.has.bind(UPGRADES)).map((reqId) => {
                const req = UPGRADES.get(reqId);
                return (
                  <line
                    key={`${reqId}>${node.id}`}
                    x1={x(req.column)}
                    y1={top(req.tier) + ROW_HEIGHT}
                    x2={x(node.column)}
                    y2={top(node.tier)}
                    className={cx(styles.edge, owns(profile, reqId) && styles.edgeOpen)}
                  />
                );
              }),
            )}
          </svg>
          {orMarks(nodes).map(({ key, tier, column }) => (
            <span
              key={key}
              aria-hidden="true"
              className={styles.or}
              style={{ left: `${(column / columns) * 100}%`, top: top(tier) + ROW_HEIGHT / 2 }}
            >
              or
            </span>
          ))}
          <ul className={styles.nodes} aria-label="Upgrades">
            {nodes.map((node) => (
              <li key={node.id} style={{ gridRow: node.tier, gridColumn: node.column + 1 }} className={styles.cell}>
                <TreeNode
                  node={node}
                  profile={profile}
                  selected={node.id === selected}
                  onSelect={() => setSelected(node.id === selected ? null : node.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
      {selectedNode ? (
        <NodeDetail node={selectedNode} profile={profile} />
      ) : (
        <p className={styles.hint}>Select an upgrade to see what it does and buy it.</p>
      )}
    </div>
  );
}

/** Where to draw "or": between neighbouring nodes of the same pick-one group on a row. */
function orMarks(nodes: readonly UpgradeNodeDef[]): { key: string; tier: number; column: number }[] {
  const marks: { key: string; tier: number; column: number }[] = [];
  for (const node of nodes) {
    if (node.exclusiveGroup === undefined) continue;
    const right = nodes.find(
      (n) => n.exclusiveGroup === node.exclusiveGroup && n.tier === node.tier && n.column === node.column + 1,
    );
    if (right) marks.push({ key: `${node.id}|${right.id}`, tier: node.tier, column: right.column });
  }
  return marks;
}

interface TreeNodeProps {
  node: UpgradeNodeDef;
  profile: Profile;
  selected: boolean;
  onSelect(): void;
}

function TreeNode({ node, profile, selected, onSelect }: TreeNodeProps) {
  const status = nodeStatus(profile, node.id);
  const icon = STATUS_ICON[status];
  return (
    <Tooltip placement="bottom" content={<NodeTooltip node={node} profile={profile} status={status} />}>
      <button
        type="button"
        aria-pressed={selected}
        data-status={status}
        className={cx(styles.node, styles[status], selected && styles.selected)}
        onClick={onSelect}
      >
        <span className={styles.nodeName}>
          {icon !== undefined && (
            <span aria-hidden="true" className={styles.icon}>
              {icon}
            </span>
          )}
          <span className={styles.name}>{node.name}</span>
        </span>
        <span className="sr-only">({STATUS_TEXT[status]})</span>
        {status !== 'owned' && <Cost cost={nodeCost(node)} short={status === 'expensive' ? shortfall(profile.currencies, nodeCost(node)) : null} />}
      </button>
    </Tooltip>
  );
}

/** A compact price: "♛ 120", with any part the player can't pay in the danger color and marked. */
function Cost({ cost, short }: { cost: Currencies; short: Currencies | null }) {
  const parts: ReactNode[] = [];
  const part = (key: string, icon: string, tone: string | undefined, n: number, lacking: boolean, label: string) =>
    parts.push(
      <span key={key} className={cx(styles.costPart, lacking && styles.lacking)}>
        <span aria-hidden="true" className={tone}>
          {icon}
        </span>
        <span className="sr-only">{label}</span> {formatNumber(n)}
        {lacking && <span className="sr-only"> (not enough)</span>}
      </span>,
    );
  if (cost.renown > 0) part('renown', '♛', styles.renown, cost.renown, (short?.renown ?? 0) > 0, 'Renown');
  if (cost.trophies > 0) part('trophies', '☠', styles.trophies, cost.trophies, (short?.trophies ?? 0) > 0, 'Trophies');
  for (const [deity, n] of Object.entries(cost.favor)) {
    part(deity, '♨', styles.favor, n, (short?.favor[deity] ?? 0) > 0, 'Favor');
  }
  return <span className={styles.cost}>{parts}</span>;
}

/** The facts every node shows, in its tooltip and its detail card. */
function NodeFacts({ node, profile }: { node: UpgradeNodeDef; profile: Profile }) {
  const group = node.exclusiveGroup;
  const rivals = group === undefined ? [] : groupNodes(group).filter((n) => n.id !== node.id);
  return (
    <dl className={styles.facts}>
      <dt>Effect</dt>
      <dd>{node.grants.map(describeGrant).join('; ')}</dd>
      <dt>Cost</dt>
      <dd>{formatCurrencies(nodeCost(node))}</dd>
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
            Instead of {rivals.map((n) => n.name).join(' or ')}. Switching later costs a respec fee of{' '}
            {formatCurrencies(respecFee(node))}.
          </dd>
        </>
      )}
    </dl>
  );
}

function NodeTooltip({ node, profile, status }: { node: UpgradeNodeDef; profile: Profile; status: NodeStatus }) {
  const check = canPurchase(profile, node.id);
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>
        <strong>{node.name}</strong> · {STATUS_TEXT[status]}
      </p>
      <NodeFacts node={node} profile={profile} />
      {!check.ok && status !== 'owned' && <p className={styles.reason}>{check.reason}</p>}
    </div>
  );
}

function NodeDetail({ node, profile }: { node: UpgradeNodeDef; profile: Profile }) {
  const buy = useProfileStore((s) => s.purchase);
  const doRespec = useProfileStore((s) => s.respec);
  const status = nodeStatus(profile, node.id);
  const check = canPurchase(profile, node.id);
  const group = node.exclusiveGroup;
  const plan = group !== undefined ? respecPlan(profile, group) : null;
  const showRespec = plan !== null && (status === 'owned' || status === 'excluded');

  return (
    <Card className={styles.detail} aria-label={`${node.name} details`} role="region">
      <p className={styles.detailTitle}>
        <strong>{node.name}</strong>
        <span className={styles.detailStatus}>
          {STATUS_ICON[status] !== undefined && <span aria-hidden="true">{STATUS_ICON[status]} </span>}
          {STATUS_TEXT[status]}
        </span>
      </p>
      <p className={styles.description}>{node.description}</p>
      <NodeFacts node={node} profile={profile} />
      {!check.ok && status !== 'owned' && <p className={styles.reason}>{check.reason}</p>}
      <div className={styles.actions}>
        {status !== 'owned' && status !== 'excluded' && (
          <Button variant="primary" disabled={!check.ok} onClick={() => buy(node.id)}>
            Buy for {formatCurrencies(nodeCost(node))}
          </Button>
        )}
        {showRespec && (
          <Button onClick={() => doRespec(plan.group)}>
            Respec: give up {UPGRADES.get(plan.chosen).name}
          </Button>
        )}
      </div>
      {showRespec && (
        <p className={styles.respecNote}>
          Respec gives up {plan.removed.map((id) => UPGRADES.get(id).name).join(', ')} and pays back{' '}
          {formatCurrencies(plan.refund)}, less a fee of {formatCurrencies(plan.fee)}.
        </p>
      )}
    </Card>
  );
}
