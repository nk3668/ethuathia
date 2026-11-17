/**
 * The soak gate (docs/ARCHITECTURE.md §11): 30 seeds, party sizes 1 to 4, every invariant after
 * every step, a save and load halfway that must carry on identically, no throws and no stuck
 * storms. `npm run soak -- --seeds N --cap T` runs the same thing bigger.
 */
import { describe, expect, it } from 'vitest';
import { registerInvariant } from '../../src/sim';
import { formatSoakReport, soakFailures, soakPartySize, soakSeed, soakSeeds, TEST_SOAK_CAP } from '../../tools/soak';

const SEEDS = 30;

describe('soak', () => {
  it(`runs ${SEEDS} seeds for ${TEST_SOAK_CAP} party turns with every invariant holding`, () => {
    const results = soakSeeds(1, SEEDS, { cap: TEST_SOAK_CAP });
    expect(soakFailures(results), formatSoakReport(results, TEST_SOAK_CAP)).toEqual([]);
    for (const r of results) expect(r.steps, `seed ${r.seed}`).toBe(TEST_SOAK_CAP);
    expect(new Set(results.map((r) => r.party))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('is deterministic', () => {
    expect(soakSeed(3, { cap: 40 })).toEqual(soakSeed(3, { cap: 40 }));
  });

  it('cycles party sizes by seed', () => {
    expect([0, 1, 2, 3, 4, 5].map(soakPartySize)).toEqual([4, 1, 2, 3, 4, 1]);
  });

  it('fails a seed when an invariant breaks, naming the step', () => {
    const remove = registerInvariant('test.turnLimit', (s) => (s.turn >= 5 ? ['turn reached 5'] : []));
    try {
      const result = soakSeed(1, { cap: 20 });
      expect(result.outcome).toBe('failed');
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toMatch(/^step \d+ \(turn 5\): \[test\.turnLimit\] turn reached 5$/);
      expect(soakFailures([result])[0]).toMatch(/^seed 1 \(party of 1\): step/);
    } finally {
      remove();
    }
  });
});
