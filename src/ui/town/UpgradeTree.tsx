import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { BUILDINGS, buildingNodes, CONTRACTS, maxRank, opensBuilding, opensTier, tierBand, tierGateId, TREE_KIND_INFO, UPGRADE_HELP, UPGRADES } from '../../content';
import type { TierGate, UpgradeNodeDef } from '../../content';
import { formatNumber } from '../../core';
import {
  canPurchase,
  closedGates,
  describeGate,
  formatCurrencies,
  gateGoal,
  nextRankCost,
  nodeCost,
  nodeStatus,
  latestUnlocks,
  owns,
  questOffer,
  rankOf,
  respecBlock,
  respecPlan,
  resetPlan,
  shortfall,
} from '../../meta';
import type { Currencies, NodeStatus, Profile } from '../../meta';
import { Button, Card, Tooltip } from '../kit';
import { cx } from '../kit/cx';
import { useProfileStore } from '../stores/profileStore';
import { useRunActive } from '../stores/runStore';
import { NodeFacts, NodeTooltip } from './NodeFacts';
import { feeText, roman, STATUS_TEXT } from './nodeText';
import styles from './UpgradeTree.module.css';

/** Row height and gap of the graph in px. Set here once and passed to CSS, so edges line up. */
const ROW_HEIGHT = 60;
const ROW_GAP = 24;

