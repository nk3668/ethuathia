/**
 * The opt-in section (ETH-187, CLAUDE.md §1 principle 3 "risk is a choice"): which owned
 * *opt-in* upgrade nodes (`UpgradeNodeDef.optIn`) are switched on for the next run. Owning such a
 * node grants nothing by itself; the player ticks it on the Prepare screen, and it is off until
 * they do. The choice is remembered like the others, so auto-restart keeps it.
 *
 * `withOptIns` is the one filter: `buildRunConfig` derives bundles, run modifiers and start perks
 * from the profile it returns, so a node that is owned but off adds nothing, and a new opt-in
 * node needs no code beyond `optIn: true` and its `bundle` or `start` grant.
 */
import { z } from 'zod';
import { UPGRADES } from '../../content';
import type { UpgradeNodeDef } from '../../content';
import { idSchema } from '../../content/schema';
import type { Profile } from '../profile';
import { owns } from '../upgrades';
import { defineRunChoice } from './choice';

export interface OptInsChoice {
  /** The upgrade ids switched on for the run. Ids the profile does not own (or that are not opt-in) are ignored. */
  readonly enabled: readonly string[];
}

/** The opt-in nodes the profile owns, in registration order. */
export function optInNodes(profile: Profile): UpgradeNodeDef[] {
  return UPGRADES.all().filter((node) => node.optIn === true && owns(profile, node.id));
}

/** The owned opt-in nodes this choice switches on. */
export function enabledOptIns(profile: Profile, choice: OptInsChoice): UpgradeNodeDef[] {
  return optInNodes(profile).filter((node) => choice.enabled.includes(node.id));
}

/**
 * `profile` as the run sees it: owned opt-in nodes that are not switched on are left out of
 * `upgrades.owned` (and `ranks`), so every grant derived from it skips them. The same object comes back when nothing is dropped.
 */
export function withOptIns(profile: Profile, choice: OptInsChoice): Profile {
  const off = optInNodes(profile).filter((node) => !choice.enabled.includes(node.id));
  if (off.length === 0) return profile;
  const gone = new Set(off.map((node) => node.id));
  const ranks = Object.fromEntries(Object.entries(profile.upgrades.ranks).filter(([id]) => !gone.has(id)));
  return { ...profile, upgrades: { owned: profile.upgrades.owned.filter((id) => !gone.has(id)), ranks } };
}

export const OPT_INS_CHOICE = defineRunChoice<OptInsChoice>({
  schema: z.object({ enabled: z.array(idSchema('upgrade')).max(64) }),
  init: () => ({ enabled: [] }),
  // The grants themselves are filtered in `buildRunConfig` (`withOptIns`); nothing to add here.
  apply: () => undefined,
});
