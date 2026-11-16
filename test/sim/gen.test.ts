import { describe, expect, it } from 'vitest';
import { DIRS_4, Grid, Rng } from '../../src/core';
import type { Pos } from '../../src/core';
import { FLOOR_HALLS, FLOOR_TYPES } from '../../src/content';
import type { FloorTypeDef } from '../../src/content';
import { checkFloorType, GEN_STEPS, generateFloor, planToText, readParams, Terrain } from '../../src/sim';
import type { FloorPlan } from '../../src/sim';

const gen = (seed: number, type: FloorTypeDef = FLOOR_HALLS) => generateFloor(type, Rng.seeded(seed, 'dungeon'));

const stairs = (plan: FloorPlan, dir: 'up' | 'down') =>
  plan.features.filter((f) => f.feature.kind === 'stairs' && f.feature.dir === dir).map((f) => f.pos);

/** Floods orthogonally from `start` over floor tiles, walking through doors open or closed. */
function flood(terrain: Grid, start: Pos): Grid {
  const seen = new Grid(terrain.width, terrain.height, 'u8');
  seen.set(start.x, start.y, 1);
  const queue = [start];
  // for-of also visits the tiles pushed during the loop.
  for (const p of queue) {
    terrain.forEachNeighbor(
      p.x,
      p.y,
      (x, y) => {
        if (seen.get(x, y) === 1 || terrain.get(x, y) !== Terrain.Floor) return;
        seen.set(x, y, 1);
        queue.push({ x, y });
      },
      DIRS_4,
    );
  }
  return seen;
}

const isFloor = (t: Grid, x: number, y: number) => t.inBounds(x, y) && t.get(x, y) === Terrain.Floor;

/** Every way a generated floor can be wrong, as messages. Empty means the floor is good. */
function problems(plan: FloorPlan): string[] {
  const { terrain } = plan;
  const out: string[] = [];
  const ups = stairs(plan, 'up');
  const downs = stairs(plan, 'down');
  if (ups.length !== 1 || downs.length !== 1) return [`${ups.length} up and ${downs.length} down stairs`];

  for (let x = 0; x < terrain.width; x++) {
    if (isFloor(terrain, x, 0) || isFloor(terrain, x, terrain.height - 1)) out.push(`border floor in column ${x}`);
  }
  for (let y = 0; y < terrain.height; y++) {
    if (isFloor(terrain, 0, y) || isFloor(terrain, terrain.width - 1, y)) out.push(`border floor in row ${y}`);
  }

  const seen = new Set<string>();
  for (const f of plan.features) {
    const key = `${f.pos.x},${f.pos.y}`;
    if (seen.has(key)) out.push(`two features at ${key}`);
    seen.add(key);
    if (!isFloor(terrain, f.pos.x, f.pos.y)) out.push(`feature on a wall at ${key}`);
    if (f.feature.kind === 'door') {
      const { x, y } = f.pos;
      const ns = isFloor(terrain, x, y - 1) && isFloor(terrain, x, y + 1) && !isFloor(terrain, x - 1, y) && !isFloor(terrain, x + 1, y);
      const ew = isFloor(terrain, x - 1, y) && isFloor(terrain, x + 1, y) && !isFloor(terrain, x, y - 1) && !isFloor(terrain, x, y + 1);
      if (!ns && !ew) out.push(`door at ${key} is not between two walls`);
    }
  }

  const reached = flood(terrain, ups[0] as Pos);
  const unreached = terrain.cells.filter((c, i) => c === Terrain.Floor && reached.cells[i] === 0).length;
  if (unreached > 0) out.push(`${unreached} floor tiles not reachable from the up stairs`);
  const down = downs[0] as Pos;
  if (reached.get(down.x, down.y) !== 1) out.push('down stairs not reachable');
  return out;
}

