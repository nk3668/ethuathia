import { describe, expect, it } from 'vitest';
import { defaultJobs, formatReport, headlessParty, MAX_JOBS, parseSimArgs, runSeeds } from '../../tools/headless';
import { runPartySweep, runSeedsParallel } from '../../tools/parallel';
import { makeReport } from '../../tools/compare';

describe('parallel harness (ETH-152)', () => {
  it('gives the same report for --jobs 1 and --jobs 3', async () => {
    const cap = 300;
    const options = { cap, party: headlessParty(1) };
    const serial = runSeeds(1, 6, options);
    const parallel = await runSeedsParallel(1, 6, options, 3);
    expect(parallel.map((r) => r.seed)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parallel.map((r) => r.hash)).toEqual(serial.map((r) => r.hash));
    expect(formatReport(parallel, cap)).toBe(formatReport(serial, cap));
    const args = { from: 1, seeds: 6, cap, party: 1 };
    expect(JSON.stringify(makeReport(args, parallel))).toBe(JSON.stringify(makeReport(args, serial)));
  }, 60_000);

  it('gives the same --party-sweep table for --jobs 1 and --jobs 3', async () => {
    const base = { from: 1, seeds: 3, cap: 200, preset: 'fresh' as const, upgrades: [], rules: 'baseline' as const };
    const one = await runPartySweep({ ...base, jobs: 1 });
    const three = await runPartySweep({ ...base, jobs: 3 });
    expect(three).toBe(one);
  }, 120_000);

  it('parses --jobs', () => {
    expect(parseSimArgs([]).jobs).toBe(defaultJobs());
    expect(parseSimArgs(['--jobs', '4']).jobs).toBe(4);
    expect(() => parseSimArgs(['--jobs', '0'])).toThrow(/--jobs/);
    expect(() => parseSimArgs(['--jobs', String(MAX_JOBS + 1)])).toThrow(/--jobs/);
  });
});
