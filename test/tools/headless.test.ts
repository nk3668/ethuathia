import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TURN_CAP,
  flagReason,
  formatReport,
  headlessParty,
  parseSimArgs,
  runSeed,
  runSeeds,
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
    // Two floors keep the test quick; the command line runs the default ten.
    const results = runSeeds(1, 3, { depth: 2 });
    expect(results.map((r) => r.seed)).toEqual([1, 2, 3]);
    for (const r of results) {
      expect(r.outcome, `seed ${r.seed}`).toBe('done');
      expect(r.depth, `seed ${r.seed}`).toBe(2);
      expect(r.bottom, `seed ${r.seed}`).toBe(2);
      expect(r.floors?.map((f) => f.depth)).toEqual([1, 2]);
      for (const f of r.floors ?? []) {
        expect(f.turns, `seed ${r.seed} floor ${f.depth}`).toBeGreaterThan(50);
        expect(f.explored, `seed ${r.seed} floor ${f.depth}`).toBe(1);
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
    expect(runSeed(2, { depth: 2 })).toEqual(results[1]);
  });

  it('stops at the turn cap with the floor part-explored', () => {
    const r = runSeed(1, { cap: 30 });
    expect(r).toMatchObject({ outcome: 'cap', steps: 30 });
    expect(r.explored.fraction).toBeGreaterThan(0);
    expect(r.explored.fraction).toBeLessThan(1);
    expect(r.depth).toBe(1);
    expect(flagReason(r, 30)).toMatch(/^hit the turn cap \(30 party turns\) on floor 1 of 10 at \d+\.\d% explored$/);
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
      json: null,
      compare: null,
      baseline: null,
      help: false,
    });
    expect(parseSimArgs(['--json', 'out.json', '--compare', 'origin/main'])).toMatchObject({ json: 'out.json', compare: 'origin/main' });
    expect(() => parseSimArgs(['--compare', 'main', '--baseline', 'b.json'])).toThrow('not both');
    expect(parseSimArgs(['--help']).help).toBe(true);
    expect(() => parseSimArgs(['--seeds', '0'])).toThrow('--seeds must be a whole number from 1 up, got "0"');
    expect(() => parseSimArgs(['--party', '5'])).toThrow('--party must be a whole number from 1 to 4, got "5"');
    expect(() => parseSimArgs(['--seeds', '2.5'])).toThrow('--seeds');
    expect(() => parseSimArgs(['--bogus'])).toThrow();
  });
});
