/**
 * The upgrade engine (docs/ARCHITECTURE.md §6.2): buying and respeccing upgrade nodes, and the
 * grants owned nodes give. One engine serves every Town building and, later, deity devotion
 * trees; buildings differ only in their content (`src/content/upgrades.ts`).
 *
 * Everything here is pure: profile in, new profile (or a derived value) out. State is just
 * `profile.upgrades.owned`; unlocks, capacities and bundles are derived from it on demand.
 *
 * The API later items call:
 * - `profileGrants(profile)`: every active grant with the node it came from, for `buildRunConfig`
 *   (ETH-064) and the sim.
 * - `capacity(profile, key, base)`: a limit such as `partySize` or `contractSlots` (ETH-028).
 * - `isUnlocked(profile, id)`: whether an upgrade unlocked a content id (ETH-036 class unlocks).
 */
import { BUILDINGS, CAPACITY_INFO, describeMilestone, findDef, groupNodes, UPGRADES } from '../content';
import type { CapacityKey, UpgradeGrant, UpgradeNodeDef } from '../content';
import { formatNumber } from '../core';
import { describeRequirement } from '../sim';
import { addCurrencies, CURRENCY_INFO, emptyCurrencies, subtractCurrencies } from './currencies';
import type { Currencies } from './currencies';
import { lockingMilestone } from './milestones';
import type { Profile } from './profile';
import { currenciesFromRewards } from './runResult';

/** Share of the chosen node's cost kept as the respec fee, rounded up per currency. */
export const RESPEC_FEE_RATE = 0.5;

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

/** What a respec of one pick-one group would do. */
export interface RespecPlan {
  readonly group: string;
  /** The owned node in the group. */
  readonly chosen: string;
  /** Every node given up: the chosen one, then owned nodes that need it, directly or not. */
  readonly removed: readonly string[];
  /** The full price of every removed node, paid back. */
  readonly refund: Currencies;
  /** Kept back from the refund: `RESPEC_FEE_RATE` of the chosen node's cost. */
  readonly fee: Currencies;
}

// --- Costs -----------------------------------------------------------------------------------

