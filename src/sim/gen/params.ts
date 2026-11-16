/**
 * Reading generation step parameters, which arrive as untyped data from a floor type.
 */

export interface NumberParam {
  default: number;
  min: number;
  max: number;
  /** Whole numbers only. */
  integer?: boolean;
}

/**
 * Reads numeric parameters described by `spec` from `raw`. `undefined` gives all defaults, and a
 * missing key gives its default. Throws on anything that isn't a plain object, on unknown keys,
 * and on values that aren't finite numbers in range (or whole, for integer params).
 */
export function readParams<K extends string>(raw: unknown, spec: Record<K, NumberParam>): Record<K, number> {
  if (raw === undefined) raw = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new TypeError('params must be an object');
  }
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(spec, key)) throw new TypeError(`unknown parameter "${key}"`);
  }
  const out = {} as Record<K, number>;
  for (const key of Object.keys(spec) as K[]) {
    const { default: fallback, min, max, integer = false } = spec[key];
    const value = Object.hasOwn(input, key) ? input[key] : fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || (integer && !Number.isInteger(value))) {
      throw new TypeError(`parameter "${key}" must be a ${integer ? 'whole' : 'finite'} number, got ${String(value)}`);
    }
    if (value < min || value > max) {
      throw new RangeError(`parameter "${key}" must be from ${min} to ${max}, got ${value}`);
    }
    out[key] = value;
  }
  return out;
}
