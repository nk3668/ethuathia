import { describe, expect, it } from 'vitest';
import { formatComparison, makeReport, parseReport, parseReportText } from '../../tools/compare';
import { formatReport, runSeeds } from '../../tools/headless';
import type { SeedResult } from '../../tools/headless';

const ARGS = { from: 1, seeds: 3, cap: 1000, party: 1 };

describe('tools/compare', () => {
  it('reads the printed report table back, for refs from before --json', () => {
    const results = runSeeds(1, 3);
    const parsed = parseReportText(formatReport(results));
    expect(parsed.map((r) => [r.seed, r.turns, r.outcome, r.stuck.count, r.hash])).toEqual(
      results.map((r) => [r.seed, r.turns, r.outcome, r.stuck.count, r.hash]),
    );
    expect(parsed[0]?.explored.fraction).toBeCloseTo(results[0]?.explored.fraction ?? 0, 3);
  });

  it('round-trips a JSON report and rejects anything else', () => {
    const report = makeReport(ARGS, runSeeds(1, 2));
    expect(parseReport(JSON.stringify(report), 'r.json')).toEqual(report);
    expect(() => parseReport('{"version":99}', 'old.json')).toThrow('old.json is not a sim report');
    expect(() => parseReport('nope', 'bad.json')).toThrow('bad.json is not JSON');
  });

  it('prints before, after and delta per metric, and which seeds changed', () => {
    const before = makeReport(ARGS, runSeeds(1, 3));
    const same = formatComparison(before, before);
    expect(same).toMatch(/^metric\s+before\s+after\s+delta/);
    expect(same).toMatch(/floors\s+3\s+3\s+0/);
    expect(same).toContain('all 3 shared seeds end the same');

    const slower: SeedResult[] = before.results.map((r) => (r.seed === 2 ? { ...r, turns: r.turns + 50, hash: 'changed' } : r));
    const text = formatComparison(before, makeReport(ARGS, slower));
    expect(text).toMatch(/turns, mean \(done\)\s+[\d.]+\s+[\d.]+\s+\+16\.7 \(\+\d+\.\d%\)/);
    expect(text).toContain('1 of 3 shared seeds end differently: 2.');

    const other = formatComparison(before, makeReport({ ...ARGS, cap: 500 }, before.results));
    expect(other).toContain('Warning: the reports ran with different arguments');
  });
});
