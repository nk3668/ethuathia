/**
 * Seeded random numbers for the simulation (docs/ARCHITECTURE.md §3.4).
 *
 * The generator is sfc32. Its whole state is four unsigned 32-bit words held in a plain array
 * (`RngState`), so it can live inside `RunState`, go through JSON and cross a worker boundary.
 * `Rng` is a thin wrapper that reads and writes that array in place: wrap a stream stored in
 * the run state, draw from it, and the run state is already up to date.
 *
 * A run seed is split into named streams (`dungeon`, `combat`, ...). Each stream has its own
 * state, so drawing from one never shifts another: adding a monster to a spawn table does not
 * change the layout of the floor.
 */

/** The four sfc32 state words, each an unsigned 32-bit integer. Plain data. */
export type RngState = [number, number, number, number];

const TWO_POW_32 = 0x1_0000_0000;

/** Rounds the generator runs after seeding, so similar seeds diverge before the first draw. */
const WARM_UP_ROUNDS = 12;

/** splitmix32: turns one 32-bit word into a stream of well-mixed words. Used only for seeding. */
function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** FNV-1a over the UTF-16 code units of `text`. Turns a stream name into a 32-bit word. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Folds a safe integer seed into 32 bits. The high bits are mixed in rather than dropped, so
 * seeds such as `Date.now()` values that differ only above bit 32 still give different runs.
 */
function foldSeed(seed: number): number {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`RNG seed must be a safe integer, got ${seed}`);
  }
  const lo = seed >>> 0;
  const hi = Math.floor(seed / TWO_POW_32) >>> 0;
  return (lo ^ Math.imul(hi, 0x9e3779b1)) >>> 0;
}

/** Advances `s` in place and returns the next unsigned 32-bit output. */
function sfc32(s: RngState): number {
  const [a, b, c, d] = s;
  const t = (((a + b) | 0) + d) | 0;
  s[3] = (d + 1) >>> 0;
  s[0] = (b ^ (b >>> 9)) >>> 0;
  s[1] = (c + (c << 3)) >>> 0;
  s[2] = (((c << 21) | (c >>> 11)) + t) >>> 0;
  return t >>> 0;
}

/**
 * The starting state for `seed`, or for the stream called `stream` of that seed. Different
 * stream names give unrelated sequences from the same seed.
 */
export function seedState(seed: number, stream = ''): RngState {
  const fromSeed = splitmix32(foldSeed(seed));
  const fromName = splitmix32(hashString(stream));
  const s: RngState = [
    (fromSeed() ^ fromName()) >>> 0,
    (fromSeed() ^ fromName()) >>> 0,
    (fromSeed() ^ fromName()) >>> 0,
    (fromSeed() ^ fromName()) >>> 0,
  ];
  for (let i = 0; i < WARM_UP_ROUNDS; i++) sfc32(s);
  return s;
}

/** One starting state per stream name, all derived from the same run seed. */
export function seedStreams<S extends string>(seed: number, names: readonly S[]): Record<S, RngState> {
  const streams = {} as Record<S, RngState>;
  for (const name of names) {
    if (Object.hasOwn(streams, name)) throw new Error(`Duplicate RNG stream name "${name}"`);
    streams[name] = seedState(seed, name);
  }
  return streams;
}

/** Checks that `value` is a valid `RngState`, for example one read back from a save. */
export function isRngState(value: unknown): value is RngState {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((w) => Number.isInteger(w) && w >= 0 && w < TWO_POW_32)
  );
}

/**
 * Draws from an `RngState`, advancing it in place. Every helper consumes a fixed or bounded
 * number of draws that depends only on its arguments, so the same calls always leave the same
 * state behind.
 */
export class Rng {
  /** Wraps `state` without copying it. Draws mutate the array that was passed in. */
  constructor(readonly state: RngState) {}

  /** A generator with its own fresh state for `seed` (and optionally a named stream). */
  static seeded(seed: number, stream?: string): Rng {
    return new Rng(seedState(seed, stream));
  }

  /** The next unsigned 32-bit integer. */
  nextU32(): number {
    return sfc32(this.state);
  }

  /** A float in [0, 1). One draw. */
  float(): number {
    return sfc32(this.state) / TWO_POW_32;
  }

  /**
   * An integer from `min` to `max`, both inclusive. Unbiased: draws that would favour low
   * values are rejected and redrawn, which happens with probability below 1 in 2 for any range.
   */
  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new RangeError(`Rng.int needs integer bounds, got ${min} and ${max}`);
    }
    if (max < min) throw new RangeError(`Rng.int: max (${max}) is below min (${min})`);
    const range = max - min + 1;
    if (range > TWO_POW_32) throw new RangeError(`Rng.int: range ${range} is larger than 2^32`);
    const limit = TWO_POW_32 - (TWO_POW_32 % range);
    let x = sfc32(this.state);
    while (x >= limit) x = sfc32(this.state);
    return min + (x % range);
  }

  /**
   * True with probability `p` (clamped to [0, 1]). Always one draw, even for 0 and 1, so
   * tuning a probability does not shift the rest of the stream.
   */
  chance(p: number): boolean {
    if (Number.isNaN(p)) throw new RangeError('Rng.chance: probability is NaN');
    return this.float() < p;
  }

  /** A uniformly chosen element of `items`. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: cannot pick from an empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Shuffles `items` in place (Fisher–Yates) and returns it. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }

  /** A copy of the current state, to store or restore later. */
  saveState(): RngState {
    return [...this.state];
  }

  /** Overwrites the current state (in place) with a copy of `saved`. */
  restoreState(saved: RngState): void {
    if (!isRngState(saved)) throw new TypeError('Rng.restoreState: not a valid RNG state');
    for (let i = 0; i < 4; i++) this.state[i] = saved[i] as number;
  }
}
