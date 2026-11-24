/**
 * `buildRunConfig` (docs/ARCHITECTURE.md §6.3): profile and Prepare choices in, a checked
 * `RunConfig` out. The app's Descend, auto-restart and every later way of starting a run go
 * through it, so what the town bought always reaches the run.
 */
import { CLASSES, CONTRACTS, RACES, upgradeBundle } from '../../content';
import { Rng } from '../../core';
import { configDepth, hasBundle, requirementProblems, runModifierListProblems } from '../../sim';
import type { RunConfig, RunModifierConfig } from '../../sim';
import type { Profile } from '../profile';
import { milestoneRequirements } from '../milestones';
import { newRecord } from '../adventurers';
import { ownedNodes, rankOf } from '../upgrades';
import { CHOICE_ENTRIES } from './index';
import type { RunChoices } from './index';
import { MAX_PARTY_SIZE } from './party';

/** The RNG stream name recruits and other setup draws use, seeded from the run's seed. */
export const PREPARE_STREAM = 'prepare';

/**
 * The upgrade nodes whose party bundles every adventurer starts with: owned nodes with a
 * `bundle` grant of scope `party`, in purchase order. The sim attaches each by node id
 * (`bundleOf` reads the node's grants), so stat tooltips credit "Hardy Recruits". A ranked node
 * (ETH-172) is listed once per rank, so its bundle stacks.
 */
export function upgradePartyBundles(profile: Profile): string[] {
  return ownedNodes(profile)
    .filter((node) => upgradeBundle(node, 'party') !== undefined)
    .flatMap((node) => Array.from({ length: rankOf(profile, node.id) }, () => node.id));
}

/**
 * The run modifiers owned upgrades give (ETH-115): one per owned node with a `bundle` grant of
 * scope `run`, in purchase order, keyed and credited by the node (id and name) and carrying the
 * node's merged run-scope grants as its bundle. Scope `party`: an upgrade the player bought helps
 * the party, including allies outside the party roster. A ranked node (ETH-172) gets one per
 * rank, the first keyed by the node id and the rest `<id>#<rank>`, so they stack.
 */
export function upgradeRunModifiers(profile: Profile): RunModifierConfig[] {
  return ownedNodes(profile)
    .filter((node) => upgradeBundle(node, 'run') !== undefined)
    .flatMap((node) =>
      Array.from({ length: rankOf(profile, node.id) }, (_, i): RunModifierConfig => ({
        key: i === 0 ? node.id : `${node.id}#${i + 1}`,
        source: { id: node.id, label: node.name },
        scope: 'party',
        bundle: node.id,
      })),
    );
}

/**
 * The run config for `choices` on this profile: each `RUN_CHOICES` section applies its choice in
 * order (random recruits draw from `seed`, so the same seed gives the same party), then the
 * owned upgrades' party bundles are added to `partyBundles` and their run-scope bundle grants
 * become run modifiers (`upgradeRunModifiers`, ETH-115). The requirements of locked
 * `metInRun` milestones go into `watchRequirements` (ETH-121). Throws a `RangeError` listing
 * the problems if the result fails `checkRunConfig`.
 */
export function buildRunConfig(profile: Profile, choices: RunChoices, seed: number): RunConfig {
  const config: RunConfig = { party: [] };
  const ctx = { profile, seed, rng: Rng.seeded(seed, PREPARE_STREAM), config };
  for (const [key, section] of CHOICE_ENTRIES) section.apply(ctx, choices[key]);
  const bundles = upgradePartyBundles(profile);
  if (bundles.length > 0) config.partyBundles = [...(config.partyBundles ?? []), ...bundles];
  const mods = upgradeRunModifiers(profile);
  if (mods.length > 0) config.runModifiers = [...(config.runModifiers ?? []), ...mods];
  // The locked `metInRun` milestones' requirements, for `track.requirements` (ETH-121).
  const watch = milestoneRequirements(profile);
  if (watch.length > 0) config.watchRequirements = watch;
  const problems = checkRunConfig(config);
  if (problems.length > 0) throw new RangeError(`Invalid run config: ${problems.join('; ')}`);
  return config;
}

/**
 * Starts a run (ETH-119): `buildRunConfig`, then gives every party member a record id. This is the
 * one place ids are issued, so every way of launching a run (Descend, Start next run, Rematch,
 * auto-restart, time-away catch-up) calls it and stores the returned profile. `previous` is the
 * last run's config, for a Rematch: a member who matches one of its party (same name, class and
 * race, whose record is still active: not fallen, retired or trimmed) keeps that record, so the same adventurers carry on. Anyone else
 * is a new recruit and gets a new record, born in this run. Pure: the profile is not changed in
 * place, and `buildRunConfig` stays free of records.
 */
export function startRun(
  profile: Profile,
  choices: RunChoices,
  seed: number,
  previous?: RunConfig,
): { profile: Profile; config: RunConfig } {
  const built = buildRunConfig(profile, choices, seed);
  const run = profile.history.totals.runs + 1;
  let adventurers = profile.adventurers;
  const taken = new Set<string>();
  const party = built.party.map((member) => {
    const same = previous?.party.find(
      (p) =>
        p.recordId !== undefined &&
        !taken.has(p.recordId) &&
        adventurers.records[p.recordId]?.status === 'active' &&
        p.name === member.name &&
        p.classId === member.classId &&
        p.raceId === member.raceId,
    );
    if (same?.recordId !== undefined) {
      taken.add(same.recordId);
      return { ...member, recordId: same.recordId };
    }
    const made = newRecord(adventurers, { name: member.name, classId: member.classId, raceId: member.raceId, born: run });
    adventurers = made.slice;
    taken.add(made.record.id);
    return { ...member, recordId: made.record.id };
  });
  return { profile: { ...profile, adventurers }, config: { ...built, party } };
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
  problems.push(...runModifierListProblems(config.runModifiers ?? []));
  const contracts = config.contracts ?? [];
  for (const id of contracts) if (!CONTRACTS.has(id)) problems.push(`unknown contract "${id}"`);
  if (new Set(contracts).size !== contracts.length) problems.push('a contract is taken twice');
  (config.watchRequirements ?? []).forEach((req, i) => {
    for (const problem of requirementProblems(req, 'run')) problems.push(`watchRequirements[${i}].${problem}`);
  });
  try {
    configDepth(config);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return problems;
}
