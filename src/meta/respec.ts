/**
 * Respec and tree reset (ETH-086, CLAUDE.md §4): giving up upgrade nodes between runs for a
 * refund. Both work on the same state as the engine in `upgrades.ts` (`profile.upgrades`) and
 * pay back every rank of a ranked node (ETH-172), less the Foundations fee.
 */
import { BUILDINGS, UPGRADES } from '../content';
import type { TreeKind, UpgradeNodeDef } from '../content';
import { addCurrencies, emptyCurrencies, subtractCurrencies } from './currencies';
import type { Currencies } from './currencies';
import type { Profile } from './profile';
import { chosenInGroup, isUnlocked, ownedNodes, rankCost, rankOf } from './upgrades';

/**
 * Share of the price of what a respec or reset gives up that a **Foundations** tree keeps as a
 * fee, rounded up per currency (0 to 1). Currently 0: no fee (Nate, 2026-11-24). Tactics trees
 * (CLAUDE.md §4) never pay a fee, whatever this is. Tests override it with
 * `RespecOptions.foundationsFeeRate`.
 */
export const FOUNDATIONS_RESPEC_FEE_RATE = 0;

/** Why a respec or reset is refused while a run is going. */
export const RUN_ACTIVE_REASON = 'Upgrades can only be reset or changed between runs, not during one.';

/** The context a respec or reset needs; the meta layer can't know it, so the caller passes it. */
export interface RespecOptions {
  /** A run is going. Respec and reset refuse with `RUN_ACTIVE_REASON`. Defaults to false. */
  readonly runActive?: boolean;
  /** Overrides `FOUNDATIONS_RESPEC_FEE_RATE`, for tests. */
  readonly foundationsFeeRate?: number;
}

/** What a reset of a whole building's tree would do. */
export interface ResetPlan {
  readonly building: string;
  /** Every owned node of the building, in purchase order. */
  readonly removed: readonly string[];
  /** The full price of every removed node (every rank bought), paid back. */
  readonly refund: Currencies;
  /** Kept back from the refund (Foundations only; see `FOUNDATIONS_RESPEC_FEE_RATE`). */
  readonly fee: Currencies;
}

/** What a respec of one pick-one group would do. */
export interface RespecPlan {
  readonly group: string;
  /** The owned node in the group. */
  readonly chosen: string;
  /** Every node given up: the chosen one, then owned nodes that need it, directly or not. */
  readonly removed: readonly string[];
  /** The full price of every removed node (every rank bought), paid back. */
  readonly refund: Currencies;
  /** Kept back from the refund: the Foundations fee rate of the chosen node's cost (all its ranks); none for Tactics. */
  readonly fee: Currencies;
}

/** The kind of tree `node` is in, from its building. */
export function treeKind(node: UpgradeNodeDef): TreeKind {
  return BUILDINGS.get(node.building).kind;
}

/** The refusal reason if a respec or reset can't happen now, else `null`. */
export function respecBlock(options: RespecOptions = {}): string | null {
  return options.runActive === true ? RUN_ACTIVE_REASON : null;
}

/** The fee for giving up `cost` from a tree of `kind`: the rate of it, rounded up; zero for Tactics. */
function feeFor(kind: TreeKind, cost: Currencies, options: RespecOptions): Currencies {
  const rate = kind === 'foundations' ? Math.min(1, Math.max(0, options.foundationsFeeRate ?? FOUNDATIONS_RESPEC_FEE_RATE)) : 0;
  const fee = (n: number) => Math.ceil(n * rate);
  const favor: Record<string, number> = {};
  for (const [deity, n] of Object.entries(cost.favor)) favor[deity] = fee(n);
  return { renown: fee(cost.renown), trophies: fee(cost.trophies), favor };
}

/** What ranks 1 to `rank` of `node` cost together. */
function pricePaid(node: UpgradeNodeDef, rank: number): Currencies {
  let sum = emptyCurrencies();
  for (let r = 1; r <= rank; r++) sum = addCurrencies(sum, rankCost(node, r));
  return sum;
}

/**
 * The respec fee for giving up `node` bought up to `rank` (1, an unranked node, by default): its
 * tree kind's rate of the price of all those ranks, rounded up; none for Tactics.
 */
export function respecFee(node: UpgradeNodeDef, options: RespecOptions = {}, rank = 1): Currencies {
  return feeFor(treeKind(node), pricePaid(node, rank), options);
}

