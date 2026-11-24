/**
 * The upgrade engine (docs/ARCHITECTURE.md §6.2): buying upgrade nodes and the grants owned
 * nodes give. One engine serves every Town building and, later, deity devotion trees; buildings
 * differ only in their content (`src/content/upgrades.ts`). Respec and reset are in `respec.ts`,
 * grant wording in `grantText.ts`.
 *
 * Everything here is pure: profile in, new profile (or a derived value) out. State is just
 * `profile.upgrades` (`owned` and the sparse `ranks`); unlocks, capacities and bundles are
 * derived from it on demand.
 *
 * The API later items call:
 * - `profileGrants(profile)`: every active grant with the node it came from (once per rank), for
 *   `buildRunConfig` (ETH-064) and the sim.
 * - `capacity(profile, key, base)`: a limit such as `partySize` or `contractSlots` (ETH-028).
 * - `isUnlocked(profile, id)`: whether an upgrade unlocked a content id (ETH-036 class unlocks).
 */
import { BUILDINGS, defName, describeMilestone, findDef, groupNodes, maxRank, rankPrice, tierGateId, UPGRADES } from '../content';
import type { CapacityKey, Milestone, TierGate, UpgradeGrant, UpgradeNodeDef } from '../content';
import { formatNumber } from '../core';
import { describeRequirement } from '../sim';
import { CURRENCY_INFO, subtractCurrencies } from './currencies';
import type { Currencies } from './currencies';
import { isMilestoneOpen, lockingMilestone } from './milestones';
import type { Profile } from './profile';
import { currenciesFromRewards } from './runResult';

/** How a node stands for this profile. The Town tree draws one look per status. */
export type NodeStatus = 'owned' | 'available' | 'expensive' | 'locked' | 'excluded';

export type PurchaseCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: Exclude<NodeStatus, 'available'> | 'unknown';
      /** Why, in words for the player's tooltip. */
      readonly reason: string;
      /** For `locked`: the prerequisites not yet owned. */
      readonly missing?: readonly string[];
      /** For `excluded`: the node chosen in the same pick-one group. */
      readonly chosen?: string;
      /** For `expensive`: how much more of each currency is needed. */
      readonly short?: Currencies;
    };

/** One grant from an owned node. */
export interface ActiveGrant {
  /** The upgrade node it comes from, for tooltips ("Second Berth"). */
  readonly source: string;
  readonly grant: UpgradeGrant;
}

// --- Costs -----------------------------------------------------------------------------------

/** A node's rank 1 price as `Currencies`. */
export function nodeCost(node: UpgradeNodeDef): Currencies {
  return currenciesFromRewards(node.cost);
}

/** What rank `rank` of `node` costs (`rankPrice`: growth, rounded, never below the rank before). */
export function rankCost(node: UpgradeNodeDef, rank: number): Currencies {
  return currenciesFromRewards(rankPrice(node, rank));
}

/** What `have` lacks to pay `cost`; all zero (and no Favor entries) when it can pay. */
export function shortfall(have: Currencies, cost: Currencies): Currencies {
  return subtractCurrencies(cost, have);
}

export function canAfford(have: Currencies, cost: Currencies): boolean {
  return isZero(shortfall(have, cost));
}

function isZero(c: Currencies): boolean {
  return c.renown === 0 && c.trophies === 0 && Object.values(c.favor).every((n) => n === 0);
}

/** "120 Renown, 3 Favor of the Dawn", for tooltips and reasons. "nothing" when empty. */
export function formatCurrencies(c: Currencies): string {
  const parts: string[] = [];
  if (c.renown > 0) parts.push(`${formatNumber(c.renown)} ${CURRENCY_INFO.renown.name}`);
  if (c.trophies > 0) parts.push(`${formatNumber(c.trophies)} ${CURRENCY_INFO.trophies.name}`);
  for (const [deity, n] of Object.entries(c.favor)) {
    if (n > 0) parts.push(`${formatNumber(n)} ${CURRENCY_INFO.favor.name} of ${findDef(deity)?.name ?? deity}`);
  }
  return parts.length === 0 ? 'nothing' : parts.join(', ');
}

