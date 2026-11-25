import { describe, expect, it } from 'vitest';
import { milestoneRequirements, newProfile } from '../../src/meta';
import { CONDITIONS as SIM_CONDITIONS, createRun, getStat, RULE_ACTIONS as SIM_RULE_ACTIONS } from '../../src/sim';
import type { Entity, Rule } from '../../src/sim';
import {
  bankedRenown,
  buildHeadlessConfig,
  buildHeadlessProfile,
  CAUTIOUS_RULES,
  DEFAULT_TURN_CAP,
  defaultJobs,
  flagReason,
  formatReport,
  headlessParty,
  median,
  formatPartySweep,
  parseSimArgs,
  partySweepWarnings,
  PROGRESSED_UPGRADES,
  renownPerHour,
  resolveHeadlessRules,
  runSeed,
  runSeeds,
  STEPS_PER_HOUR_AT_1X,
  summarizeReport,
} from '../../tools/headless';
import type { SeedResult } from '../../tools/headless';

const result = (seed: number, over: Partial<SeedResult> = {}): SeedResult => ({
  seed,
  outcome: 'done',
  turns: 200,
  steps: 221,
  explored: { seen: 300, total: 300, fraction: 1 },
  stuck: { count: 0, firstTurn: null },
  hash: '00000000000000',
  depth: 2,
  bottom: 2,
  floors: [
    { depth: 1, turns: 120, explored: 1 },
    { depth: 2, turns: 80, explored: 1 },
  ],
  ...over,
});

