import { describe, expect, it } from 'vitest';
import { findNonPlain } from '../../src/core';
import { addEntity, createRun, getEntity, InlineHost, snapshot, step, Terrain } from '../../src/sim';
import type { ActorPart, EntityId, RunConfig, RunState, Snapshot } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

// Two rooms joined by a closed door. The party starts in the west room and can't see past it.
const TWO_ROOMS = [
  '###########',
  '#@...+....#',
  '#....#....#',
  '#<...#..>.#',
  '###########',
];
const CONFIG: RunConfig = { party: [HERO], floorText: TWO_ROOMS };

/** A monster that never acts (speed 0), so it stays where the test puts it. */
const STATUE: ActorPart = { energy: 0, speed: 0, hp: 5, maxHp: 5, mp: 0, maxMp: 0, faction: 'monster' };

function addStatue(state: RunState, x: number, y: number): EntityId {
  return addEntity(state, { def: 'monster.test', floor: 'd1', pos: { x, y }, actor: { ...STATUE } }).id;
}

/** The tile at (x, y) of a snapshot layer. */
function at(snap: Snapshot, layer: 'terrain' | 'visible', x: number, y: number): number {
  return snap.floor[layer][y * snap.floor.width + x] as number;
}

/** Every object, array, typed array and array buffer reachable from `value`. */
function objectsIn(value: unknown, into = new Set<object>()): Set<object> {
  if (typeof value !== 'object' || value === null || into.has(value)) return into;
  into.add(value);
  if (ArrayBuffer.isView(value)) {
    into.add(value.buffer);
    return into;
  }
  for (const child of Object.values(value)) objectsIn(child, into);
  return into;
}

describe('snapshot', () => {
  it('shows only what the party has seen', () => {
    const state = createRun(CONFIG, 1);
    const seen = addStatue(state, 3, 2);
    addStatue(state, 8, 2); // behind the closed door
    const snap = snapshot(state);

    expect(snap.floor).toMatchObject({ id: 'd1', depth: 1, width: 11, height: 5 });
    // The west room and its walls are known; the door is seen; the east room is not.
    expect(at(snap, 'terrain', 2, 2)).toBe(1 + Terrain.Floor);
    expect(at(snap, 'terrain', 0, 0)).toBe(1 + Terrain.Wall);
    expect(at(snap, 'terrain', 5, 1)).toBe(1 + Terrain.Floor);
    expect(at(snap, 'terrain', 7, 2)).toBe(0);
    expect(at(snap, 'visible', 2, 2)).toBe(1);
    expect(at(snap, 'visible', 7, 2)).toBe(0);
    // The west room's 12 floor tiles and the door, of 25 floor tiles in all.
    expect(snap.floor.explored).toEqual({ seen: 13, total: 25, fraction: 13 / 25 });

    expect(snap.floor.features).toEqual([
      { pos: { x: 5, y: 1 }, def: 'feature.door', feature: { kind: 'door', open: false } },
      { pos: { x: 1, y: 3 }, def: 'feature.stairs_up', feature: { kind: 'stairs', dir: 'up' } },
    ]);
    const hero = state.party[0] as EntityId;
    expect(snap.floor.actors).toEqual([
      { id: hero, def: 'actor.adventurer', pos: { x: 1, y: 1 }, faction: 'party' },
      { id: seen, def: 'monster.test', pos: { x: 3, y: 2 }, faction: 'monster' },
    ]);
  });

  it('describes each party member', () => {
    const state = createRun(CONFIG, 1);
    const hero = state.party[0] as EntityId;
    expect(snapshot(state).party).toEqual([
      {
        id: hero,
        name: 'Brannoc',
        classId: 'class.vanguard',
        raceId: 'race.human',
        floor: 'd1',
        pos: { x: 1, y: 1 },
        alive: true,
        hp: 20,
        maxHp: 20,
        mp: 5,
        maxMp: 5,
        intent: null,
      },
    ]);
    step(state, []);
    expect(snapshot(state).party[0]?.intent).toMatchObject({ rule: { set: 'baseline' }, action: 'act.explore' });
  });

  it('keeps remembered tiles but takes them out of view once the party leaves', () => {
    const host = new InlineHost();
    const snaps: Snapshot[] = [];
    host.onSnapshot((s) => snaps.push(s));
    host.start(CONFIG, 1);
    // Long enough to explore both rooms, not to reach the stairs down and leave the floor.
    host.run(7);
    const snap = snaps.at(-1) as Snapshot;
    expect(snap.party[0]?.floor).toBe('d1');

    // The hero has opened the door and explored the east room, so the stairs down are known.
    expect(snap.floor.features).toContainEqual({ pos: { x: 5, y: 1 }, def: 'feature.door', feature: { kind: 'door', open: true } });
    expect(snap.floor.features).toContainEqual({ pos: { x: 8, y: 3 }, def: 'feature.stairs_down', feature: { kind: 'stairs', dir: 'down' } });
    expect(snap.floor.terrain.every((code) => code !== 0)).toBe(true);
    expect(snap.floor.explored.fraction).toBe(1);
    // From the east room, parts of the west room are remembered but out of view.
    expect(snap.party[0]?.pos.x).toBeGreaterThan(5);
    const outOfView = snap.floor.terrain.filter((code, i) => code === 1 + Terrain.Floor && snap.floor.visible[i] === 0);
    expect(outOfView.length).toBeGreaterThan(0);
  });

  it('is plain data that shares nothing with the run state', () => {
    const state = createRun({ party: [HERO, { ...HERO, name: 'Ysolde' }] }, 7);
    for (let i = 0; i < 20; i++) step(state, []);
    const snap = snapshot(state);
    expect(findNonPlain(snap)).toBeNull();

    const inState = objectsIn(state);
    const shared = [...objectsIn(snap)].filter((o) => inState.has(o));
    expect(shared).toEqual([]);

    // Later steps don't reach into an earlier snapshot.
    const copy = structuredClone(snap);
    for (let i = 0; i < 20; i++) step(state, []);
    getEntity(state, state.party[0] as EntityId).pos = { x: 0, y: 0 };
    expect(snap).toEqual(copy);
  });

  it('shows the floor asked for', () => {
    const state = createRun(CONFIG, 1);
    expect(snapshot(state, { floor: 'd1' }).floor.id).toBe('d1');
    expect(() => snapshot(state, { floor: 'd9' })).toThrow();
  });
});