// --- Owned nodes -----------------------------------------------------------------------------

export function owns(profile: Profile, nodeId: string): boolean {
  return profile.upgrades.owned.includes(nodeId);
}

/**
 * The rank the player holds of `nodeId`: 0 if not owned, else 1 up to the node's top rank. A
 * node whose content lost ranks since the save is held at its new top rank.
 */
export function rankOf(profile: Profile, nodeId: string): number {
  if (!owns(profile, nodeId)) return 0;
  const stored = profile.upgrades.ranks[nodeId] ?? 1;
  return UPGRADES.has(nodeId) ? Math.min(stored, maxRank(UPGRADES.get(nodeId))) : stored;
}

/** What the next rank of `nodeId` costs, or `null` if it is at its top rank or doesn't exist. */
export function nextRankCost(profile: Profile, nodeId: string): Currencies | null {
  if (!UPGRADES.has(nodeId)) return null;
  const node = UPGRADES.get(nodeId);
  const next = rankOf(profile, nodeId) + 1;
  return next > maxRank(node) ? null : rankCost(node, next);
}

/** The owned nodes that exist in content, oldest purchase first. */
export function ownedNodes(profile: Profile): UpgradeNodeDef[] {
  return profile.upgrades.owned.filter((id) => UPGRADES.has(id)).map((id) => UPGRADES.get(id));
}

/** The owned node in a pick-one group, or `undefined`. */
export function chosenInGroup(profile: Profile, group: string): UpgradeNodeDef | undefined {
  return groupNodes(group).find((node) => owns(profile, node.id));
}

function nodeName(id: string): string {
  return UPGRADES.has(id) ? UPGRADES.get(id).name : id;
}

// --- Tier gates ------------------------------------------------------------------------------

/** A closed building tier gate: what keeps rows from `fromTier` down locked. */
export interface ClosedGate extends TierGate {
  /** The milestone target id (`building.smithy_t4`). */
  readonly id: string;
}

/** Every gate of a building not yet open, top to bottom. */
export function closedGates(profile: Profile, buildingId: string): ClosedGate[] {
  const gates = BUILDINGS.has(buildingId) ? (BUILDINGS.get(buildingId).tierGates ?? []) : [];
  return gates.map((g) => ({ ...g, id: tierGateId(buildingId, g.fromTier) })).filter((g) => !isMilestoneOpen(profile, g.id));
}

/**
 * The gate that keeps row `tier` of a building locked, or `null` if its band is open. With
 * several closed gates above the row, the topmost, the one to open first.
 */
export function tierGate(profile: Profile, buildingId: string, tier: number): ClosedGate | null {
  return closedGates(profile, buildingId).find((g) => g.fromTier <= tier) ?? null;
}

/** What opens a gate, as a short goal: "Reach floor 3", "Complete the Anvil quest". */
export function gateGoal(gate: TierGate): string {
  return describeMilestone(gate.unlock, describeRequirement, defName);
}

/** "Tier 4 and up open when you reach floor 3.", from the gate's milestone. */
export function describeGate(gate: TierGate): string {
  const what = gateGoal(gate);
  return `Tier ${gate.fromTier} and up open when you ${what.charAt(0).toLowerCase()}${what.slice(1)}.`;
}

/** "Revealed when you reach floor 4": what keeps a sealed node (`UpgradeNodeDef.reveal`) from being bought. */
export function revealText(milestone: Milestone): string {
  const goal = describeMilestone(milestone, describeRequirement, defName);
  return `Revealed when you ${goal.charAt(0).toLowerCase()}${goal.slice(1)}.`;
}

// --- Buying ----------------------------------------------------------------------------------

/**
 * Whether `nodeId` can be bought now, and if not, why. For a ranked node this is its next rank:
 * `owned` only at the top rank, `available` or `expensive` before it.
 */
