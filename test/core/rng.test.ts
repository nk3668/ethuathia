import { describe, expect, it } from 'vitest';
import { isRngState, Rng, seedState, seedStreams } from '../../src/core';
import type { RngState } from '../../src/core';

const draw = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.nextU32());

/** Reference sfc32, written independently in the usual closure style, to check our step function. */
function referenceSfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

describe('Rng', () => {
  it('matches a reference sfc32 implementation', () => {
    const start: RngState = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0xdeadbeef];
    const ref = referenceSfc32(...start);
    const rng = new Rng([...start]);
    for (let i = 0; i < 1000; i++) expect(rng.nextU32()).toBe(ref());
  });

  it('keeps producing the same sequence for a given seed across versions', () => {
    // Changing these values changes every existing seed: only do it on purpose, with a save migration.
    expect(draw(Rng.seeded(1), 4)).toEqual([2909086987, 573480538, 2616665658, 596933079]);
  });

  it('gives the same sequence for the same seed', () => {
    expect(draw(Rng.seeded(12345), 200)).toEqual(draw(Rng.seeded(12345), 200));
  });

  it('gives different sequences for different seeds, including seeds that differ only above bit 32', () => {
    expect(draw(Rng.seeded(1), 8)).not.toEqual(draw(Rng.seeded(2), 8));
    expect(draw(Rng.seeded(5), 8)).not.toEqual(draw(Rng.seeded(5 + 2 ** 32), 8));
  });

  it('rejects seeds that are not safe integers', () => {
    expect(() => Rng.seeded(1.5)).toThrow(RangeError);
    expect(() => Rng.seeded(Number.NaN)).toThrow(RangeError);
    expect(() => Rng.seeded(2 ** 60)).toThrow(RangeError);
  });

  it('saves and restores its state mid-sequence', () => {
    const rng = Rng.seeded(99);
    draw(rng, 37);
    const saved = rng.saveState();
    const expected = draw(rng, 50);

    rng.restoreState(saved);
    expect(draw(rng, 50)).toEqual(expected);

    // A saved state survives JSON (the save format) and resumes in a fresh generator.
    const revived = new Rng(JSON.parse(JSON.stringify(saved)) as RngState);
    expect(draw(revived, 50)).toEqual(expected);
  });

  it('saveState returns a copy, and draws mutate the wrapped array in place', () => {
    const state = seedState(7);
    const rng = new Rng(state);
    const saved = rng.saveState();
    rng.nextU32();
    expect(rng.state).toBe(state);
    expect(state).not.toEqual(saved);
    expect(isRngState(state)).toBe(true);
  });

  it('rejects an invalid state on restore', () => {
    const rng = Rng.seeded(1);
    expect(() => rng.restoreState([1, 2, 3] as unknown as RngState)).toThrow(TypeError);
    expect(() => rng.restoreState([1, 2, 3, -1])).toThrow(TypeError);
    expect(() => rng.restoreState([1, 2, 3, 2 ** 32])).toThrow(TypeError);
  });
});

describe('named streams', () => {
  const NAMES = ['dungeon', 'combat', 'loot', 'ai'] as const;

  it('derives one independent state per name', () => {
    const streams = seedStreams(42, NAMES);
    expect(Object.keys(streams)).toEqual([...NAMES]);
    const firsts = NAMES.map((n) => new Rng([...streams[n]]).nextU32());
    expect(new Set(firsts).size).toBe(NAMES.length);
  });

  it('drawing from one stream does not change another', () => {
    const untouched = seedStreams(42, NAMES);
    const streams = seedStreams(42, NAMES);

    draw(new Rng(streams.dungeon), 500);
    new Rng(streams.loot).shuffle([1, 2, 3, 4, 5]);

    expect(streams.combat).toEqual(untouched.combat);
    expect(streams.ai).toEqual(untouched.ai);
    expect(draw(new Rng(streams.combat), 20)).toEqual(draw(new Rng(untouched.combat), 20));
  });

  it('a stream does not depend on which other streams exist', () => {
    expect(seedStreams(42, ['combat']).combat).toEqual(seedStreams(42, NAMES).combat);
    expect(seedState(42, 'combat')).toEqual(seedStreams(42, NAMES).combat);
  });

  it('rejects duplicate stream names', () => {
    expect(() => seedStreams(1, ['a', 'a'])).toThrow(/Duplicate/);
  });
});

describe('Rng helpers', () => {
  it('int stays within inclusive bounds and reaches both ends', () => {
    const rng = Rng.seeded(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = rng.int(-2, 3);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(3);
      seen.add(n);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2, 3]);
    expect(rng.int(5, 5)).toBe(5);
  });

  it('int is roughly uniform', () => {
    const rng = Rng.seeded(4);
    const counts = new Array<number>(10).fill(0);
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const n = rng.int(0, 9);
      counts[n] = (counts[n] ?? 0) + 1;
    }
    for (const c of counts) expect(Math.abs(c - N / 10)).toBeLessThan(N / 100);
  });

  it('int handles the full 32-bit range and rejects bad bounds', () => {
    const rng = Rng.seeded(5);
    const n = rng.int(0, 2 ** 32 - 1);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThan(2 ** 32);
    expect(() => rng.int(3, 2)).toThrow(RangeError);
    expect(() => rng.int(0, 1.5)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 32)).toThrow(RangeError);
  });

  it('float is in [0, 1)', () => {
    const rng = Rng.seeded(6);
    for (let i = 0; i < 1000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('chance respects 0 and 1, is roughly right in between, and always uses one draw', () => {
    const rng = Rng.seeded(7);
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.3)) hits++;
    expect(hits).toBeGreaterThan(2800);
    expect(hits).toBeLessThan(3200);

    const a = Rng.seeded(8);
    const b = Rng.seeded(8);
    a.chance(0);
    b.chance(0.9);
    expect(a.state).toEqual(b.state);
    expect(() => a.chance(Number.NaN)).toThrow(RangeError);
  });

  it('pick returns an element and throws on an empty array', () => {
    const rng = Rng.seeded(9);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(rng.pick(items));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('shuffle permutes in place and is deterministic', () => {
    const original = Array.from({ length: 20 }, (_, i) => i);
    const items = [...original];
    const result = Rng.seeded(10).shuffle(items);
    expect(result).toBe(items);
    expect([...items].sort((a, b) => a - b)).toEqual(original);
    expect(items).not.toEqual(original);
    expect(Rng.seeded(10).shuffle([...original])).toEqual(items);
    expect(Rng.seeded(10).shuffle([])).toEqual([]);
  });
});
