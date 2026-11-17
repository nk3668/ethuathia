/**
 * "Plain data": values that survive JSON and structured clone unchanged. Run state must be plain
 * data (docs/ARCHITECTURE.md §3.1) so it can be saved, sent to and from a Web Worker, and
 * compared in tests.
 *
 * Plain data is built from:
 * - `null`, booleans, strings and finite numbers;
 * - arrays with no holes, and objects whose prototype is `Object.prototype` or `null`;
 * - integer typed arrays (`Uint8Array`, `Uint16Array`, `Int16Array`, `Int32Array`), which hold
 *   grids (see `GridBuffer`).
 *
 * It also has to be a tree: an object or array appears only once. A shared reference would
 * become two separate copies after a save and load, so a change to one would no longer show in
 * the other, and the loaded run would play out differently.
 *
 * Not allowed: `undefined` (JSON drops it, so leave optional fields out instead), `NaN` and
 * infinities (JSON turns them into `null`), functions, symbols, bigints, `Map`, `Set`, `Date`
 * and other class instances.
 */

const TYPED_ARRAYS = [Uint8Array, Uint16Array, Int16Array, Int32Array] as const;

type PlainTypedArray = InstanceType<(typeof TYPED_ARRAYS)[number]>;

function isPlainTypedArray(value: object): value is PlainTypedArray {
  return TYPED_ARRAYS.some((T) => value instanceof T);
}

/**
 * Describes the first part of `value` that is not plain data, with its path (`$.entities.3.pos`),
 * or returns `null` if all of it is.
 */
export function findNonPlain(value: unknown): string | null {
  // The soak checks the whole run state after every step, so a quick pass with no paths comes
  // first; the slower walk that builds the path runs only when something is wrong.
  if (isPlain(value, new Set())) return null;
  return walk(value, '$', new Set());
}

/** `walk` without the paths: true if `value` is plain data. */
function isPlain(value: unknown, seen: Set<object>): boolean {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      break;
    default:
      return false;
  }
  if (value === null) return true;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value) || !isPlain(value[i], seen)) return false;
    }
    return true;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return ArrayBuffer.isView(value) && isPlainTypedArray(value);
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  for (const key of Object.keys(value)) {
    const child: unknown = (value as Record<string, unknown>)[key];
    if (child === undefined || !isPlain(child, seen)) return false;
  }
  return true;
}

/** Throws a `TypeError` naming the offending path if `value` is not plain data. */
export function assertPlainData(value: unknown, what = 'value'): void {
  const problem = findNonPlain(value);
  if (problem !== null) throw new TypeError(`${what} is not plain data: ${problem}`);
}

function walk(value: unknown, path: string, seen: Set<object>): string | null {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return null;
    case 'number':
      return Number.isFinite(value) ? null : `${path} is ${value}, which is not a finite number`;
    case 'object':
      break;
    default:
      return `${path} is a ${typeof value}`;
  }
  if (value === null) return null;
  if (seen.has(value)) return `${path} is an object that also appears earlier in the tree`;
  seen.add(value);

  if (isPlainTypedArray(value)) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) return `${path}[${i}] is a hole in the array`;
      const problem = walk(value[i], `${path}[${i}]`, seen);
      if (problem !== null) return problem;
    }
    return null;
  }

  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
    return `${path} is a ${name} instance`;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) return `${path} has symbol keys`;
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) return `${path}.${key} is undefined (leave the key out instead)`;
    const problem = walk(child, `${path}.${key}`, seen);
    if (problem !== null) return problem;
  }
  return null;
}

/**
 * A deep copy of a plain-data value: objects and arrays are copied, typed arrays are copied,
 * primitives are returned as they are. Use it to take ownership of caller-supplied data, so the
 * result shares nothing with the input. Does not check that `value` is plain.
 */
export function clonePlain<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (isPlainTypedArray(value)) return value.slice() as T;
  if (Array.isArray(value)) return value.map((item: unknown) => clonePlain(item)) as T;
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) copy[key] = clonePlain(child);
  return copy as T;
}