export function canPurchase(profile: Profile, nodeId: string): PurchaseCheck {
  if (!UPGRADES.has(nodeId)) return { ok: false, status: 'unknown', reason: `There is no upgrade "${nodeId}".` };
  const node = UPGRADES.get(nodeId);
  const rank = rankOf(profile, nodeId);
  if (rank >= maxRank(node)) return { ok: false, status: 'owned', reason: rank > 1 ? 'Fully ranked.' : 'Already owned.' };

  const shut = lockingMilestone(profile, node.building);
  if (shut !== null) {
    const building = BUILDINGS.get(node.building).name;
    const goal = describeMilestone(shut, describeRequirement, defName);
    return { ok: false, status: 'locked', missing: [], reason: `The ${building} opens when you ${goal.charAt(0).toLowerCase()}${goal.slice(1)}.` };
  }

  const gate = tierGate(profile, node.building, node.tier);
  if (gate !== null) return { ok: false, status: 'locked', missing: [], reason: describeGate(gate) };

  const hidden = lockingMilestone(profile, node.id);
  if (hidden !== null) return { ok: false, status: 'locked', missing: [], reason: revealText(hidden) };

  if (node.exclusiveGroup !== undefined) {
    const chosen = chosenInGroup(profile, node.exclusiveGroup);
    if (chosen && chosen.id !== nodeId) {
      return {
        ok: false,
        status: 'excluded',
        chosen: chosen.id,
        reason: `You chose ${chosen.name} in this pick-one tier. Respec to choose again.`,
      };
    }
  }

  const missing = node.requires.filter((id) => !owns(profile, id));
  if (missing.length > 0) {
    return { ok: false, status: 'locked', missing, reason: `Needs ${missing.map(nodeName).join(' and ')} first.` };
  }

  const short = shortfall(profile.currencies, rankCost(node, rank + 1));
  if (!isZero(short)) return { ok: false, status: 'expensive', short, reason: `Needs ${formatCurrencies(short)} more.` };
  return { ok: true };
}

/** The node's status for this profile (see `NodeStatus`). Throws on an unknown id. */
export function nodeStatus(profile: Profile, nodeId: string): NodeStatus {
  const check = canPurchase(profile, nodeId);
  if (check.ok) return 'available';
  if (check.status === 'unknown') throw new RangeError(check.reason);
  return check.status;
}

/**
 * Buys `nodeId`, or its next rank if it is ranked and already owned: pays the cost from the
 * banked currencies and adds the node to the owned list (first purchase) or raises its rank.
 * Throws a `RangeError` with `canPurchase`'s reason if it can't be bought.
 */
export function purchase(profile: Profile, nodeId: string): Profile {
  const check = canPurchase(profile, nodeId);
  if (!check.ok) throw new RangeError(`Cannot buy ${nodeName(nodeId)}: ${check.reason}`);
  const node = UPGRADES.get(nodeId);
  const rank = rankOf(profile, nodeId) + 1;
  const { owned, ranks } = profile.upgrades;
  return {
    ...profile,
    currencies: subtractCurrencies(profile.currencies, rankCost(node, rank)),
    upgrades: { owned: rank === 1 ? [...owned, nodeId] : owned, ranks: rank >= 2 ? { ...ranks, [nodeId]: rank } : ranks },
  };
}

// --- Grants ----------------------------------------------------------------------------------

/** Every grant of every owned node, in purchase order, with the node it came from, once per rank. */
export function profileGrants(profile: Profile): ActiveGrant[] {
  return ownedNodes(profile).flatMap((node) =>
    Array.from({ length: rankOf(profile, node.id) }, () => node.grants.map((grant) => ({ source: node.id, grant }))).flat(),
  );
}

/** `base` plus every owned `capacity` grant for `key`. */
export function capacity(profile: Profile, key: CapacityKey, base: number): number {
  let total = base;
  for (const { grant } of profileGrants(profile)) {
    if (grant.kind === 'capacity' && grant.key === key) total += grant.amount;
  }
  return total;
}

/** True if an owned node unlocks the content id `id`. */
export function isUnlocked(profile: Profile, id: string): boolean {
  return profileGrants(profile).some(({ grant }) => grant.kind === 'unlock' && grant.id === id);
}