/** `chosen` and every owned node that needs it, directly or not, in purchase order. */
function dependentsOf(profile: Profile, chosen: string): string[] {
  const removed = new Set([chosen]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const node of ownedNodes(profile)) {
      if (!removed.has(node.id) && node.requires.some((id) => removed.has(id))) {
        removed.add(node.id);
        grew = true;
      }
    }
  }
  return profile.upgrades.owned.filter((id) => removed.has(id));
}

/** What the player paid for `ids`: every rank bought of each. */
function priceOf(profile: Profile, ids: readonly string[]): Currencies {
  return ids.reduce((sum, id) => addCurrencies(sum, pricePaid(UPGRADES.get(id), rankOf(profile, id))), emptyCurrencies());
}

/**
 * What respeccing `group` would do, or `null` if no node of the group is owned. The chosen node
 * and every owned node that needs it (directly or through others) are given up and their full
 * price, every rank, paid back, less the fee (Foundations only, see `FOUNDATIONS_RESPEC_FEE_RATE`).
 * The refund always covers the fee, so a respec is never refused for lack of currency.
 */
export function respecPlan(profile: Profile, group: string, options: RespecOptions = {}): RespecPlan | null {
  const chosen = chosenInGroup(profile, group);
  if (!chosen) return null;
  const ids = dependentsOf(profile, chosen.id);
  return {
    group,
    chosen: chosen.id,
    removed: [chosen.id, ...ids.filter((id) => id !== chosen.id)],
    refund: priceOf(profile, ids),
    fee: respecFee(chosen, options, rankOf(profile, chosen.id)),
  };
}

/**
 * Undoes the choice in a pick-one group (see `respecPlan`), so any node of the group can be
 * bought again. Throws a `RangeError` during a run (`options.runActive`) or if no node of the
 * group is owned.
 */
export function respec(profile: Profile, group: string, options: RespecOptions = {}): Profile {
  const blocked = respecBlock(options);
  if (blocked !== null) throw new RangeError(blocked);
  const plan = respecPlan(profile, group, options);
  if (!plan) throw new RangeError(`Nothing to respec: no node of pick-one group "${group}" is owned.`);
  return applyGiveUp(profile, plan.removed, plan.refund, plan.fee);
}

/** What resetting the whole tree of `buildingId` would do, or `null` if nothing in it is owned. */
export function resetPlan(profile: Profile, buildingId: string, options: RespecOptions = {}): ResetPlan | null {
  const ids = profile.upgrades.owned.filter((id) => UPGRADES.has(id) && UPGRADES.get(id).building === buildingId);
  if (ids.length === 0) return null;
  const refund = priceOf(profile, ids);
  return { building: buildingId, removed: ids, refund, fee: feeFor(BUILDINGS.get(buildingId).kind, refund, options) };
}

/**
 * Gives up every owned node of a building's tree and pays back its full price (every rank),
 * less the fee (Foundations only). Throws a `RangeError` during a run (`options.runActive`) or
 * if nothing in the tree is owned.
 */
export function resetTree(profile: Profile, buildingId: string, options: RespecOptions = {}): Profile {
  const blocked = respecBlock(options);
  if (blocked !== null) throw new RangeError(blocked);
  const plan = resetPlan(profile, buildingId, options);
  if (!plan) throw new RangeError(`Nothing to reset: no node of "${buildingId}" is owned.`);
  return applyGiveUp(profile, plan.removed, plan.refund, plan.fee);
}

function applyGiveUp(profile: Profile, removedIds: readonly string[], refund: Currencies, fee: Currencies): Profile {
  const removed = new Set(removedIds);
  const next: Profile = {
    ...profile,
    currencies: subtractCurrencies(addCurrencies(profile.currencies, refund), fee),
    upgrades: {
      owned: profile.upgrades.owned.filter((id) => !removed.has(id)),
      ranks: Object.fromEntries(Object.entries(profile.upgrades.ranks).filter(([id]) => !removed.has(id))),
    },
  };
  const oldRanks = profile.prepare.choices.omens.ranks;
  const keptOmens = Object.fromEntries(Object.entries(oldRanks).filter(([id]) => isUnlocked(next, id)));
  if (Object.keys(keptOmens).length === Object.keys(oldRanks).length) return next;
  return {
    ...next,
    prepare: {
      ...next.prepare,
      choices: { ...next.prepare.choices, omens: { ranks: keptOmens } },
    },
  };
}
