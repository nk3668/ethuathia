import { describe, expect, it } from 'vitest';
import { clampRange } from '../../src/core';

describe('clampRange', () => {
  const DEFAULTS = { min: 2, max: 5 };

  it('uses defaults when options or bounds are omitted', () => {
    expect(clampRange(undefined, DEFAULTS)).toEqual({ min: 2, max: 5 });
    expect(clampRange({}, DEFAULTS)).toEqual({ min: 2, max: 5 });
  });

  it('honors { max: 0 } instead of bumping min up to a positive defaultMin', () => {
    expect(clampRange({ max: 0 }, DEFAULTS)).toEqual({ min: 0, max: 0 });
    expect(clampRange({ min: 0, max: 0 }, DEFAULTS)).toEqual({ min: 0, max: 0 });
    expect(clampRange({ min: 5, max: 2 }, DEFAULTS)).toEqual({ min: 2, max: 2 });
  });

  it('expands max when only min is provided above defaultMax', () => {
    expect(clampRange({ min: 5 }, DEFAULTS)).toEqual({ min: 5, max: 5 });
    expect(clampRange({ min: 8 }, DEFAULTS)).toEqual({ min: 8, max: 8 });
  });

  it('clamps bounds to at least the floor argument (default 0)', () => {
    expect(clampRange({ min: -3, max: -1 }, DEFAULTS)).toEqual({ min: 0, max: 0 });
    expect(clampRange({ min: 0, max: 0 }, DEFAULTS, 1)).toEqual({ min: 1, max: 1 });
  });
});