const STATUS_ICON: Readonly<Partial<Record<NodeStatus, string>>> = { owned: '✓', locked: '🔒' };

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
  // The bands the latest run opened (ETH-170): their tier labels and a note say so.
  const building = BUILDINGS.get(buildingId);
  const freshIds = new Set(latestUnlocks(profile).map((u) => u.id));
  const freshBands = (building.tierGates ?? []).filter((g) => freshIds.has(tierGateId(buildingId, g.fromTier))).map((g) => tierBand(building, g.fromTier));
  const selectedNode = selected !== null && UPGRADES.has(selected) ? UPGRADES.get(selected) : null;
  const vars = { '--row-height': `${ROW_HEIGHT}px`, '--row-gap': `${ROW_GAP}px`, '--columns': columns } as CSSProperties;

  return (
    <div className={styles.tree}>
      <TreeHeader buildingId={buildingId} profile={profile} />
      {freshBands.length > 0 && (
        <p className={styles.hint}>
          <span className={styles.fresh}>New</span> {freshBands.map((b) => `Tier ${roman(b)}`).join(' and ')} just opened.
        </p>
      )}
      <div className={styles.graphRow} style={vars}>
        <ol className={styles.tiers} aria-hidden="true">
          {Array.from({ length: tiers }, (_, i) => (
            <li key={i} className={cx(styles.tierLabel, freshBands.includes(tierBand(building, i + 1)) && styles.freshTier)}>
              {roman(i + 1)}
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
          {closedGates(profile, buildingId)
            .filter((gate) => gate.fromTier <= tiers)
            .map((gate) => (
              <GateDivider key={gate.id} gate={gate} buildingId={buildingId} band={tierBand(BUILDINGS.get(buildingId), gate.fromTier)} y={top(gate.fromTier) - ROW_GAP / 2} />
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

/** The tree's kind (Foundation or Tactic, with a tooltip saying what that means) and Reset tree. */
function TreeHeader({ buildingId, profile }: { buildingId: string; profile: Profile }) {
  const runActive = useRunActive();
  const doReset = useProfileStore((s) => s.resetTree);
  const info = TREE_KIND_INFO[BUILDINGS.get(buildingId).kind];
  const plan = resetPlan(profile, buildingId);
  const reason = respecBlock({ runActive }) ?? (plan === null ? 'Nothing in this tree is bought yet.' : null);
  return (
    <div className={styles.header}>
      <Tooltip content={info.about}>
        <span tabIndex={0} className={styles.kind}>
          <span aria-hidden="true">{BUILDINGS.get(buildingId).kind === 'foundations' ? '▣' : '✦'} </span>
          {info.name} tree
        </span>
      </Tooltip>
      <Button disabledReason={reason} onClick={() => doReset(buildingId, runActive)}>
        Reset tree
      </Button>
      {plan !== null && reason === null && (
        <span className={styles.respecNote}>
          Refunds {formatCurrencies(plan.refund)} with {feeText(plan.fee)}.
        </span>
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
  const rank = rankOf(profile, node.id);
  const max = maxRank(node);
  // A partly bought ranked node is still "available" for its next rank; its check mark shows what is owned.
  const icon = STATUS_ICON[status] ?? (rank > 0 ? '✓' : undefined);
  const price = nextRankCost(profile, node.id) ?? nodeCost(node);
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
          {max > 1 && (
            <span className={cx(styles.rank, rank === max && styles.maxed)}>
              <span aria-hidden="true">
                {rank}/{max}
              </span>
              <span className="sr-only">
                (rank {rank} of {max})
              </span>
            </span>
          )}
        </span>
        <span className="sr-only">({STATUS_TEXT[status]})</span>
        {status !== 'owned' && <Cost cost={price} short={status === 'expensive' ? shortfall(profile.currencies, price) : null} />}
      </button>
    </Tooltip>
  );
}

/**
 * The divider above the first row of a closed building tier: "Tier II, locked: <goal>", with the
 * full requirement and what building tiers are in its tooltip. The lock glyph and the words
 * carry the meaning, not color.
 */
function GateDivider({ gate, buildingId, band, y }: { gate: TierGate; buildingId: string; band: number; y: number }) {
  const profile = useProfileStore((s) => s.profile);
  // The tier quest that opens this gate (ETH-170), if there is one, and whether it is offered yet.
  const quest = CONTRACTS.all().find((c) => opensBuilding(c) === buildingId && opensTier(c) === gate.fromTier);
  const offer = quest === undefined ? null : questOffer(profile, quest);
  return (
    <Tooltip
      content={
        <div className={styles.tooltip}>
          <p className={styles.tooltipTitle}>
            <strong>Tier {roman(band)}</strong> · Locked
          </p>
          <p className={styles.reason}>{describeGate(gate)}</p>
          {quest !== undefined && offer !== null && (
            <p className={styles.help}>
              Quest: <strong>{quest.name}</strong>.{' '}
              {offer.state === 'offered' ? 'Take it as a contract on the Prepare screen.' : offer.state === 'locked' ? `Not offered yet. ${offer.need}.` : ''}
            </p>
          )}
          <p className={styles.help}>
            {UPGRADE_HELP.tiers.name}: {UPGRADE_HELP.tiers.about}
          </p>
        </div>
      }
    >
      <div tabIndex={0} className={styles.gate} style={{ top: y }}>
        <span className={styles.gateLabel}>
          <span aria-hidden="true">🔒 </span>
          Tier {roman(band)} — locked: {gateGoal(gate)}
        </span>
      </div>
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

function NodeDetail({ node, profile }: { node: UpgradeNodeDef; profile: Profile }) {
  const buy = useProfileStore((s) => s.purchase);
  const doRespec = useProfileStore((s) => s.respec);
  const runActive = useRunActive();
  const status = nodeStatus(profile, node.id);
  const check = canPurchase(profile, node.id);
  const group = node.exclusiveGroup;
  const plan = group !== undefined ? respecPlan(profile, group) : null;
  const showRespec = plan !== null && (owns(profile, node.id) || status === 'excluded');
  const rank = rankOf(profile, node.id);
  const ranked = maxRank(node) > 1;
  const price = nextRankCost(profile, node.id) ?? nodeCost(node);

  return (
    <Card className={styles.detail} aria-label={`${node.name} details`} role="region">
      <p className={styles.detailTitle}>
        <strong>
          {node.name}
          {ranked && rank > 0 ? ` ${roman(rank)}` : ''}
        </strong>
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
          <Button variant="primary" disabledReason={check.ok ? undefined : check.reason} onClick={() => buy(node.id)}>
            Buy {ranked ? `rank ${roman(rank + 1)} ` : ''}for {formatCurrencies(price)}
          </Button>
        )}
        {showRespec && (
          <Button disabledReason={respecBlock({ runActive })} onClick={() => doRespec(plan.group, runActive)}>
            Respec: give up {UPGRADES.get(plan.chosen).name}
          </Button>
        )}
      </div>
      {showRespec && (
        <p className={styles.respecNote}>
          Respec gives up {plan.removed.map((id) => UPGRADES.get(id).name).join(', ')} and pays back{' '}
          {formatCurrencies(plan.refund)}, with {feeText(plan.fee)}.
        </p>
      )}
    </Card>
  );
}