/** A node's price as `Currencies`. */
export function nodeCost(node: UpgradeNodeDef): Currencies {
  return currenciesFromRewards(node.cost);
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

// --- Buying ----------------------------------------------------------------------------------

/** Whether `nodeId` can be bought now, and if not, why. */
export function canPurchase(profile: Profile, nodeId: string): PurchaseCheck {
  if (!UPGRADES.has(nodeId)) return { ok: false, status: 'unknown', reason: `There is no upgrade "${nodeId}".` };
  const node = UPGRADES.get(nodeId);
  if (owns(profile, nodeId)) return { ok: false, status: 'owned', reason: 'Already owned.' };

  const shut = lockingMilestone(profile, node.building);
  if (shut !== null) {
    const building = BUILDINGS.get(node.building).name;
    return { ok: false, status: 'locked', missing: [], reason: `The ${building} opens when you ${describeMilestone(shut, describeRequirement).toLowerCase()}.` };
  }

  if (node.exclusiveGroup !== undefined) {
    const chosen = chosenInGroup(profile, node.exclusiveGroup);
    if (chosen) {
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

  const short = shortfall(profile.currencies, nodeCost(node));
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
 * Buys `nodeId`: pays its cost from the banked currencies and adds it to the owned list.
 * Throws a `RangeError` with `canPurchase`'s reason if it can't be bought.
 */
export function purchase(profile: Profile, nodeId: string): Profile {
  const check = canPurchase(profile, nodeId);
  if (!check.ok) throw new RangeError(`Cannot buy ${nodeName(nodeId)}: ${check.reason}`);
  const node = UPGRADES.get(nodeId);
  return {
    ...profile,
    currencies: subtractCurrencies(profile.currencies, nodeCost(node)),
    upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, nodeId] },
  };
}

// --- Respec ----------------------------------------------------------------------------------

/** The respec fee for giving up `node`: `RESPEC_FEE_RATE` of its cost, rounded up. */
export function respecFee(node: UpgradeNodeDef): Currencies {
  const cost = nodeCost(node);
  const fee = (n: number) => Math.ceil(n * RESPEC_FEE_RATE);
  const favor: Record<string, number> = {};
  for (const [deity, n] of Object.entries(cost.favor)) favor[deity] = fee(n);
  return { renown: fee(cost.renown), trophies: fee(cost.trophies), favor };
}

/**
 * What respeccing `group` would do, or `null` if no node of the group is owned. The chosen node
 * and every owned node that needs it (directly or through others) are given up and their full
 * price paid back, less the fee. The refund always covers the fee, so a respec is never refused
 * for lack of currency.
 */
export function respecPlan(profile: Profile, group: string): RespecPlan | null {
  const chosen = chosenInGroup(profile, group);
  if (!chosen) return null;
  const removed = new Set([chosen.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const node of ownedNodes(profile)) {
      if (!removed.has(node.id) && node.requires.some((id) => removed.has(id))) {
        removed.add(node.id);
        grew = true;
      }
    }
  }
  const ids = profile.upgrades.owned.filter((id) => removed.has(id));
  const refund = ids.reduce((sum, id) => addCurrencies(sum, nodeCost(UPGRADES.get(id))), emptyCurrencies());
  return { group, chosen: chosen.id, removed: [chosen.id, ...ids.filter((id) => id !== chosen.id)], refund, fee: respecFee(chosen) };
}

/**
 * Undoes the choice in a pick-one group (see `respecPlan`), so any node of the group can be
 * bought again. Throws a `RangeError` if no node of the group is owned.
 */
export function respec(profile: Profile, group: string): Profile {
  const plan = respecPlan(profile, group);
  if (!plan) throw new RangeError(`Nothing to respec: no node of pick-one group "${group}" is owned.`);
  const removed = new Set(plan.removed);
  return {
    ...profile,
    currencies: subtractCurrencies(addCurrencies(profile.currencies, plan.refund), plan.fee),
    upgrades: { ...profile.upgrades, owned: profile.upgrades.owned.filter((id) => !removed.has(id)) },
  };
}

// --- Grants ----------------------------------------------------------------------------------

/** Every grant of every owned node, in purchase order, with the node it came from. */
export function profileGrants(profile: Profile): ActiveGrant[] {
  return ownedNodes(profile).flatMap((node) => node.grants.map((grant) => ({ source: node.id, grant })));
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

/** A grant in words, for tooltips and the Codex: "Party size +1", "Unlocks Vanguard". */
export function describeGrant(grant: UpgradeGrant): string {
  switch (grant.kind) {
    case 'capacity':
      return `${CAPACITY_INFO[grant.key].name} +${grant.amount}`;
    case 'unlock':
      return `Unlocks ${findDef(grant.id)?.name ?? grant.id}`;
    case 'bundle': {
      const who = grant.scope === 'party' ? 'each adventurer' : 'the run';
      const parts = (grant.bundle.modifiers ?? []).map((m) =>
        m.op === 'add' ? `${m.value > 0 ? '+' : ''}${m.value} ${statName(m.stat)}` : `×${m.value} ${statName(m.stat)}`,
      );
      const triggers = grant.bundle.triggers?.length ?? 0;
      if (triggers > 0) parts.push(`${triggers} triggered effect${triggers === 1 ? '' : 's'}`);
      return `${parts.join(', ')} for ${who}`;
    }
  }
}

/** Display names for stat ids in grant text. */
const STAT_NAMES: Readonly<Record<string, string>> = {
  hp: 'max HP',
  mp: 'max MP',
  accuracy: 'accuracy',
  evasion: 'evasion',
  damage: 'damage',
  armor: 'armor',
  speed: 'speed',
  sight: 'sight',
  carry: 'carry',
};

function statName(stat: string): string {
  return STAT_NAMES[stat] ?? stat;
}
