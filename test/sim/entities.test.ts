import { describe, expect, it } from 'vitest';
import { findNonPlain } from '../../src/core';
import {
  actorAt,
  addEntity,
  addFloor,
  createRun,
  entitiesAt,
  entitiesOnFloor,
  featureAt,
  getEntity,
  getFloor,
  moveEntity,
  parseFloorText,
  removeEntity,
} from '../../src/sim';
import type { ActorPart, NewEntity, RunState } from '../../src/sim';

const RAT_ACTOR: ActorPart = { energy: 0, speed: 120, hp: 3, maxHp: 3, mp: 0, maxMp: 0, faction: 'monster' };

/** A run on a small hand-built floor, plus an empty second floor `d2` below it. */
function setup(): RunState {
  const state = createRun(
    { party: [{ name: 'A', classId: 'class.vanguard', raceId: 'race.human' }], floorText: ['#######', "#@.+'>#", '#######'] },
    1,
  );
  state.dungeon.nodes.d2 = { id: 'd2', depth: 2, up: 'd1', down: [] };
  state.dungeon.nodes.d1?.down.push('d2');
  addFloor(state, 'd2', parseFloorText(['#####', '#<..#', '#####']));
  return state;
}

const rat = (pos: { x: number; y: number }, floor = 'd1'): NewEntity => ({
  def: 'monster.test_rat',
  floor,
  pos,
  actor: RAT_ACTOR,
});

describe('entity helpers', () => {
  it('adds entities with increasing ids and indexes them by floor', () => {
    const state = setup();
    const before = state.nextEntityId;
    const a = addEntity(state, rat({ x: 2, y: 1 }));
    const b = addEntity(state, rat({ x: 2, y: 1 }, 'd2'));
    expect([a.id, b.id]).toEqual([before, before + 1]);
    expect(state.nextEntityId).toBe(before + 2);
    expect(getEntity(state, a.id)).toBe(a);
    expect(getFloor(state, 'd1').entities.at(-1)).toBe(a.id);
    expect(entitiesOnFloor(state, 'd2').map((e) => e.id)).toContain(b.id);
    expect(entitiesOnFloor(state, 'd1').map((e) => e.id)).not.toContain(b.id);
  });

  it('copies the template it is given, so entities never share objects', () => {
    const state = setup();
    const template = rat({ x: 2, y: 1 });
    const a = addEntity(state, template);
    const b = addEntity(state, { ...template, pos: { x: 1, y: 1 } });
    expect(a.actor).not.toBe(RAT_ACTOR);
    expect(a.actor).not.toBe(b.actor);
    expect(a.pos).not.toBe(template.pos);
    expect(findNonPlain(state)).toBeNull();
  });

  it('queries entities, actors and features by position', () => {
    const state = setup();
    const hero = getEntity(state, state.party[0] as number);
    expect(actorAt(state, 'd1', { x: 1, y: 1 })).toBe(hero);
    expect(actorAt(state, 'd1', { x: 2, y: 1 })).toBeUndefined();
    expect(featureAt(state, 'd1', { x: 3, y: 1 })?.feature).toEqual({ kind: 'door', open: false });
    expect(featureAt(state, 'd1', { x: 4, y: 1 })?.feature).toEqual({ kind: 'door', open: true });
    expect(featureAt(state, 'd1', { x: 5, y: 1 })?.feature).toEqual({ kind: 'stairs', dir: 'down' });

    const r = addEntity(state, rat({ x: 3, y: 1 }));
    expect(entitiesAt(state, 'd1', { x: 3, y: 1 }).map((e) => e.def)).toEqual(['feature.door', 'monster.test_rat']);
    expect(actorAt(state, 'd1', { x: 3, y: 1 })).toBe(r);
    expect(entitiesAt(state, 'd1', { x: 2, y: 1 })).toEqual([]);
  });

  it('moves entities within a floor and between floors', () => {
    const state = setup();
    const id = state.party[0] as number;
    const oldPos = getEntity(state, id).pos;
    moveEntity(state, id, 'd1', { x: 2, y: 1 });
    expect(getEntity(state, id).pos).toEqual({ x: 2, y: 1 });
    expect(getEntity(state, id).pos).not.toBe(oldPos);

    moveEntity(state, id, 'd2', { x: 1, y: 1 });
    expect(getEntity(state, id).floor).toBe('d2');
    expect(getFloor(state, 'd1').entities).not.toContain(id);
    expect(getFloor(state, 'd2').entities.at(-1)).toBe(id);
    expect(actorAt(state, 'd2', { x: 1, y: 1 })?.id).toBe(id);
  });

  it('removes entities from the run, their floor and the party', () => {
    const state = setup();
    const r = addEntity(state, rat({ x: 2, y: 1 }));
    expect(removeEntity(state, r.id)).toBe(r);
    expect(state.entities[r.id]).toBeUndefined();
    expect(getFloor(state, 'd1').entities).not.toContain(r.id);

    const hero = state.party[0] as number;
    removeEntity(state, hero);
    expect(state.party).toEqual([]);
    expect(() => getEntity(state, hero)).toThrow(/Unknown entity/);
    expect(() => removeEntity(state, hero)).toThrow(/Unknown entity/);

    // Ids are never reused.
    expect(addEntity(state, rat({ x: 2, y: 1 })).id).toBeGreaterThan(r.id);
  });

  it('rejects unknown floors and out-of-bounds positions', () => {
    const state = setup();
    expect(() => addEntity(state, rat({ x: 2, y: 1 }, 'd9'))).toThrow(/Unknown floor "d9"/);
    expect(() => addEntity(state, rat({ x: 7, y: 1 }))).toThrow(RangeError);
    expect(() => addEntity(state, rat({ x: 1.5, y: 1 }))).toThrow(RangeError);
    const id = state.party[0] as number;
    expect(() => moveEntity(state, id, 'd2', { x: 5, y: 1 })).toThrow(RangeError);
    expect(getEntity(state, id).floor).toBe('d1');
  });

  it('builds a floor only once, and only for a node of the dungeon graph', () => {
    const state = setup();
    const plan = parseFloorText(['###', '#.#', '###']);
    expect(() => addFloor(state, 'd2', plan)).toThrow(/already been built/);
    expect(() => addFloor(state, 'd3', plan)).toThrow(/not in the dungeon graph/);
  });

  it('copies the plan’s terrain rather than sharing it', () => {
    const state = createRun({ party: [{ name: 'A', classId: 'class.vanguard', raceId: 'race.human' }] }, 1);
    state.dungeon.nodes.d2 = { id: 'd2', depth: 2, up: 'd1', down: [] };
    const plan = parseFloorText(['###', '#<#', '###']);
    const floor = addFloor(state, 'd2', plan);
    expect(floor.terrain.cells).not.toBe(plan.terrain.cells);
    expect(floor.depth).toBe(2);
  });
});