describe('tools/headless', () => {
  it('runs seeded dungeons to the bottom and reports depth, turns per floor and explored share', () => {
    // Two floors with a full party keep the test quick and reliably victorious; CLI defaults apply elsewhere.
    const results = runSeeds(1, 3, { depth: 2, party: headlessParty(4) });
    expect(results.map((r) => r.seed)).toEqual([1, 2, 3]);
    for (const r of results) {
      expect(r.outcome, `seed ${r.seed}`).toBe('done');
      // The baseline fetches the relic on the bottom floor and walks out with it: a victory (ETH-024).
      expect(r.end, `seed ${r.seed}`).toBe('victory');
      expect(r.contracts, `seed ${r.seed}`).toBe(1);
      expect(r.runTurns, `seed ${r.seed}`).toBeGreaterThan(r.turns);
      expect(r.atRisk?.renown, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.depth, `seed ${r.seed}`).toBe(2);
      expect(r.bottom, `seed ${r.seed}`).toBe(2);
      expect(r.floors?.map((f) => f.depth)).toEqual([1, 2]);
      for (const f of r.floors ?? []) {
        expect(f.turns, `seed ${r.seed} floor ${f.depth}`).toBeGreaterThan(50);
        // Floors above the bottom are explored fully; on the bottom the party leaves once it has the relic.
        if (f.depth < 2) expect(f.explored, `seed ${r.seed} floor ${f.depth}`).toBe(1);
        else expect(f.explored, `seed ${r.seed} floor ${f.depth}`).toBeGreaterThan(0);
      }
      expect(r.floors?.reduce((n, f) => n + f.turns, 0)).toBe(r.turns);
      expect(r.explored.fraction, `seed ${r.seed}`).toBe(1);
      expect(r.stuck.count, `seed ${r.seed}`).toBe(0);
      expect(r.turns, `seed ${r.seed}`).toBeGreaterThan(50);
      // It ran on past the settling turn only to be sure the party had stopped.
      expect(r.steps).toBeGreaterThan(r.turns);
      expect(r.steps).toBeLessThan(DEFAULT_TURN_CAP);
    }
    // The same seed gives the same run.
    expect(runSeed(2, { depth: 2, party: headlessParty(4) })).toEqual(results[1]);
  });

  it('stops at the turn cap with the floor part-explored', () => {
    const r = runSeed(1, { cap: 30 });
    expect(r).toMatchObject({ outcome: 'cap', steps: 30 });
    expect(r.explored.fraction).toBeGreaterThan(0);
    expect(r.explored.fraction).toBeLessThan(1);
    expect(r.depth).toBe(1);
    expect(r.bottom).toBeGreaterThanOrEqual(6);
    expect(r.bottom).toBeLessThanOrEqual(10);
    expect(flagReason(r, 30)).toMatch(new RegExp(`^hit the turn cap \\(30 party turns\\) on floor 1 of ${r.bottom} at \\d+\\.\\d% explored$`));
  });

  it('runs a bigger party', () => {
    const r = runSeed(1, { party: headlessParty(2), depth: 2 });
    expect(r.outcome).toBe('done');
    expect(r.turns).toBeLessThan(runSeed(1, { depth: 2 }).turns);
  });

  it('lists seeds that hit the cap or triggered stuck detection', () => {
    const results = [
      result(1),
      result(2, { outcome: 'cap', turns: 1000, depth: 1, explored: { seen: 150, total: 300, fraction: 0.5 }, floors: [{ depth: 1, turns: 1000, explored: 0.5 }] }),
      result(3, { stuck: { count: 2, firstTurn: 130 } }),
      result(4, { turns: 100 }),
      result(5, { outcome: 'idle', depth: 1, floors: [{ depth: 1, turns: 200, explored: 1 }] }),
    ];
    const report = formatReport(results);
    expect(report).toContain('5 runs: 3 reached the bottom, 1 settled above it, 1 hit the turn cap, 1 triggered stuck detection.');
    expect(report).toContain('Turns to the bottom (done runs): mean 167, min 100, max 200.');
    expect(report).toContain('Depth reached: mean 1.6, min 1, max 2. Turns per floor: mean 225, max 1000.');
    expect(report).toContain(
      'Flagged seeds:\n' +
        `  seed 2: hit the turn cap (${DEFAULT_TURN_CAP} party turns) on floor 1 of 2 at 50.0% explored\n` +
        '  seed 3: stuck detection fired 2 times (first on turn 130)\n' +
        '  seed 5: settled on floor 1 of 2 with no way further down',
    );
    const lines = report.split('\n');
    expect(lines[0]).toBe('seed  turns  depth  explored  stuck  result  state hash');
    expect(lines[3]).toBe('   3    200    2/2    100.0%      2  done    00000000000000');
  });

  it('reports run outcomes and flags runs that ended above the bottom', () => {
    const report = formatReport([
      result(1, { end: 'retreat', runTurns: 300 }),
      result(2, { outcome: 'early', end: 'wipe', runTurns: 90, turns: 90, depth: 1, floors: [{ depth: 1, turns: 90, explored: 0.5 }] }),
    ]);
    expect(report).toContain('2 runs: 1 reached the bottom, 1 ended above it, 0 hit the turn cap');
    expect(report).toContain('Run outcomes: 1 retreat, 1 wipe.');
    expect(report).toContain('  seed 2: ended (wipe) on turn 90 without reaching the bottom (floor 1 of 2)');
    expect(report.split('\n')[1]).toMatch(/done \(retreat\)/);
  });

  it('names every death cause and reports mean member level beside the highest (ETH-145)', () => {
    // A party of 4 on progressed upgrades dies often; status deaths (poison) must name the status.
    const results = runSeeds(1, 3, { preset: 'progressed', party: headlessParty(4) });
    const causes = new Set(results.flatMap((r) => Object.keys(r.deathCauses ?? {})));
    expect(causes.has('other')).toBe(false);
    expect(causes.has('unknown')).toBe(false);
    expect([...causes].every((c) => c.startsWith('monster.') || c.startsWith('status.') || c.startsWith('trap.'))).toBe(true);
    for (const r of results) expect(r.meanLevel).toBeLessThanOrEqual(r.level ?? 0);
    const summary = summarizeReport([result(1, { level: 6, meanLevel: 4 }), result(2, { level: 4, meanLevel: 3 })]);
    expect(summary.memberLevelMean).toBeCloseTo(3.5, 6);
    expect(formatReport([result(1, { level: 6, meanLevel: 4 })])).toContain('Member level (mean of members): mean 4.00.');
  }, 60_000);

  it('reports kills and what killed the party', () => {
    const results = [
      result(1, { kills: 10, deaths: 0, deathCauses: {} }),
      result(2, { kills: 4, deaths: 2, deathCauses: { 'monster.gloam_rat': 1, 'monster.mossling': 1 } }),
    ];
    expect(formatReport(results)).toContain('Kills per run: mean 7.0. Deaths: 2 (monster.gloam_rat 1, monster.mossling 1).');
  });

  it('computes banked Renown per hour at 1x speed and prints it in the report (ETH-085)', () => {
    // Missing `lost` (pre-ETH-023 report) or zero steps yields null.
    expect(bankedRenown(result(1))).toBeNull();
    expect(renownPerHour([result(1)])).toBeNull();
    expect(renownPerHour([result(1, { steps: 0, atRisk: { renown: 100 }, lost: {} })])).toBeNull();

    // Time-weighted across runs: (90 + 360) banked / (1800 + 7200 steps = 0.5 hr) = 900/hr.
    const runs = [
      result(1, { steps: 1800, atRisk: { renown: 120 }, lost: { renown: 30 } }),
      result(2, { steps: 7200, atRisk: { renown: 360 }, lost: {} }),
    ];
    expect(STEPS_PER_HOUR_AT_1X).toBe(18_000);
    expect(bankedRenown(runs[0] as SeedResult)).toBe(90);
    expect(renownPerHour(runs)).toBeCloseTo(900, 6);
    expect(formatReport(runs)).toContain('Renown banked per run: mean 225.0, 900.0/hr at 1x (5 steps/s).');
  });

  it('says so when no seed needs a look', () => {
    const report = formatReport([result(1)]);
    expect(report).toContain('1 run: 1 reached the bottom, 0 hit the turn cap, 0 triggered stuck detection.');
    expect(report.endsWith('Flagged seeds: none.')).toBe(true);
  });

  it('reads the command line', () => {
    expect(parseSimArgs([])).toEqual({
      seeds: 10,
      from: 1,
      cap: DEFAULT_TURN_CAP,
      party: 1,
      preset: 'fresh',
      upgrades: [],
      optIns: true,
      rules: 'baseline',
      classId: null,
      raceId: null,
      contract: null,
      omens: [],
      recruits: false,
      partySweep: false,
      jobs: defaultJobs(),
      json: null,
      compare: null,
      baseline: null,
      help: false,
    });
    expect(parseSimArgs(['--seeds', '25', '--from', '100', '--cap', '400', '--party', '3'])).toEqual({
      seeds: 25,
      from: 100,
      cap: 400,
      party: 3,
      preset: 'fresh',
      upgrades: [],
      optIns: true,
      rules: 'baseline',
      classId: null,
      raceId: null,
      contract: null,
      omens: [],
      recruits: false,
      partySweep: false,
      jobs: defaultJobs(),
      json: null,
      compare: null,
      baseline: null,
      help: false,
    });
    expect(parseSimArgs(['--preset', 'progressed', '--rules', 'cautious'])).toMatchObject({
      preset: 'progressed',
      party: 3,
      rules: 'cautious',
      upgrades: [],
      optIns: true,
    });
    expect(parseSimArgs(['--omens', 'deep_surge:3,omen.cursed_hoards:1']).omens).toEqual([
      { id: 'omen.deep_surge', rank: 3 },
      { id: 'omen.cursed_hoards', rank: 1 },
    ]);
    expect(() => parseSimArgs(['--omens', 'deep_surge:4'])).toThrow(/rank for omen.deep_surge/);
    expect(() => parseSimArgs(['--omens', 'nothing:1'])).toThrow(/not an Omen/);
    expect(() => parseSimArgs(['--omens', 'deep_surge'])).toThrow(/id:rank/);
    expect(parseSimArgs(['--preset', 'progressed', '--party', '2'])).toMatchObject({
      preset: 'progressed',
      party: 2,
    });
    expect(parseSimArgs(['--upgrades', 'upgrade.second_berth, upgrade.hardy_recruits'])).toMatchObject({
      preset: 'fresh',
      party: 2,
      upgrades: ['upgrade.second_berth', 'upgrade.hardy_recruits'],
      optIns: true,
    });
    expect(parseSimArgs(['--upgrades', 'upgrade.hardy_recruits,upgrade.contract_bounty'])).toMatchObject({
      preset: 'fresh',
      party: 1,
      upgrades: ['upgrade.hardy_recruits', 'upgrade.contract_bounty'],
      optIns: true,
    });
    expect(parseSimArgs(['--json', 'out.json', '--compare', 'origin/main'])).toMatchObject({ json: 'out.json', compare: 'origin/main' });
    expect(() => parseSimArgs(['--compare', 'main', '--baseline', 'b.json'])).toThrow('not both');
    expect(parseSimArgs(['--help']).help).toBe(true);
    expect(parseSimArgs(['--opt-ins', 'off']).optIns).toBe(false);
    expect(() => parseSimArgs(['--opt-ins', 'maybe'])).toThrow('on or off');
    expect(() => parseSimArgs(['--seeds', '0'])).toThrow('--seeds must be a whole number from 1 up, got "0"');
    expect(() => parseSimArgs(['--party', '5'])).toThrow('--party must be a whole number from 1 to 4, got "5"');
    expect(() => parseSimArgs(['--seeds', '2.5'])).toThrow('--seeds');
    expect(() => parseSimArgs(['--preset', 'mythic'])).toThrow('--preset');
    expect(() => parseSimArgs(['--rules', 'reckless'])).toThrow('--rules');
    expect(() => parseSimArgs(['--upgrades', ''])).toThrow('--upgrades');
    expect(() => parseSimArgs(['--upgrades', 'upgrade.nope'])).toThrow('Unknown upgrade "upgrade.nope"');
    // Rule Clerk is in the Guild Hall's gated Tier II, so a sweep can't apply it.
    expect(() => parseSimArgs(['--upgrades', 'upgrade.rule_clerk'])).toThrow('Tier 4 and up open');
    expect(() => parseSimArgs(['--bogus'])).toThrow();
  });

  it('applies Guild Hall upgrades and presets accurately through meta helpers', () => {
    const freshConfig = buildHeadlessConfig();
    expect(freshConfig).toEqual({
      party: headlessParty(1),
      contracts: ['contract.recover_relic'],
      watchRequirements: milestoneRequirements(newProfile()),
    });

    const progressedProfile = buildHeadlessProfile('progressed');
    expect(progressedProfile.upgrades.owned).toEqual(PROGRESSED_UPGRADES);
    const progressedConfig = buildHeadlessConfig({ preset: 'progressed' });
    expect(progressedConfig.party).toHaveLength(3);
    expect(progressedConfig.partyBundles).toEqual(['upgrade.hardy_recruits']);

    const upgradedConfig = buildHeadlessConfig({ upgrades: ['upgrade.hardy_recruits', 'upgrade.contract_bounty'] });
    expect(upgradedConfig.runModifiers).toEqual([
      { key: 'upgrade.contract_bounty:bonus', source: { id: 'upgrade.contract_bounty', label: 'Contract Bounty' }, scope: 'party', contractBonus: 0.1 },
    ]);
    const plainState = createRun(freshConfig, 1);
    const upgradedState = createRun(upgradedConfig, 1);
    const plainHero = plainState.entities[plainState.party[0] as number] as Entity;
    const upgradedHero = upgradedState.entities[upgradedState.party[0] as number] as Entity;
    expect(getStat(upgradedState, upgradedHero, 'hp').value).toBe(getStat(plainState, plainHero, 'hp').value + 3);
    expect(getStat(upgradedState, upgradedHero, 'hp').parts).toContainEqual({
      op: 'add',
      value: 3,
      source: { id: 'upgrade.hardy_recruits', label: 'Hardy Recruits' },
    });

    expect(() => buildHeadlessProfile('progressed', ['upgrade.rule_clerk'])).toThrow(/Tier 4 and up open/);
    // A trailing ! attaches a node behind a closed tier, and id*N takes a rank (ETH-187), even on a preset-owned node.
    const forced = buildHeadlessProfile('progressed', ['upgrade.rule_clerk!', 'upgrade.contract_bounty*3', 'upgrade.hardy_recruits*3']);
    expect(forced.upgrades.owned).toContain('upgrade.rule_clerk');
    expect(forced.upgrades.ranks['upgrade.contract_bounty']).toBe(3);
    expect(forced.upgrades.ranks['upgrade.hardy_recruits']).toBe(3);
    const stamped = buildHeadlessConfig({ upgrades: ['upgrade.forge_stamps!'], recruits: true }, 1);
    expect(stamped.stamps).toBe(true);
    expect(stamped.party.every((m) => m.stamp !== undefined)).toBe(true);
    expect(() => buildHeadlessProfile('fresh', ['upgrade.hardy_recruits*9'])).toThrow(/at most 5 ranks/);
    expect(() => buildHeadlessProfile('fresh', ['upgrade.hardy_recruits*0'])).toThrow(/rank must be/);
  });

  it('validates and runs baseline and cautious behavior rules deterministically', () => {
    for (const rule of CAUTIOUS_RULES) {
      expect(SIM_CONDITIONS.get(rule.condition.id).check(rule.condition.params)).toBeNull();
      expect(SIM_RULE_ACTIONS.get(rule.action.id).check(rule.action.params)).toBeNull();
    }
    expect(resolveHeadlessRules('baseline')).toEqual([]);
    expect(resolveHeadlessRules('cautious')).toEqual(CAUTIOUS_RULES);
    expect(() => resolveHeadlessRules([{ condition: { id: 'cond.bogus' }, action: { id: 'act.wait' }, enabled: true }])).toThrow(
      'unknown condition',
    );
    expect(() => resolveHeadlessRules([{ condition: { id: 'cond.always' }, action: { id: 'act.bogus' }, enabled: true }])).toThrow(
      'unknown rule action',
    );
    const badParamRule: Rule = { condition: { id: 'cond.hp_below', params: { percent: 200 } }, action: { id: 'act.flee' }, enabled: true };
    expect(() => resolveHeadlessRules([badParamRule])).toThrow('percent');

    // Baseline matches default unchanged; cautious runs deterministically and still computes banked renown/hr.
    expect(runSeed(1, { depth: 2, party: headlessParty(4), rules: 'baseline' })).toEqual(
      runSeed(1, { depth: 2, party: headlessParty(4) }),
    );
    const cautiousA = runSeed(1, { depth: 2, party: headlessParty(4), rules: 'cautious' });
    const cautiousB = runSeed(1, { depth: 2, party: headlessParty(4), rules: 'cautious' });
    expect(cautiousA).toEqual(cautiousB);
    expect(cautiousA.outcome).not.toBe('stalled');
    expect(renownPerHour([cautiousA])).not.toBeNull();

    const progressedReport = formatReport(runSeeds(1, 2, { depth: 2, preset: 'progressed', rules: 'cautious' }));
    expect(progressedReport).toContain('Renown banked per run:');
    expect(progressedReport).toContain('/hr at 1x');
  });

  it('computes and formats §2 / §9 summary metrics (rates, medians, party level, deaths/run)', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([10, 2, 6])).toBe(6);
    expect(median([10, 2, 6, 4])).toBe(5);

    const results: SeedResult[] = [
      result(1, {
        outcome: 'done',
        end: 'victory',
        turns: 200,
        runTurns: 310,
        steps: 300,
        depth: 6,
        bottom: 6,
        level: 5,
        deaths: 0,
        turnedBack: true,
        relicTaken: true,
        atRisk: { renown: 300 },
        lost: {},
      }),
      result(2, {
        outcome: 'done',
        end: 'wipe',
        turns: 180,
        runTurns: 250,
        steps: 240,
        depth: 6,
        bottom: 6,
        level: 4,
        deaths: 1,
        deathCauses: { 'monster.cavern_brute': 1 },
        turnedBack: true,
        relicTaken: true,
        atRisk: { renown: 200 },
        lost: { renown: 50 },
      }),
      result(3, {
        outcome: 'early',
        end: 'retreat',
        turns: 120,
        runTurns: 190,
        steps: 180,
        depth: 3,
        bottom: 8,
        level: 3,
        deaths: 0,
        turnedBack: true,
        relicTaken: false,
        atRisk: { renown: 90 },
        lost: {},
      }),
      result(4, {
        outcome: 'early',
        end: 'wipe',
        turns: 80,
        runTurns: 80,
        steps: 80,
        depth: 2,
        bottom: 7,
        level: 2,
        deaths: 1,
        deathCauses: { 'monster.gloam_rat': 1 },
        turnedBack: false,
        relicTaken: false,
        atRisk: { renown: 20 },
        lost: { renown: 5 },
      }),
    ];

    const summary = summarizeReport(results);
    expect(summary.winRatePct).toBeCloseTo(25, 6);
    expect(summary.retreatRatePct).toBeCloseTo(25, 6);
    expect(summary.wipeRatePct).toBeCloseTo(50, 6);
    expect(summary.depthMedian).toBe(4.5);
    expect(summary.floor3PlusCount).toBe(3);
    expect(summary.floor3PlusRatePct).toBeCloseTo(75, 6);
    expect(summary.levelMean).toBeCloseTo(3.5, 6);
    expect(summary.levelMedian).toBe(3.5);
    expect(summary.deathsPerRun).toBeCloseTo(0.5, 6);
    expect(summary.turnsDoneMedian).toBe(190);
    expect(summary.turnsAllMedian).toBe(220);
    expect(summary.relicRuns).toBe(2);
    expect(summary.relicReturnTripWipes).toBe(1);
    expect(summary.returnTripLethalityPct).toBeCloseTo(50, 6);

    const report = formatReport(results);
    expect(report).toContain(
      'Outcome rates: win 25.0%, retreat 25.0%, wipe 50.0%. Return-trip lethality (relic runs): 50.0% (1/2).',
    );
    expect(report).toContain('Turns to the bottom (done runs): mean 190, min 180, max 200. Median: 190.');
    expect(report).toContain('Turns (all runs): mean 208, median 220, min 80, max 310.');
    expect(report).toContain('Median depth: 4.5, floor 3+: 75.0% (3/4).');
    expect(report).toContain('Party level (highest member): mean 3.50, median 3.5 (min 2, max 5).');
    expect(report).toContain('Deaths per run: 0.50.');
    expect(report).toContain('/hr at 1x (5 steps/s).');
  });
});

