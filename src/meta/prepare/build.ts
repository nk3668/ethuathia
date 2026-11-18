/**
 * `buildRunConfig` (docs/ARCHITECTURE.md §6.3): profile and Prepare choices in, a checked
 * `RunConfig` out. The app's Descend, auto-restart and every later way of starting a run go
 * through it, so what the town bought always reaches the run.
 */
import { CLASSES, RACES, upgradeBundle } from '../../content';
import { Rng } from '../../core';
import { configDepth, hasBundle } from '../../sim';
import type { RunConfig } from '../../sim';
import type { Profile } from '../profile';
import { ownedNodes } from '../upgrades';
import { CHOICE_ENTRIES } from './index';
import type { RunChoices } from './index';
import { MAX_PARTY_SIZE } from './party';

/** The RNG stream name recruits and other setup draws use, seeded from the run's seed. */
export const PREPARE_STREAM = 'prepare';

/**
 * The upgrade nodes whose party bundles every adventurer starts with: owned nodes with a
 * `bundle` grant of scope `party`, in purchase order. The sim attaches each by node id
 * (`bundleOf` reads the node's grants), so stat tooltips credit "Hardy Recruits".
 */
export function upgradePartyBundles(profile: Profile): string[] {
  return ownedNodes(profile)
    .filter((node) => upgradeBundle(node, 'party') !== undefined)
    .map((node) => node.id);
}

/**
 * The run config for `choices` on this profile: each `RUN_CHOICES` section applies its choice in
 * order (random recruits draw from `seed`, so the same seed gives the same party), then the
 * owned upgrades' party bundles are added to `partyBundles`. Run-scope bundle grants have no
 * consumer yet (Omens and blessings add a run-wide bundle source). Throws a `RangeError` listing
 * the problems if the result fails `checkRunConfig`.
 */
export function buildRunConfig(profile: Profile, choices: RunChoices, seed: number): RunConfig {
  const config: RunConfig = { party: [] };
  const ctx = { profile, rng: Rng.seeded(seed, PREPARE_STREAM), config };
  for (const [key, section] of CHOICE_ENTRIES) section.apply(ctx, choices[key]);
  const bundles = upgradePartyBundles(profile);
  if (bundles.length > 0) config.partyBundles = [...(config.partyBundles ?? []), ...bundles];
  const problems = checkRunConfig(config);
  if (problems.length > 0) throw new RangeError(`Invalid run config: ${problems.join('; ')}`);
  return config;
}

/** Problems with a run config, one line each, or an empty list if the sim can start it. */
export function checkRunConfig(config: RunConfig): string[] {
  const problems: string[] = [];
  if (config.party.length === 0) problems.push('the party is empty');
  if (config.party.length > MAX_PARTY_SIZE) problems.push(`the party has ${config.party.length} adventurers, at most ${MAX_PARTY_SIZE} may go`);
  config.party.forEach((m, i) => {
    if (m.name.trim() === '') problems.push(`party[${i}] has no name`);
    if (!CLASSES.has(m.classId)) problems.push(`party[${i}] has unknown class "${m.classId}"`);
    if (!RACES.has(m.raceId)) problems.push(`party[${i}] has unknown race "${m.raceId}"`);
  });
  for (const id of config.partyBundles ?? []) if (!hasBundle(id)) problems.push(`unknown party bundle "${id}"`);
  try {
    configDepth(config);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return problems;
}
