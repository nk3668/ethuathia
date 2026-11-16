import { describe, expect, it } from 'vitest';
import { Grid } from '../../src/core';
import type { Pos } from '../../src/core';
import {
  BASE_SIGHT_RADIUS,
  canSee,
  computeFov,
  createRun,
  deserialize,
  explored,
  featureAt,
  fieldOfView,
  getEntity,
  getFloor,
  getMemory,
  moveEntity,
  partyVisible,
  perceive,
  rememberedTerrain,
  removeEntity,
  serialize,
  sightBlockers,
  step,
  Terrain,
} from '../../src/sim';
import type { ActorEntity, Entity, EntityId, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.test', raceId: 'race.test' };

function setup(floorText: string[], party = [HERO]): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party, floorText }, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

/** The floor with what `viewer` sees drawn and everything else blank, to eyeball shadows. */
function sightText(state: RunState, viewer: ActorEntity): string[] {
  const floor = getFloor(state, viewer.floor);
  const terrain = Grid.wrap(floor.terrain);
  const rows = Array.from({ length: terrain.height }, () => Array<string>(terrain.width).fill(' '));
  for (const { x, y } of fieldOfView(state, viewer)) {
    const row = rows[y] as string[];
    const f = featureAt(state, viewer.floor, { x, y })?.feature;
    row[x] = terrain.get(x, y) === Terrain.Wall ? '#' : f?.kind === 'door' ? (f.open ? "'" : '+') : '.';
  }
  (rows[viewer.pos.y] as string[])[viewer.pos.x] = '@';
  return rows.map((r) => r.join(''));
}

/** Every floor tile's FOV from the same moment, as sets of tile indices. */
function allViews(state: RunState, radius: number): Map<number, Set<number>> {
  const floor = getFloor(state, 'd1');
  const { width, height, cells } = floor.terrain;
  const blocksSight = sightBlockers(state, 'd1');
  const views = new Map<number, Set<number>>();
  for (let i = 0; i < cells.length; i++) {
    const origin = { x: i % width, y: Math.floor(i / width) };
    if (blocksSight(origin.x, origin.y)) continue;
    views.set(i, new Set(computeFov({ width, height, origin, radius, blocksSight })));
  }
  return views;
}

/** Pairs of see-through tiles where A sees B but B does not see A. Should always be empty. */
function asymmetries(state: RunState, radius: number): [number, number][] {
  const views = allViews(state, radius);
  const bad: [number, number][] = [];
  for (const [a, seen] of views) {
    for (const b of seen) {
      const back = views.get(b);
      if (back !== undefined && !back.has(a)) bad.push([a, b]);
    }
  }
  return bad;
}

