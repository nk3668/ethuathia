/**
 * `buildRunConfig` (docs/ARCHITECTURE.md §6.3): profile and Prepare choices in, a checked
 * `RunConfig` out. The app's Descend, auto-restart and every later way of starting a run go
 * through it, so what the town bought always reaches the run.
 */
import { CLASSES, CONTRACTS, isBuildingQuest, ITEMS, RACES, RUN_GATE_INFO, upgradeBundle, upgradeRunGate } from '../../content';
import { Rng } from '../../core';
import { configDepth, hasBundle, omenModifiers, omenProblems, requirementProblems, runModifierListProblems } from '../../sim';
import type { AdventurerConfig, RunConfig, RunModifierConfig } from '../../sim';
import type { Profile } from '../profile';
import { milestoneRequirements } from '../milestones';
import { newRecord } from '../adventurers';
import { ownedNodes, rankOf } from '../upgrades';
import { CHOICE_ENTRIES } from './index';
import type { RunChoices } from './index';
import { withOptIns } from './optIns';
import { fillParty, MAX_PARTY_SIZE, partySize } from './party';
import { upgradeStartConfig } from './startPerks';

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
 * rank, the first keyed by the node id and the rest `<id>#<rank>`, so they stack. A gated grant (`when`) carries its gate into the modifier.
 */
export function upgradeRunModifiers(profile: Profile): RunModifierConfig[] {
  return ownedNodes(profile)
    .filter((node) => upgradeBundle(node, 'run') !== undefined)
    .flatMap((node) => {
      // A gated node (ETH-187: Extraction Drills, Waymark Lanterns) only counts while its gate holds.
      const when = upgradeRunGate(node);
      return Array.from({ length: rankOf(profile, node.id) }, (_, i): RunModifierConfig => ({
        key: i === 0 ? node.id : `${node.id}#${i + 1}`,
        source: { id: node.id, label: when === undefined ? node.name : `${node.name}, ${RUN_GATE_INFO[when].name}` },
        scope: 'party',
        bundle: node.id,
        ...(when === undefined ? {} : { when }),
      }));
    });
}

/**
 * The run modifiers owned upgrades give through the `xpBonus` and `contractRewardBonus` capacities
 * (ETH-132: Guild Chronicles, Contract Bounty): one per owned node that has either, keyed and
 * credited by the node, with every rank summed. The percent becomes a fraction (10 is 0.1).
 */
export function upgradeBonusModifiers(profile: Profile): RunModifierConfig[] {
  const out: RunModifierConfig[] = [];
  for (const node of ownedNodes(profile)) {
    const ranks = rankOf(profile, node.id);
    const sum = (key: string) =>
      node.grants.reduce((total, g) => (g.kind === 'capacity' && g.key === key ? total + g.amount * ranks : total), 0);
    const xp = sum('xpBonus');
    const contract = sum('contractRewardBonus');
    if (xp === 0 && contract === 0) continue;
    out.push({
      key: node.id,
      source: { id: node.id, label: node.name },
      scope: 'party',
      ...(xp === 0 ? {} : { xpBonus: xp / 100 }),
      ...(contract === 0 ? {} : { contractBonus: contract / 100 }),
    });
  }
  return out;
}


/**
 * The run config for `choices` on this profile: each `RUN_CHOICES` section applies its choice in
 * order (random recruits draw from `seed`, so the same seed gives the same party), then the
 * owned upgrades' party bundles are added to `partyBundles`, their run-scope bundle grants
 * become run modifiers (`upgradeRunModifiers`, ETH-115) and their start perks and trade bonus
 * fill the item config fields (`upgradeStartConfig`, ETH-159). The requirements of locked
 * `metInRun` milestones go into `watchRequirements` (ETH-121). Throws a `RangeError` listing
 * the problems if the result fails `checkRunConfig`.
 */
export function buildRunConfig(profile: Profile, choices: RunChoices, seed: number): RunConfig {
  const config: RunConfig = { party: [] };
  const ctx = { profile, seed, rng: Rng.seeded(seed, PREPARE_STREAM), config };
  for (const [key, section] of CHOICE_ENTRIES) section.apply(ctx, choices[key]);
  // Opt-in nodes count only when switched on (ETH-187); the sections above read the real profile.
  const active = withOptIns(profile, choices.optIns);
  const bundles = upgradePartyBundles(active);
  if (bundles.length > 0) config.partyBundles = [...(config.partyBundles ?? []), ...bundles];
  const mods = [...upgradeRunModifiers(active), ...upgradeBonusModifiers(active)];
  if (mods.length > 0) config.runModifiers = [...(config.runModifiers ?? []), ...mods];
  // The Smithy's start perks and trade bonus (ETH-159).
  Object.assign(config, upgradeStartConfig(active));
  // The locked `metInRun` milestones' requirements, for `track.requirements` (ETH-121).
  const watch = milestoneRequirements(profile);
  if (watch.length > 0) config.watchRequirements = watch;
  const problems = checkRunConfig(config);
  if (problems.length > 0) throw new RangeError(`Invalid run config: ${problems.join('; ')}`);
  return config;
}

/**
 * The party the Prepare screen's random fill gives `seed`: `size` recruits (default: the
 * profile's party size) from the profile's available classes and races, with names, drawn from
 * the `prepare` stream exactly as `buildRunConfig` draws them. For `size === partySize(profile)`
 * it is `buildRunConfig(profile, defaultRunChoices(), seed).party`. The sim harness's
 * `--recruits` uses it (ETH-178).
 */
export function recruitParty(profile: Profile, seed: number, size: number = partySize(profile)): AdventurerConfig[] {
  const config: RunConfig = { party: [] };
  fillParty({ profile, seed, rng: Rng.seeded(seed, PREPARE_STREAM), config }, [], size);
  return config.party;
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
  const omenIssues = omenProblems(config.omens);
  problems.push(...omenIssues);
  problems.push(...runModifierListProblems([...(config.runModifiers ?? []), ...(omenIssues.length === 0 ? omenModifiers(config.omens) : [])]));
  for (const { item } of config.startStock ?? []) if (!ITEMS.has(item)) problems.push(`unknown starting item "${item}"`);
  const contracts = config.contracts ?? [];
  for (const id of contracts) if (!CONTRACTS.has(id)) problems.push(`unknown contract "${id}"`);
  if (new Set(contracts).size !== contracts.length) problems.push('a contract is taken twice');
  if (contracts.filter((id) => CONTRACTS.has(id) && isBuildingQuest(CONTRACTS.get(id))).length > 1) problems.push('only one building quest may be taken per run');
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