describe('generateFloor', () => {
  it('builds floors where every floor tile and the down stairs are reachable from the up stairs (200 seeds)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const plan = gen(seed);
      const found = problems(plan);
      // The floor is printed on failure, to eyeball what went wrong.
      expect(found, `seed ${seed}:\n${planToText(plan).join('\n')}`).toEqual([]);
      expect(plan.terrain.width).toBe(FLOOR_HALLS.size.w);
      expect(plan.terrain.height).toBe(FLOOR_HALLS.size.h);
    }
  });

  it('places doors, both open and closed, across seeds', () => {
    const doors = Array.from({ length: 20 }, (_, i) => gen(i + 1).features.filter((f) => f.feature.kind === 'door')).flat();
    expect(doors.some((d) => d.feature.kind === 'door' && d.feature.open)).toBe(true);
    expect(doors.some((d) => d.feature.kind === 'door' && !d.feature.open)).toBe(true);
  });

  it('gives the same floor for the same seed and a different one for another seed', () => {
    expect(planToText(gen(42))).toEqual(planToText(gen(42)));
    expect(planToText(gen(42))).not.toEqual(planToText(gen(43)));
  });

  it('draws only from the rng it is given', () => {
    const rng = Rng.seeded(9, 'dungeon');
    const plan = generateFloor(FLOOR_HALLS, rng);
    expect(rng.state).not.toEqual(Rng.seeded(9, 'dungeon').state);
    // Replaying from the same state reproduces it, so nothing else fed in.
    expect(planToText(generateFloor(FLOOR_HALLS, Rng.seeded(9, 'dungeon')))).toEqual(planToText(plan));
  });

  it('pins the floor for seed 1, so a change to generation is noticed', () => {
    // Changing a step or its draw order changes every seed's floor. If that was intended, update
    // this picture after eyeballing it.
    expect(planToText(gen(1))).toMatchInlineSnapshot(`
      [
        "################################################################",
        "####........###.......########..........########################",
        "####........###.......########..........########################",
        "####........###.......########..........########################",
        "####........+.+.......+...####..........#############.........##",
        "####........###.......###.############'##############.........##",
        "###############.......###.############.##############...<.....##",
        "###############.......###.############.##############.........##",
        "#########################......#######.##############.........##",
        "#########################......#######+##############.........##",
        "#########################......#####......###########.........##",
        "#########################......+...+......############.#########",
        "##########################'#########......############.#########",
        "##########################.#########......############.#########",
        "#############......+..........######......#######..........#####",
        "#############.######..........######......#######..........#####",
        "#############.######..........########'##########..........#####",
        "#############.######..........########.##########..........#####",
        "#############.######..........########.##########..........#####",
        "#############.######..........########.##########..........#####",
        "####.......##.########################..........+..........#####",
        "####.......##.############################################.#####",
        "####.......##+############################################.#####",
        "####.......##.......#########################......#######.#####",
        "####........'.......#########################......#######.#####",
        "####.......##.......#########################......+.......#####",
        "####.......################......>.....######......#############",
        "###########################............########+################",
        "###########################............+........################",
        "###########################............#########################",
        "################################################################",
        "################################################################",
      ]
    `);
  });

  it('runs any floor type built from registered steps, such as one big room', () => {
    const bigRoom: FloorTypeDef = {
      id: 'floor.test_big_room',
      name: 'Big room',
      description: 'One room.',
      tags: [],
      size: { w: 12, h: 8 },
      steps: [
        { step: 'gen.rooms', params: { maxRooms: 1, minWidth: 10, maxWidth: 10, minHeight: 6, maxHeight: 6 } },
        { step: 'gen.stairs' },
      ],
    };
    const plan = gen(3, bigRoom);
    expect(problems(plan)).toEqual([]);
    expect(planToText({ ...plan, features: [] })).toEqual([
      '############',
      ...Array.from({ length: 6 }, () => '#..........#'),
      '############',
    ]);
  });
});

