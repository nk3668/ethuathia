import { describe, expect, it } from 'vitest';
import { DEFS, parseFloorText, Terrain } from '../../src/sim';

describe('parseFloorText', () => {
  it('reads terrain, features and start marks', () => {
    const plan = parseFloorText(['######', "#@<+'#", '#  .>#', '######']);
    expect(plan.terrain.width).toBe(6);
    expect(plan.terrain.height).toBe(4);
    expect(plan.terrain.get(0, 0)).toBe(Terrain.Wall);
    expect(plan.terrain.get(1, 2)).toBe(Terrain.Wall); // space is rock
    for (const x of [1, 2, 3, 4]) expect(plan.terrain.get(x, 1)).toBe(Terrain.Floor);
    expect(plan.starts).toEqual([{ x: 1, y: 1 }]);
    expect(plan.features).toEqual([
      { def: DEFS.stairsUp, pos: { x: 2, y: 1 }, feature: { kind: 'stairs', dir: 'up' } },
      { def: DEFS.door, pos: { x: 3, y: 1 }, feature: { kind: 'door', open: false } },
      { def: DEFS.door, pos: { x: 4, y: 1 }, feature: { kind: 'door', open: true } },
      { def: DEFS.stairsDown, pos: { x: 4, y: 2 }, feature: { kind: 'stairs', dir: 'down' } },
    ]);
  });

  it('gives each feature its own object', () => {
    const plan = parseFloorText(['++']);
    expect(plan.features[0]?.feature).not.toBe(plan.features[1]?.feature);
  });

  it('rejects empty text, ragged rows and unknown characters', () => {
    expect(() => parseFloorText([])).toThrow(/empty/);
    expect(() => parseFloorText(['###', '##'])).toThrow(/row 1 is 2 wide/);
    expect(() => parseFloorText(['#?#'])).toThrow(/unknown character "\?" at \(1, 0\)/);
  });
});
