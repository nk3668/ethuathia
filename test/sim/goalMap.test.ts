import { describe, expect, it } from 'vitest';
import { DIRS_8, Grid, Rng } from '../../src/core';
import type { Pos } from '../../src/core';
import {
  buildFleeMap,
  buildGoalMap,
  canStep,
  createRun,
  entitiesOnFloor,
  floorPathGrid,
  getEntity,
  memoryPathGrid,
  OPEN_DOOR_COST,
  pathAlong,
  stepBlocker,
  stepToward,
  UNREACHABLE,
} from '../../src/sim';
import type { ActorEntity, EntityId, PathGrid, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.test', raceId: 'race.test' };

function run(floorText?: string[], seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun(floorText === undefined ? { party: [HERO] } : { party: [HERO], floorText }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

/**
 * The path grid of a hand-built floor. A run needs somewhere to put the hero, so a map without
 * an `@` gets one on its first floor tile, which stays floor.
 */
function paths(floorText: string[], closedDoorCost: number | null = null): PathGrid {
  const rows = floorText.some((row) => row.includes('@')) ? floorText : floorText.join('\n').replace('.', '@').split('\n');
  return floorPathGrid(run(rows).state, 'd1', { closedDoorCost });
}

/**
 * A goal map as text: `#` for tiles that can't be entered, `-` for unreachable ones, otherwise
 * the distance in base 36 (so 10 is `a`).
 */
function mapText(p: PathGrid, map: Grid): string[] {
  const rows: string[] = [];
  for (let y = 0; y < map.height; y++) {
    let row = '';
    for (let x = 0; x < map.width; x++) {
      const i = y * map.width + x;
      const d = map.cells[i] as number;
      row += p.cost[i] === 0 && d !== 0 ? '#' : d === UNREACHABLE ? '-' : d.toString(36);
    }
    rows.push(row);
  }
  return rows;
}

const dirName = (d: Pos | null): string =>
  d === null ? 'none' : (['N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW'][DIRS_8.findIndex((s) => s.x === d.x && s.y === d.y)] as string);

/**
 * Checks that `map` is the fixed point Dijkstra should reach: each goal is 0 and every other
 * tile that can be entered is the cheapest (neighbor + cost to step onto it) over its legal steps.
 */
function expectConsistent(p: PathGrid, map: Grid, goals: readonly Pos[]): void {
  const isGoal = new Set(goals.map(({ x, y }) => y * p.width + x));
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = y * p.width + x;
      if (isGoal.has(i)) {
        expect(map.cells[i]).toBe(0);
        continue;
      }
      if (p.cost[i] === 0) {
        expect(map.cells[i]).toBe(UNREACHABLE);
        continue;
      }
      let best = UNREACHABLE;
      for (const d of DIRS_8) {
        if (!canStep(p, x, y, d)) continue;
        const n = (y + d.y) * p.width + x + d.x;
        const v = map.cells[n] as number;
        if (v !== UNREACHABLE && p.cost[n] !== 0) best = Math.min(best, v + (p.cost[n] as number));
      }
      expect(map.cells[i], `tile (${x}, ${y})`).toBe(best);
    }
  }
}

describe('buildGoalMap', () => {
  it('measures steps to one goal, diagonals included', () => {
    const p = paths(['#######', '#.....#', '#.....#', '#.....#', '#######']);
    expect(mapText(p, buildGoalMap(p, [{ x: 1, y: 1 }]))).toEqual([
      '#######',
      '#01234#',
      '#11234#',
      '#22234#',
      '#######',
    ]);
  });

  it('measures to the nearest of several goals', () => {
    const p = paths(['#########', '#.......#', '#.......#', '#########']);
    const goals = [
      { x: 1, y: 1 },
      { x: 7, y: 2 },
    ];
    const map = buildGoalMap(p, goals);
    expect(mapText(p, map)).toEqual(['#########', '#0123211#', '#1123210#', '#########']);
    expectConsistent(p, map, goals);
  });

  it('marks walls and sealed-off ground unreachable', () => {
    const p = paths(['#######', '#..#..#', '#..#..#', '#######']);
    const map = buildGoalMap(p, [{ x: 1, y: 1 }]);
    expect(mapText(p, map)).toEqual(['#######', '#01#--#', '#11#--#', '#######']);
    expect(map.get(4, 1)).toBe(UNREACHABLE);
    expect(map.get(0, 0)).toBe(UNREACHABLE);
  });

  it('routes through doorways straight on, never diagonally', () => {
    // The open door at (3, 2) can only be entered from (2, 2) and left to (4, 2).
    const p = paths(['#######', '#..#..#', "#..'..#", '#..#..#', '#######']);
    expect(mapText(p, buildGoalMap(p, [{ x: 1, y: 1 }]))).toEqual([
      '#######',
      '#01#44#',
      '#11234#',
      '#22#44#',
      '#######',
    ]);
  });

  it('treats closed doors as blocking unless given a cost', () => {
    const map = ['#######', '#..+..#', '#######'];
    const blocked = paths(map);
    expect(mapText(blocked, buildGoalMap(blocked, [{ x: 1, y: 1 }]))).toEqual(['#######', '#01#--#', '#######']);

    const opened = paths(map, OPEN_DOOR_COST);
    expect(mapText(opened, buildGoalMap(opened, [{ x: 1, y: 1 }]))).toEqual(['#######', '#01245#', '#######']);

    const costly = paths(map, 10);
    expect(mapText(costly, buildGoalMap(costly, [{ x: 1, y: 1 }]))).toEqual(['#######', '#012cd#', '#######']);
  });

  it('reaches a goal that can’t be entered from nowhere but itself', () => {
    const p = paths(['#####', '#...#', '#####']);
    const map = buildGoalMap(p, [{ x: 0, y: 0 }]);
    expect(map.get(0, 0)).toBe(0);
    expect(map.get(1, 1)).toBe(UNREACHABLE);
  });

  it('throws on a goal outside the floor', () => {
    const p = paths(['#####', '#...#', '#####']);
    expect(() => buildGoalMap(p, [{ x: 5, y: 1 }])).toThrow(RangeError);
  });

  it('rejects a bad closed-door cost', () => {
    const { state } = run(['#####', '#@..#', '#####']);
    expect(() => floorPathGrid(state, 'd1', { closedDoorCost: 0 })).toThrow(RangeError);
    expect(() => floorPathGrid(state, 'd1', { closedDoorCost: 1.5 })).toThrow(RangeError);
  });

  it('gives the same map whatever the order of the goals', () => {
    const { state } = run(undefined, 7);
    const p = floorPathGrid(state, 'd1', { closedDoorCost: OPEN_DOOR_COST });
    const stairs = entitiesOnFloor(state, 'd1')
      .filter((e) => e.feature?.kind === 'stairs')
      .map((e) => e.pos);
    const a = buildGoalMap(p, stairs);
    const b = buildGoalMap(p, [...stairs].reverse());
    expect(Array.from(b.cells)).toEqual(Array.from(a.cells));
  });

  it('is a correct fixed point on generated floors with uneven costs', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, hero } = run(undefined, seed);
      const p = floorPathGrid(state, 'd1', { closedDoorCost: 5 });
      const rng = Rng.seeded(seed, 'test');
      for (let i = 0; i < p.cost.length; i++) if (p.cost[i] !== 0 && rng.chance(0.2)) p.cost[i] = rng.int(2, 9);
      const goals = [hero.pos, { x: 1, y: 1 }];
      expectConsistent(p, buildGoalMap(p, goals), goals);
    }
  });
});