describe('generation steps and floor types', () => {
  it('registers the rooms-and-corridors steps', () => {
    expect(GEN_STEPS.all().map((s) => s.id)).toEqual(['gen.rooms', 'gen.corridors', 'gen.doors', 'gen.stairs']);
    for (const step of GEN_STEPS.all()) expect(step.description.length).toBeGreaterThan(0);
  });

  it('accepts every registered floor type', () => {
    expect(FLOOR_TYPES.all().length).toBeGreaterThan(0);
    for (const type of FLOOR_TYPES.all()) expect(() => checkFloorType(type)).not.toThrow();
  });

  const withSteps = (steps: FloorTypeDef['steps'], size = { w: 20, h: 10 }): FloorTypeDef => ({
    id: 'floor.test',
    name: 'Test',
    description: '',
    tags: [],
    size,
    steps,
  });

  it('rejects unknown steps, bad params and bad sizes, naming the floor type and step', () => {
    expect(() => checkFloorType(withSteps([{ step: 'gen.rooms' }, { step: 'gen.nope' }]))).toThrow(
      'Floor type "floor.test" step 2 ("gen.nope"): unknown generation step',
    );
    expect(() => checkFloorType(withSteps([{ step: 'gen.doors', params: { chance: 2 } }]))).toThrow(
      'Floor type "floor.test" step 1 ("gen.doors"): parameter "chance" must be from 0 to 1, got 2',
    );
    expect(() => checkFloorType(withSteps([{ step: 'gen.rooms', params: { minWidth: 8, maxWidth: 4 } }]))).toThrow(
      /minWidth \(8\) is above maxWidth \(4\)/,
    );
    expect(() => checkFloorType(withSteps([{ step: 'gen.stairs', params: { where: 'here' } }]))).toThrow(
      /unknown parameter "where"/,
    );
    expect(() => checkFloorType(withSteps([], { w: 2, h: 10 }))).toThrow(/size must be whole numbers of at least 3/);
  });

  it('checks every step before running any', () => {
    const rng = Rng.seeded(1);
    const before = rng.saveState();
    expect(() => generateFloor(withSteps([{ step: 'gen.rooms' }, { step: 'gen.nope' }]), rng)).toThrow(/gen\.nope/);
    expect(rng.state).toEqual(before);
  });

  it('names the floor type and step when a step fails while running', () => {
    expect(() => generateFloor(withSteps([{ step: 'gen.rooms', params: { maxWidth: 30 } }]), Rng.seeded(1))).toThrow(
      /step 1 \("gen\.rooms"\): rooms up to 30x7 don't fit inside the border of a 20x10 floor/,
    );
    expect(() => generateFloor(withSteps([{ step: 'gen.stairs' }]), Rng.seeded(1))).toThrow(/no rooms to put stairs in/);
  });
});

describe('readParams', () => {
  const spec = { n: { default: 3, min: 1, max: 9, integer: true }, p: { default: 0.5, min: 0, max: 1 } };

  it('fills in defaults and reads given values', () => {
    expect(readParams(undefined, spec)).toEqual({ n: 3, p: 0.5 });
    expect(readParams({ p: 0.1 }, spec)).toEqual({ n: 3, p: 0.1 });
  });

  it('rejects non-objects, unknown keys, wrong types, fractions and values out of range', () => {
    expect(() => readParams(null, spec)).toThrow(/must be an object/);
    expect(() => readParams([1], spec)).toThrow(/must be an object/);
    expect(() => readParams({ q: 1 }, spec)).toThrow(/unknown parameter "q"/);
    expect(() => readParams({ n: '3' }, spec)).toThrow(/"n" must be a whole number/);
    expect(() => readParams({ n: 2.5 }, spec)).toThrow(/"n" must be a whole number/);
    expect(() => readParams({ p: Number.NaN }, spec)).toThrow(/"p" must be a finite number/);
    expect(() => readParams({ n: 10 }, spec)).toThrow(/"n" must be from 1 to 9, got 10/);
  });
});