describe('field of view', () => {
  it('is symmetric between see-through tiles on hand-built maps', () => {
    const maps = [
      // pillars and alcoves
      ['############', '#@.........#', '#.#..#..#..#', '#....#.....#', '#.#.....##.#', '#..........#', '############'],
      // a room with a door into a jagged corridor, and an open door further on
      ['##########', '#@...#####', '#....+...#', '#....###.#', '######...#', "#....'..##", '##########'],
      // diagonal walls and gaps
      ['#########', '#@......#', '#..#....#', '#...#...#', '#....#..#', '#.#...#.#', '#.......#', '#########'],
    ];
    for (const map of maps) {
      const { state } = setup(map);
      for (const radius of [3, BASE_SIGHT_RADIUS, 40]) expect(asymmetries(state, radius)).toEqual([]);
    }
  });

  it('is symmetric on a generated floor', () => {
    const state = createRun({ party: [HERO] }, 7);
    expect(asymmetries(state, BASE_SIGHT_RADIUS)).toEqual([]);
  });

  it('casts shadows behind pillars and shows the walls it reaches', () => {
    const { state, hero } = setup(['###########', '#.........#', '#...#.....#', '#.........#', '#@........#', '###########']);
    // The pillar hides two tiles up and to the right; the far column is past the sight radius.
    expect(sightText(state, hero)).toEqual([
      '#######    ',
      '#....  ..  ',
      '#...#..... ',
      '#......... ',
      '#@........ ',
      '########## ',
    ]);
  });

  it('is blocked by walls and closed doors but not by open doors', () => {
    const closed = setup(['#########', '#@..+...#', '#########']);
    expect(sightText(closed.state, closed.hero)).toEqual(['#####    ', '#@..+    ', '#####    ']);

    const open = setup(["#########", "#@..'...#", '#########']);
    expect(sightText(open.state, open.hero)).toEqual(['#########', "#@..'...#", '#########']);
  });

  it('reaches as far as the sight radius and no further', () => {
    const corridor = '#@' + '.'.repeat(BASE_SIGHT_RADIUS + 3) + '#';
    const wall = '#'.repeat(corridor.length);
    const { state, hero } = setup([wall, corridor, wall]);
    const at = (dx: number): Pos => ({ x: hero.pos.x + dx, y: hero.pos.y });
    expect(canSee(state, hero, at(BASE_SIGHT_RADIUS))).toBe(true);
    expect(canSee(state, hero, at(BASE_SIGHT_RADIUS + 1))).toBe(false);
  });

  it('lists each tile once, the viewer’s own tile included', () => {
    const { state, hero } = setup(['#####', '#...#', '#.@.#', '#...#', '#####']);
    const tiles = fieldOfView(state, hero).map((p) => `${p.x},${p.y}`);
    expect(new Set(tiles).size).toBe(tiles.length);
    expect(tiles).toHaveLength(25);
    expect(tiles).toContain('2,2');
  });
});

