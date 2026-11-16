/**
 * Number formatting for counts and currencies: suffixes, never scientific notation
 * (CLAUDE.md §3).
 */

/** Suffix per power of 1000. Short-scale names: thousand, million, billion, trillion, ... */
const SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'] as const;

/**
 * Formats a count compactly: `999`, `1.2k`, `12.4k`, `3.4M`, `2B`.
 *
 * - Below 1,000 the value is shown as a whole number.
 * - From 1,000 up it has a suffix and at most one decimal; a trailing `.0` is dropped.
 * - Values are truncated toward zero, never rounded up, so the display never claims more
 *   than there is: 1,999 shows as `1.9k` and 999,999 as `999.9k`, not `1M`.
 * - Past the largest suffix (`Dc`, 10^33) the leading number simply grows.
 */
export function formatNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs < 1000) {
    const whole = Math.trunc(abs);
    return whole === 0 ? '0' : sign + String(whole);
  }
  // Work on decimal digits rather than dividing: float division is inexact at large powers
  // (1e33 / 1e32 is just under 10), which would truncate a round number down a step.
  const digits = integerDigits(abs);
  const tier = Math.min(Math.floor((digits.length - 1) / 3), SUFFIXES.length - 1);
  const tenths = digits.slice(0, digits.length - (tier * 3 - 1));
  const whole = tenths.slice(0, -1);
  const decimal = tenths.slice(-1);
  return sign + whole + (decimal === '0' ? '' : `.${decimal}`) + SUFFIXES[tier];
}

/**
 * The digits of the integer part of `abs` (at least 1,000). Built from `String(abs)`, the
 * shortest decimal that round-trips, so `1e24` gives a 1 and 24 zeros rather than the digits
 * of the nearest double, which is slightly below 10^24.
 */
function integerDigits(abs: number): string {
  const [mantissa = '', exponent] = String(abs).split('e+');
  const [intPart = '', fracPart = ''] = mantissa.split('.');
  if (exponent === undefined) return intPart;
  const length = intPart.length + Number(exponent);
  return (intPart + fracPart).padEnd(length, '0').slice(0, length);
}
