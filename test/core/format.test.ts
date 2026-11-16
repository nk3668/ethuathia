import { describe, expect, it } from 'vitest';
import { formatNumber } from '../../src/core';

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [12.9, '12'],
    [1000, '1k'],
    [1200, '1.2k'],
    [1999, '1.9k'],
    [12_400, '12.4k'],
    [123_456, '123.4k'],
    [999_999, '999.9k'],
    [1_000_000, '1M'],
    [3_400_000, '3.4M'],
    [2_000_000_000, '2B'],
    [4.56e12, '4.5T'],
    [1e15, '1Qa'],
    [1e33, '1Dc'],
    [1.5e36, '1500Dc'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  it('handles negatives without showing -0', () => {
    expect(formatNumber(-1200)).toBe('-1.2k');
    expect(formatNumber(-5)).toBe('-5');
    expect(formatNumber(-0.4)).toBe('0');
    expect(formatNumber(-0)).toBe('0');
  });

  it('never uses scientific notation', () => {
    for (let exp = 0; exp <= 40; exp++) {
      expect(formatNumber(10 ** exp)).not.toMatch(/e/i);
      expect(formatNumber(10 ** exp - 1)).not.toMatch(/e/i);
    }
  });

  it('is correct at every power of 1000 boundary', () => {
    const suffixes = ['k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    suffixes.forEach((suffix, i) => {
      expect(formatNumber(1000 ** (i + 1))).toBe(`1${suffix}`);
    });
  });

  it('shows non-finite values plainly', () => {
    expect(formatNumber(Infinity)).toBe('∞');
    expect(formatNumber(-Infinity)).toBe('-∞');
    expect(formatNumber(Number.NaN)).toBe('NaN');
  });
});