describe('step rules', () => {
  function expectMatchesStepBlocker(state: RunState, closedDoorCost: number | null): void {
    const p = floorPathGrid(state, 'd1', { closedDoorCost });
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        for (const d of DIRS_8) {
          let reason = stepBlocker(state, 'd1', { x, y }, d);
          // With a door cost, a closed door is somewhere to walk: the walker opens it first.
          if (closedDoorCost !== null && reason === 'The door is closed') {
            reason = d.x !== 0 && d.y !== 0 ? 'Doorways can’t be entered or left diagonally' : null;
          }
          expect(canStep(p, x, y, d), `(${x}, ${y}) ${dirName(d)}: ${reason}`).toBe(reason === null);
        }
      }
    }
  }

  it('match the move action on a hand-built map with doors', () => {
    const { state } = run(['########', "#@.+..'#", '#.#.##.#', "#.'.+..#", '########']);
    expectMatchesStepBlocker(state, null);
    expectMatchesStepBlocker(state, OPEN_DOOR_COST);
  });

  it('match the move action on generated floors', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { state } = run(undefined, seed);
      expectMatchesStepBlocker(state, null);
      expectMatchesStepBlocker(state, OPEN_DOOR_COST);
    }
  });
});

describe('stepToward', () => {
  it('steps to a lower neighbor, preferring straight steps on a tie', () => {
    const p = paths(['#######', '#.....#', '#.....#', '#.....#', '#######']);
    const map = buildGoalMap(p, [{ x: 5, y: 2 }]);
    // From (1, 1) the goal is 4 away; east (2, 1) and south-east (2, 2) are both 3.
    expect(dirName(stepToward(p, map, { x: 1, y: 1 }))).toBe('E');
    expect(dirName(stepToward(p, map, { x: 1, y: 3 }))).toBe('E');
    expect(dirName(stepToward(p, map, { x: 3, y: 1 }))).toBe('E');
    expect(dirName(stepToward(p, map, { x: 4, y: 1 }))).toBe('SE');
    expect(stepToward(p, map, { x: 5, y: 2 })).toBeNull();
  });

  it('returns null where no goal can be reached', () => {
    const p = paths(['#######', '#..#..#', '#######']);
    const map = buildGoalMap(p, [{ x: 1, y: 1 }]);
    expect(stepToward(p, map, { x: 4, y: 1 })).toBeNull();
    expect(stepToward(p, map, { x: 0, y: 0 })).toBeNull();
    expect(stepToward(p, map, { x: -1, y: 9 })).toBeNull();
  });

  it('follows the cheapest route, not the lowest neighbor', () => {
    //   x 0123456
    // y 0 #######
    //   1 #.+...#    goal (1, 1); door (2, 1)
    //   2 #.###.#
    //   3 #.....#
    //   4 #######
    const map = ['#######', '#.+...#', '#.###.#', '#.....#', '#######'];
    const goal = { x: 1, y: 1 };
    const from = { x: 3, y: 1 };

    // The door is next to the goal but costs 10 to open and pass: going round is cheaper.
    const slow = paths(map, 10);
    const slowMap = buildGoalMap(slow, [goal]);
    expect(slowMap.get(2, 1)).toBe(1);
    expect(slowMap.get(3, 1)).toBe(7);
    expect(dirName(stepToward(slow, slowMap, from))).toBe('E');
    expect(pathAlong(slow, slowMap, from)).toHaveLength(7);

    const quick = paths(map, OPEN_DOOR_COST);
    const quickMap = buildGoalMap(quick, [goal]);
    expect(dirName(stepToward(quick, quickMap, from))).toBe('W');
    expect(pathAlong(quick, quickMap, from)).toEqual([
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('only takes steps the move action allows, and walks every route to a goal', () => {
    for (const seed of [1, 2, 3]) {
      const { state, hero } = run(undefined, seed);
      const p = floorPathGrid(state, 'd1', { closedDoorCost: OPEN_DOOR_COST });
      const map = buildGoalMap(p, [hero.pos]);
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          const here = map.get(x, y);
          const d = stepToward(p, map, { x, y });
          if (here === 0 || here === UNREACHABLE) {
            expect(d).toBeNull();
            continue;
          }
          expect(d, `(${x}, ${y})`).not.toBeNull();
          const step = d as Pos;
          const reason = stepBlocker(state, 'd1', { x, y }, step);
          expect(reason === null || reason === 'The door is closed').toBe(true);
          expect(map.get(x + step.x, y + step.y)).toBeLessThan(here);
        }
      }
      // With every step costing 1 (no closed doors), the walk is exactly as long as the distance.
      const open = floorPathGrid(state, 'd1');
      const openMap = buildGoalMap(open, [hero.pos]);
      for (let i = 0; i < open.cost.length; i += 37) {
        const from = { x: i % open.width, y: Math.floor(i / open.width) };
        const dist = openMap.get(from.x, from.y);
        if (dist === UNREACHABLE) continue;
        const walk = pathAlong(open, openMap, from);
        expect(walk).toHaveLength(dist);
        if (dist > 0) expect(walk.at(-1)).toEqual(hero.pos);
      }
    }
  });

  it('is deterministic', () => {
    const { state } = run(undefined, 3);
    const p = floorPathGrid(state, 'd1', { closedDoorCost: OPEN_DOOR_COST });
    const from = getEntity(state, state.party[0] as EntityId).pos;
    const goal = entitiesOnFloor(state, 'd1').find((e) => e.feature?.kind === 'stairs')?.pos as Pos;
    const walk = () => pathAlong(p, buildGoalMap(p, [goal]), from);
    expect(walk()).toEqual(walk());
  });
});

describe('buildFleeMap', () => {
  //   x 012345678901
  // y 0 ############
  //   1 #......#####
  //   2 #......#####    a room to the west
  //   3 #......@...#    the hero at (7, 3); a dead end to the east
  //   4 #######'####    an open door, so nothing reaches row 3 diagonally from below
  //   5 #######.####
  //   6 #######.####    the threat at (7, 6)
  //   7 ############
  const NOOK = [
    '############',
    '#......#####',
    '#......#####',
    '#......@...#',
    "#######'####",
    '#######.####',
    '#######.####',
    '############',
  ];
  const THREAT = { x: 7, y: 6 };
  const HERO_AT = { x: 7, y: 3 };

  it('runs for open ground rather than the nearest dead end', () => {
    const p = paths(NOOK);
    const toward = buildGoalMap(p, [THREAT]);
    // Naively going "uphill", east and west are equally far, and east comes first: the dead end.
    expect(toward.get(8, 3)).toBe(toward.get(6, 3));
    const flee = buildFleeMap(p, toward);
    expect(dirName(stepToward(p, flee, HERO_AT))).toBe('W');
    // Following the flee map ends deep in the room, further than the dead end goes.
    const end = pathAlong(p, flee, HERO_AT).at(-1) as Pos;
    expect(end.x).toBe(1);
    expect(toward.get(end.x, end.y)).toBeGreaterThan(toward.get(10, 3));
  });

  it('keeps unreachable tiles unreachable and checks its inputs', () => {
    const p = paths(['#######', '#..#..#', '#######']);
    const toward = buildGoalMap(p, [{ x: 1, y: 1 }]);
    const flee = buildFleeMap(p, toward);
    expect(flee.get(4, 1)).toBe(UNREACHABLE);
    expect(flee.get(1, 1)).toBe(0);
    expect(flee.get(2, 1)).toBe(-1);
    expect(() => buildFleeMap(p, toward, 1.2)).toThrow(RangeError);
    expect(() => buildFleeMap(p, new Grid(3, 3, 'i32'))).toThrow(RangeError);
  });
});

describe('memoryPathGrid', () => {
  it('only walks ground the party has seen, with doors as last seen', () => {
    //   x 0123456789
    // y 0 ##########
    //   1 #@..'....#    an open door at (4, 1)
    //   2 ##########
    const { state } = run(['##########', "#@..'....#", '##########']);
    const p = memoryPathGrid(state, 'd1');
    // The hero has seen the whole corridor (sight radius 8).
    expect(buildGoalMap(p, [{ x: 8, y: 1 }]).get(1, 1)).toBe(7);

    // The door is shut out of sight: memory still has it open, the real floor does not.
    const door = entitiesOnFloor(state, 'd1').find((e) => e.feature?.kind === 'door');
    if (door?.feature?.kind !== 'door') throw new Error('no door');
    door.feature.open = false;
    expect(buildGoalMap(memoryPathGrid(state, 'd1'), [{ x: 8, y: 1 }]).get(1, 1)).toBe(7);
    expect(buildGoalMap(floorPathGrid(state, 'd1'), [{ x: 8, y: 1 }]).get(1, 1)).toBe(UNREACHABLE);
  });

  it('treats unseen tiles as impassable', () => {
    // The closed door hides the room beyond it.
    const { state } = run(['##########', '#@.+....##', '##########']);
    const p = memoryPathGrid(state, 'd1', { closedDoorCost: OPEN_DOOR_COST });
    const map = buildGoalMap(p, [{ x: 1, y: 1 }]);
    expect(map.get(3, 1)).toBe(2);
    expect(map.get(4, 1)).toBe(UNREACHABLE);
    expect(map.get(7, 1)).toBe(UNREACHABLE);
  });
});
