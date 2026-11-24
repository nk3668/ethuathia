/**
 * When a building quest is offered (ETH-093, CLAUDE.md §4): its building is still locked and
 * enough of the open buildings' upgrades are bought, so the player alternates between spending in
 * town and questing. The first quest (the Smithy's) asks for none.
 *
 * **What counts as "the share bought"** (`upgradeShare`): over every node of every open building
 * that is not behind a closed tier gate (ETH-172), each node is worth one.
 * - An owned unranked node counts as bought (1).
 * - A ranked node counts in proportion to its ranks: 2 of 5 ranks is 0.4.
 * - A pick-one group counts once (it can only ever be bought once): bought when a member is owned.
 * The text rounds the bought count down to a whole number ("4 of 13"); the check uses the exact one.
 *
 * A **tier quest** (ETH-170) is offered by the same rule over just its own building's nodes in its
 * open tiers (`TIER_QUEST_SHARE`), while the building is open and its gate is the next closed one.
 */
import { BUILDINGS, isBuildingQuest, maxRank, offerShare, opensBuilding, opensTarget, opensTier, UPGRADES } from '../../content';
import type { ContractDef } from '../../content';
import { isMilestoneOpen } from '../milestones';
import type { Profile } from '../profile';
import { closedGates, rankOf, tierGate } from '../upgrades';

/** How much of the open buildings' upgrades the player has bought. */
export interface UpgradeShare {
  /** Nodes bought, counting a ranked node by the share of its ranks. */
  readonly bought: number;
  /** Nodes in the open buildings' open tiers (a pick-one group is one). */
  readonly total: number;
  /** `bought / total`, or 0 when there are no nodes. */
  readonly share: number;
}

/**
 * The share of the open buildings' upgrade nodes bought; see the module comment for what counts.
 * With `onlyBuilding`, just that building's nodes in its open tiers (a tier quest, ETH-170).
 */
export function upgradeShare(profile: Profile, onlyBuilding?: string): UpgradeShare {
  let bought = 0;
  let total = 0;
  const groups = new Set<string>();
  for (const node of UPGRADES.all()) {
    if (onlyBuilding !== undefined && node.building !== onlyBuilding) continue;
    if (!BUILDINGS.has(node.building) || !isMilestoneOpen(profile, node.building)) continue;
    if (tierGate(profile, node.building, node.tier) !== null) continue;
    if (node.exclusiveGroup !== undefined) {
      if (groups.has(node.exclusiveGroup)) continue;
      groups.add(node.exclusiveGroup);
      total += 1;
      if (UPGRADES.all().some((n) => n.exclusiveGroup === node.exclusiveGroup && rankOf(profile, n.id) > 0)) bought += 1;
      continue;
    }
    total += 1;
    bought += rankOf(profile, node.id) / maxRank(node);
  }
  return { bought, total, share: total === 0 ? 0 : bought / total };
}

/** Where a building quest stands for this profile. */
export type QuestOffer =
  /** The building is locked and enough is bought: the player may take the quest. */
  | { readonly state: 'offered' }
  /** The building is locked but too little is bought: shown greyed. `need` says what is missing. */
  | { readonly state: 'locked'; readonly need: string }
  /** The building is already open: the quest is gone from the list. */
  | { readonly state: 'done' }
  /** A tier quest whose building is locked or whose gate is not the next closed one: not shown yet. */
  | { readonly state: 'hidden' };

/**
 * "Buy 30% of the open buildings' upgrades: 4 of 13", with the nodes bought rounded down. A tier
 * quest counts its own building's open tiers: "Buy 50% of the Smithy's open upgrades: 5 of 10".
 */
export function questNeedText(def: ContractDef, have: UpgradeShare): string {
  const percent = Math.round(offerShare(def) * 100);
  const building = opensTier(def) === undefined ? undefined : opensBuilding(def);
  const whose = building !== undefined && BUILDINGS.has(building) ? `the ${BUILDINGS.get(building).name}'s` : "the open buildings'";
  return `Buy ${percent}% of ${whose} upgrades: ${Math.floor(have.bought)} of ${have.total}`;
}

/**
 * A building quest's state for `profile` (a tier quest too, ETH-170). A contract that is not a
 * building quest is always 'offered'. A tier quest is offered while its building is open and its
 * gate is the next closed one, once enough of that building's open tiers is bought.
 */
export function questOffer(profile: Profile, def: ContractDef): QuestOffer {
  const target = opensTarget(def);
  if (target === undefined) return { state: 'offered' };
  if (isMilestoneOpen(profile, target)) return { state: 'done' };
  const building = opensBuilding(def) as string;
  const tier = opensTier(def);
  if (tier !== undefined) {
    // Gates open top to bottom, so only the topmost closed gate's quest is shown.
    if (!isMilestoneOpen(profile, building) || closedGates(profile, building)[0]?.fromTier !== tier) return { state: 'hidden' };
  }
  const have = upgradeShare(profile, tier === undefined ? undefined : building);
  // Compare in whole thousandths: a share of exactly 0.3 must pass despite float rounding.
  if (Math.round(have.share * 1000) >= Math.round(offerShare(def) * 1000)) return { state: 'offered' };
  return { state: 'locked', need: questNeedText(def, have) };
}

/** Why `candidate` can't be taken together with the chosen contracts, or `null`: one building quest per run. */
export function buildingQuestRefusal(chosen: readonly ContractDef[], candidate: ContractDef): string | null {
  if (!isBuildingQuest(candidate)) return null;
  const other = chosen.find((c) => c.id !== candidate.id && isBuildingQuest(c));
  return other === undefined ? null : `Only one building quest per run: ${other.name} is already taken.`;
}