describe('party memory', () => {
  // A room on the left, a closed door, and a room on the right out of sight.
  const ROOMS = ['###########', '#...#.....#', '#.@.+.....#', '#...#.....#', '###########'];

  it('starts with what the party sees when the run is created', () => {
    const { state } = setup(ROOMS);
    const memory = getMemory(state, 'd1');
    expect(rememberedTerrain(memory, { x: 1, y: 1 })).toBe(Terrain.Floor);
    expect(rememberedTerrain(memory, { x: 0, y: 0 })).toBe(Terrain.Wall);
    expect(rememberedTerrain(memory, { x: 4, y: 2 })).toBe(Terrain.Floor); // the door's tile
    expect(memory.features[2 * 11 + 4]).toEqual({ def: 'feature.door', feature: { kind: 'door', open: false } });
    expect(rememberedTerrain(memory, { x: 6, y: 2 })).toBeNull(); // behind the door
  });

  it('keeps the last known state of tiles out of sight, and updates it when they are seen again', () => {
    const { state, hero } = setup(ROOMS);
    const memory = getMemory(state, 'd1');
    const door = featureAt(state, 'd1', { x: 4, y: 2 });
    if (door?.feature?.kind !== 'door') throw new Error('no door');

    // Open the door and step through: the right room is seen.
    door.feature.open = true;
    moveEntity(state, hero.id, 'd1', { x: 7, y: 2 });
    perceive(state, hero.id);
    expect(rememberedTerrain(memory, { x: 8, y: 2 })).toBe(Terrain.Floor);

    // Behind the hero's back, the left room changes and the door is shut again.
    door.feature.open = false;
    moveEntity(state, hero.id, 'd1', { x: 8, y: 2 });
    Grid.wrap(getFloor(state, 'd1').terrain).set(1, 1, Terrain.Wall);
    perceive(state, hero.id);
    expect(memory.features[2 * 11 + 4]?.feature).toEqual({ kind: 'door', open: false }); // the door is in view
    expect(rememberedTerrain(memory, { x: 1, y: 1 })).toBe(Terrain.Floor); // out of view: stale

    // Back in the left room, the change is seen.
    moveEntity(state, hero.id, 'd1', { x: 2, y: 2 });
    perceive(state, hero.id);
    expect(rememberedTerrain(memory, { x: 1, y: 1 })).toBe(Terrain.Wall);
  });

  it('forgets a feature that is gone when its tile is seen again', () => {
    const { state, hero } = setup(['#######', '#@.>..#', '#######']);
    const memory = getMemory(state, 'd1');
    expect(memory.features[1 * 7 + 3]).toEqual({ def: 'feature.stairs_down', feature: { kind: 'stairs', dir: 'down' } });
    removeEntity(state, (featureAt(state, 'd1', { x: 3, y: 1 }) as Entity).id);
    perceive(state, hero.id);
    expect(memory.features[1 * 7 + 3]).toBeUndefined();
  });

  it('is shared: what any party member sees, the party knows', () => {
    const { state } = setup(['###########', '#.@.#.....#', '#...#..@..#', '#...#.....#', '###########'], [HERO, { ...HERO, name: 'Ysolde' }]);
    const memory = getMemory(state, 'd1');
    expect(rememberedTerrain(memory, { x: 1, y: 3 })).toBe(Terrain.Floor);
    expect(rememberedTerrain(memory, { x: 9, y: 1 })).toBe(Terrain.Floor);
    expect(explored(state, 'd1').fraction).toBe(1);
  });

  it('reports explored floor tiles per floor, ignoring walls', () => {
    const { state, hero } = setup(ROOMS);
    // 9 tiles in the left room, the door, and 15 in the right room.
    expect(explored(state, 'd1')).toEqual({ seen: 10, total: 25, fraction: 10 / 25 });
    const door = featureAt(state, 'd1', { x: 4, y: 2 });
    if (door?.feature?.kind === 'door') door.feature.open = true;
    perceive(state, hero.id);
    expect(explored(state, 'd1').seen).toBeGreaterThan(10);
    moveEntity(state, hero.id, 'd1', { x: 7, y: 2 });
    perceive(state, hero.id);
    expect(explored(state, 'd1')).toEqual({ seen: 25, total: 25, fraction: 1 });
  });

  it('is updated as party members act during a step', () => {
    const { state, hero } = setup(['##################', '#@...............#', '##################']);
    expect(rememberedTerrain(getMemory(state, 'd1'), { x: 12, y: 1 })).toBeNull();
    step(state, [], { decide: () => ({ id: 'move', dir: { x: 1, y: 0 } }) });
    expect(hero.pos).toEqual({ x: 2, y: 1 });
    // One step east brings tile 2 + 8 = 10 into view right after the move.
    expect(rememberedTerrain(getMemory(state, 'd1'), { x: 10, y: 1 })).toBe(Terrain.Floor);
    expect(rememberedTerrain(getMemory(state, 'd1'), { x: 11, y: 1 })).toBeNull();
  });

  it('survives a save round trip', () => {
    const { state } = setup(ROOMS);
    const back = deserialize(serialize(state));
    expect(back.memory).toStrictEqual(state.memory);
    expect(back.memory.d1?.terrain.cells).toBeInstanceOf(Uint8Array);
  });
});

describe('partyVisible', () => {
  it('marks the tiles any living party member on the floor sees now, and only those', () => {
    const { state } = setup(['###########', '#.@.#.....#', '#...#..@..#', '#...#.....#', '###########'], [HERO, { ...HERO, name: 'Ysolde' }]);
    const [a, b] = state.party.map((id) => getEntity(state, id) as ActorEntity) as [ActorEntity, ActorEntity];
    const mask = partyVisible(state, 'd1');
    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < mask.width; x++) {
        const expected = canSee(state, a, { x, y }) || canSee(state, b, { x, y });
        expect(mask.get(x, y) === 1).toBe(expected);
      }
    }
    b.actor.hp = 0;
    expect(partyVisible(state, 'd1').get(8, 2)).toBe(0);
  });
});
