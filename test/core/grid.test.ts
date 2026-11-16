import { describe, expect, it } from 'vitest';
import { DIRS_4, DIRS_8, Grid } from '../../src/core';
import type { GridData } from '../../src/core';

describe('Grid', () => {
  it('stores values per cell, row by row', () => {
    const g = new Grid(4, 3, 'u8');
    g.set(3, 2, 7);
    g.set(1, 0, 2);
    expect(g.get(3, 2)).toBe(7);
    expect(g.get(1, 0)).toBe(2);
    expect(g.get(0, 0)).toBe(0);
    expect(g.index(3, 2)).toBe(11);
    expect(g.cells[11]).toBe(7);
  });

  it('can start filled', () => {
    const g = new Grid(2, 2, 'i16', -1);
    expect([...g.cells]).toEqual([-1, -1, -1, -1]);
  });

  it('bounds-checks get and set', () => {
    const g = new Grid(4, 3, 'u8');
    expect(g.inBounds(0, 0)).toBe(true);
    expect(g.inBounds(3, 2)).toBe(true);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [4, 0],
      [0, 3],
      [0.5, 0],
    ] as const) {
      expect(g.inBounds(x, y)).toBe(false);
      expect(() => g.get(x, y)).toThrow(RangeError);
      expect(() => g.set(x, y, 1)).toThrow(RangeError);
    }
  });

  it('rejects values that do not fit the cell type instead of wrapping them', () => {
    expect(() => new Grid(2, 2, 'u8').set(0, 0, 256)).toThrow(RangeError);
    expect(() => new Grid(2, 2, 'u8').set(0, 0, -1)).toThrow(RangeError);
    expect(() => new Grid(2, 2, 'i16').set(0, 0, 40_000)).toThrow(RangeError);
    expect(() => new Grid(2, 2, 'i32').set(0, 0, 1.5)).toThrow(RangeError);
    expect(() => new Grid(2, 2, 'u8', 300)).toThrow(RangeError);
    const g = new Grid(2, 2, 'i16');
    g.set(0, 0, -32768);
    g.set(1, 0, 32767);
    expect([g.get(0, 0), g.get(1, 0)]).toEqual([-32768, 32767]);
  });

  it('rejects bad sizes and kinds', () => {
    expect(() => new Grid(0, 3, 'u8')).toThrow(RangeError);
    expect(() => new Grid(3, 2.5, 'u8')).toThrow(RangeError);
    expect(() => new Grid(3, 3, 'f64' as 'u8')).toThrow(TypeError);
  });

  it('iterates in-bounds neighbors in a fixed order', () => {
    const g = new Grid(3, 3, 'u8');
    expect(g.neighbors(1, 1)).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 0 },
    ]);
    expect(g.neighbors(0, 0)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(g.neighbors(0, 0, DIRS_4)).toEqual([
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
    const visited: string[] = [];
    g.forEachNeighbor(2, 2, (x, y) => visited.push(`${x},${y}`), DIRS_8);
    expect(visited).toEqual(['2,1', '1,2', '1,1']);
  });

  it('clone is independent of the original', () => {
    const g = new Grid(2, 2, 'u16');
    g.set(0, 0, 500);
    const c = g.clone();
    c.set(0, 0, 1);
    expect(g.get(0, 0)).toBe(500);
    expect(c.get(0, 0)).toBe(1);
    expect(c.kind).toBe('u16');
  });

  it('round-trips through plain data and JSON', () => {
    const g = new Grid(5, 4, 'i16', 3);
    g.set(0, 0, -7);
    g.set(4, 3, 1200);
    g.set(2, 1, 0);
    const data = g.toData();
    const back = Grid.fromData(JSON.parse(JSON.stringify(data)) as GridData);
    expect(back.width).toBe(5);
    expect(back.height).toBe(4);
    expect(back.kind).toBe('i16');
    expect([...back.cells]).toEqual([...g.cells]);
  });

  it('run-length encodes uniform areas compactly', () => {
    const g = new Grid(80, 40, 'u8', 1);
    g.set(10, 10, 2);
    expect(g.toData().runs).toEqual([1, 810, 2, 1, 1, 2389]);
  });

  it('rejects malformed data', () => {
    const ok: GridData = { width: 2, height: 2, kind: 'u8', runs: [0, 4] };
    expect(() => Grid.fromData(ok)).not.toThrow();
    expect(() => Grid.fromData({ ...ok, runs: [0, 3] })).toThrow(/cover 3 cells/);
    expect(() => Grid.fromData({ ...ok, runs: [0, 5] })).toThrow(RangeError);
    expect(() => Grid.fromData({ ...ok, runs: [0, 2, 1] })).toThrow(TypeError);
    expect(() => Grid.fromData({ ...ok, runs: [0, 0, 1, 4] })).toThrow(RangeError);
    expect(() => Grid.fromData({ ...ok, runs: [999, 4] })).toThrow(RangeError);
    expect(() => Grid.fromData({ ...ok, kind: 'nope' as 'u8' })).toThrow(TypeError);
  });
});