describe('party-size sweep (ETH-145)', () => {
  const row = (size: number, winRatePct: number) => ({
    size,
    runs: 100,
    winRatePct,
    retreatRatePct: 0,
    wipeRatePct: 100 - winRatePct,
    levelHighest: 6,
    levelMember: 5.5,
    deathsPerRun: 1,
  });

  it('parses --party-sweep', () => {
    expect(parseSimArgs([]).partySweep).toBe(false);
    expect(parseSimArgs(['--party-sweep']).partySweep).toBe(true);
  });

  it('is quiet when win rate rises with party size and party 4 wins twice as often as solo', () => {
    const rows = [row(1, 20), row(2, 30), row(3, 40), row(4, 50)];
    expect(partySweepWarnings(rows)).toEqual([]);
    expect(formatPartySweep(rows)).toContain('Party-size ordering holds');
  });

  it('warns when a larger party does no better, or the 2x rule fails', () => {
    const flat = partySweepWarnings([row(1, 30), row(2, 30), row(3, 40), row(4, 70)]);
    expect(flat).toEqual(['ordering broken: party 2 wins 30.0%, not more than party 1 at 30.0%']);
    const weak = partySweepWarnings([row(1, 40), row(2, 50), row(3, 60), row(4, 70)]);
    expect(weak).toHaveLength(1);
    expect(weak[0]).toContain('ratio not met');
    expect(weak[0]).toContain('ETH-080');
    expect(formatPartySweep([row(1, 40), row(2, 30), row(3, 60), row(4, 70)])).toContain('WARNING: ordering broken');
  });
});
