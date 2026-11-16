import { describe, expect, it } from 'vitest';
import { assertPlainData, clonePlain, findNonPlain } from '../../src/core';

class Thing {
  x = 1;
}

describe('findNonPlain', () => {
  it('accepts JSON-style data, null-prototype objects and integer typed arrays', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare.a = 1;
    const value = {
      n: 1.5,
      s: 'x',
      b: false,
      z: null,
      list: [1, [2, { c: 3 }]],
      bare,
      grids: [new Uint8Array(2), new Uint16Array(2), new Int16Array(2), new Int32Array(2)],
    };
    expect(findNonPlain(value)).toBeNull();
    expect(() => assertPlainData(value)).not.toThrow();
  });

  it.each([
    ['a Map', { a: new Map() }, '$.a is a Map instance'],
    ['a Set', { a: [new Set()] }, '$.a[0] is a Set instance'],
    ['a class instance', { a: new Thing() }, '$.a is a Thing instance'],
    ['a Date', { a: new Date(0) }, '$.a is a Date instance'],
    ['a function', { a: () => 1 }, '$.a is a function'],
    ['undefined', { a: undefined }, '$.a is undefined'],
    ['NaN', { a: NaN }, '$.a is NaN'],
    ['Infinity', { a: [Infinity] }, '$.a[0] is Infinity'],
    ['a bigint', { a: 1n }, '$.a is a bigint'],
    ['a float typed array', { a: new Float64Array(1) }, '$.a is a Float64Array instance'],
    // eslint-disable-next-line no-sparse-arrays
    ['a sparse array', { a: [1, , 3] }, '$.a[1] is a hole'],
  ])('rejects %s and names the path', (_label, value, message) => {
    expect(findNonPlain(value)).toContain(message);
    expect(() => assertPlainData(value, 'Thing')).toThrow(/^Thing is not plain data/);
  });

  it('rejects symbol keys', () => {
    expect(findNonPlain({ [Symbol('k')]: 1 })).toContain('symbol keys');
  });

  it('rejects shared references and cycles, which would not survive a save', () => {
    const pos = { x: 1, y: 2 };
    expect(findNonPlain({ a: { pos }, b: { pos } })).toBe('$.b.pos is an object that also appears earlier in the tree');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(findNonPlain(loop)).toContain('$.self');
    const cells = new Uint8Array(4);
    expect(findNonPlain([{ cells }, { cells }])).toContain('$[1].cells');
  });

  it('allows equal values that are separate objects', () => {
    expect(findNonPlain({ a: { x: 1 }, b: { x: 1 } })).toBeNull();
  });
});

describe('clonePlain', () => {
  it('deep-copies objects, arrays and typed arrays', () => {
    const original = { a: [1, { b: 2 }], cells: new Int16Array([5, -5]), s: 'x', n: null };
    const copy = clonePlain(original);
    expect(copy).toStrictEqual(original);
    expect(copy.a).not.toBe(original.a);
    expect(copy.a[1]).not.toBe(original.a[1]);
    expect(copy.cells).not.toBe(original.cells);
    expect(copy.cells).toBeInstanceOf(Int16Array);
    copy.cells[0] = 9;
    expect(original.cells[0]).toBe(5);
  });

  it('returns primitives as they are', () => {
    expect(clonePlain(3)).toBe(3);
    expect(clonePlain('s')).toBe('s');
    expect(clonePlain(null)).toBeNull();
  });
});
