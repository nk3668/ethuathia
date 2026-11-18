/**
 * The floors domain (ETH-058): a dungeon of several floors built lazily and deterministically,
 * the `stairs` action and its links, and the baseline descending with the party gathered.
 * Fixed seeds and hand-built floors (`floorTexts`), as for every AI behavior test.
 */
import { describe, expect, it } from 'vitest';
import {
  checkInvariants,
  createRun,
  deserialize,
  ensureFloor,
  featureAt,
  floorToText,
  gatheringAt,
  getEntity,
  getMemory,
  InlineHost,
  readHostRequest,
  serialize,
  snapshot,
  step,
  stairsOn,
  waitDecide,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, Command, EntityId, RunConfig, RunState, SimEvent, Snapshot } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

const D1 = ['#########', '#@.....>#', '#########'];
const D2 = ['#########', '#<..+..>#', '#########'];
const D3 = ['#####', '#<.>#', '#####'];

type Fired = Extract<SimEvent, { type: 'ruleFired' }>;
const fired = (events: SimEvent[]) => events.filter((e): e is Fired => e.type === 'ruleFired');
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

function setup(config: Partial<RunConfig> = {}, seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], depth: 3, floorTexts: [D1, D2, D3], ...config }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });

/** One step with these commands, everyone else waiting: only the commands move anyone. */
const by = (state: RunState, ...commands: Command[]) => step(state, commands, { decide: waitDecide });

/** Steps with no commands until `done` holds, at most `cap` times; returns every event. */
function runUntil(state: RunState, done: () => boolean, cap = 200): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < cap && !done(); i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('the dungeon', () => {
  it('is a line of config.depth floors, built only when first reached', () => {
    const { state } = setup();
    expect(Object.keys(state.dungeon.nodes)).toEqual(['d1', 'd2', 'd3']);
    expect(Object.keys(state.floors)).toEqual(['d1']);
    expect(() => createRun({ party: [HERO], depth: 0 }, 1)).toThrow(RangeError);
    expect(() => createRun({ party: [HERO], depth: 2.5 }, 1)).toThrow(RangeError);
  });

  it('builds each floor the same whatever order the floors are first reached in', () => {
    const a = createRun({ party: [HERO] }, 11);
    const b = createRun({ party: [HERO] }, 11);
    ensureFloor(a, 'd2');
    ensureFloor(a, 'd5');
    ensureFloor(b, 'd5');
    ensureFloor(b, 'd3');
    ensureFloor(b, 'd2');
    expect(floorToText(b, 'd2')).toEqual(floorToText(a, 'd2'));
    expect(floorToText(b, 'd5')).toEqual(floorToText(a, 'd5'));
    expect(floorToText(a, 'd2')).not.toEqual(floorToText(a, 'd5'));
    // Building a floor draws from none of the run's streams.
    expect(a.rng).toEqual(createRun({ party: [HERO] }, 11).rng);
    // A second call returns the floor already built.
    expect(ensureFloor(a, 'd2')).toBe(a.floors.d2);
  });

  it('gives the bottom floor no stairs down, generated or hand-built', () => {
    const { state } = setup();
    ensureFloor(state, 'd3');
    expect(stairsOn(state, 'd3', 'down')).toBeUndefined();
    expect(stairsOn(state, 'd3', 'up')).toBeDefined();
    const generated = createRun({ party: [HERO], depth: 2 }, 4);
    ensureFloor(generated, 'd2');
    expect(stairsOn(generated, 'd1', 'down')).toBeDefined();
    expect(stairsOn(generated, 'd2', 'down')).toBeUndefined();
  });
});

describe('the stairs action', () => {
  it('moves the actor to the linked stairs and back, and keeps a visited floor as it was left', () => {
    const { state, hero } = setup({ floorTexts: [['#####', '#@>.#', '#####'], D2, D3] });
    by(state, act(hero.id, { id: 'move', dir: { x: 1, y: 0 } }));
    const down = by(state, act(hero.id, { id: 'stairs', dir: 'down' }));
    expect(hero.floor).toBe('d2');
    expect(hero.pos).toEqual({ x: 1, y: 1 }); // on the up stairs
    expect(ofType(down, 'tookStairs')).toEqual([
      { type: 'tookStairs', actor: hero.id, dir: 'down', from: 'd1', to: 'd2', depth: 2, pos: { x: 1, y: 1 }, turn: expect.any(Number) },
    ]);
    expect(ofType(down, 'floorEntered')).toMatchObject([{ actor: hero.id, floor: 'd2', depth: 2, firstVisit: true }]);
    expect(state.domains.floors.deepest).toBe(2);
    expect(state.domains.floors.arrived.d2).toBe(down[0]?.turn);
    // The party saw the new floor on arrival.
    expect(getMemory(state, 'd2').terrain.cells.some((c) => c !== 0)).toBe(true);

    // Change something on d2, go back up, then down again: it is as it was left.
    for (let i = 0; i < 2; i++) by(state, act(hero.id, { id: 'move', dir: { x: 1, y: 0 } }));
    by(state, act(hero.id, { id: 'openDoor', dir: { x: 1, y: 0 } }));
    for (let i = 0; i < 2; i++) by(state, act(hero.id, { id: 'move', dir: { x: -1, y: 0 } }));
    const d2 = floorToText(state, 'd2');
    const up = by(state, act(hero.id, { id: 'stairs', dir: 'up' }));
    expect(hero.floor).toBe('d1');
    expect(hero.pos).toEqual({ x: 2, y: 1 }); // on the down stairs
    expect(ofType(up, 'floorEntered')).toMatchObject([{ floor: 'd1', depth: 1, firstVisit: false }]);
    by(state, act(hero.id, { id: 'stairs', dir: 'down' }));
    expect(floorToText(state, 'd2')).toEqual(d2);
    expect(featureAt(state, 'd2', { x: 4, y: 1 })?.feature).toEqual({ kind: 'door', open: true });
    expect(checkInvariants(state)).toEqual([]);
  });

  it('refuses without matching stairs underfoot, and out of the dungeon without the whole party', () => {
    const { state, hero } = setup({ party: [HERO, MIRA], floorTexts: [['##########', '#<@>....@#', '##########'], D2, D3] });
    expect(ofType(by(state, act(hero.id, { id: 'stairs', dir: 'down' })), 'actionFailed')).toMatchObject([
      { reason: 'There are no stairs down here' },
    ]);
    by(state, act(hero.id, { id: 'move', dir: { x: -1, y: 0 } }));
    expect(ofType(by(state, act(hero.id, { id: 'stairs', dir: 'up' })), 'actionFailed')).toMatchObject([
      { reason: 'These stairs lead out of the dungeon, and the party leaves together: Mira is not here yet' },
    ]);
    expect(hero.floor).toBe('d1');
    expect(state.domains.run.end).toBeNull();
  });

  it('puts an arrival next to the stairs when someone stands on them', () => {
    const { state } = setup({ party: [HERO, MIRA], floorTexts: [['######', '#@>@.#', '######'], D2, D3] });
    const [a, b] = state.party as [EntityId, EntityId];
    by(state, act(a, { id: 'move', dir: { x: 1, y: 0 } }));
    by(state, act(a, { id: 'stairs', dir: 'down' }));
    by(state, act(b, { id: 'move', dir: { x: -1, y: 0 } }));
    by(state, act(b, { id: 'stairs', dir: 'down' }));
    expect(getEntity(state, b).floor).toBe('d2');
    expect(getEntity(state, b).pos).not.toEqual(getEntity(state, a).pos);
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('the baseline descent', () => {
  it('descends once a floor is explored, arrives on the linked stairs, and turns back on the bottom floor', () => {
    const { state, hero } = setup();
    const events = runUntil(state, () => hero.ai?.memory.intent?.action === 'act.retreat_run');
    // It arrived on the bottom floor's stairs up, saw all of the tiny floor and went straight back up.
    expect(hero.floor).toBe('d2');
    expect(ofType(events, 'tookStairs').map((e) => [e.from, e.to])).toEqual([
      ['d1', 'd2'],
      ['d2', 'd3'],
      ['d3', 'd2'],
    ]);
    // Each floor was fully explored before the hero went down.
    expect(fired(events).filter((e) => e.action === 'act.descend').at(0)?.detail).toBe(
      'Descend: heading for the stairs down, 6 turns away',
    );
    expect(hero.ai?.memory.intent?.detail).toBe('Retreat: taking the stairs up to floor 2 (on the bottom floor, floor 3 of 3)');
    expect(ofType(events, 'stuck')).toEqual([]);
  });

  it('gathers the party at the stairs and goes down together', () => {
    const GATHER = [
      '###############',
      '#@.......#...@#',
      '#........#....#',
      '#>.......+....#',
      '###############',
    ];
    const { state } = setup({ party: [HERO, MIRA], floorTexts: [GATHER, D2, D3] });
    const [a, b] = state.party as [EntityId, EntityId];
    const events = runUntil(state, () => getEntity(state, b).floor === 'd2');
    const gather = fired(events).filter((e) => e.action === 'act.gather');
    expect(gather.length).toBeGreaterThan(0);
    expect(gather[0]).toMatchObject({ actor: a, detail: 'Gather at the stairs: waiting at the stairs down for Mira' });
    const took = ofType(events, 'tookStairs');
    expect(took.map((e) => e.actor)).toEqual([a, b]);
    // Nobody went down before both were at the stairs.
    const first = events.indexOf(took[0] as SimEvent);
    expect(gather.every((e) => events.indexOf(e) < first)).toBe(true);
    expect((took[1]?.turn ?? 0) - (took[0]?.turn ?? 0)).toBeLessThanOrEqual(3);
    expect(ofType(events, 'stuck')).toEqual([]);
  });

  it('counts a member gathered through others near the stairs', () => {
    const { state } = setup({ party: [HERO, MIRA, HERO], floorTexts: [['##########', '#>@.@.@..#', '##########'], D2, D3] });
    expect(gatheringAt(state, 'd1', { x: 1, y: 1 }).missing).toEqual([]);
  });

  it('goes on without the party once the floor turn cap is spent', () => {
    const LONG = ['##############################', '#@>..........................#', '##############################'];
    const { state, hero } = setup({ floorTexts: [LONG, D2, D3], floorTurnCap: 3 });
    const events = runUntil(state, () => hero.floor === 'd2', 20);
    expect(hero.floor).toBe('d2');
    const descend = fired(events).find((e) => e.action === 'act.descend');
    expect(descend).toMatchObject({ rule: { set: 'baseline', index: 3 }, condition: 'cond.floor_overstayed' });
    expect(descend?.detail).toContain('the limit is 3');
  });

  it('keeps a split party running on two floors', () => {
    const { state } = setup({ party: [HERO, MIRA], floorTexts: [['########', '#@>@...#', '########'], D2, D3] });
    const [a, b] = state.party as [EntityId, EntityId];
    by(state, act(a, { id: 'move', dir: { x: 1, y: 0 } }));
    by(state, act(a, { id: 'stairs', dir: 'down' }));
    expect(getEntity(state, a).floor).toBe('d2');
    expect(getEntity(state, b).floor).toBe('d1');
    const events = step(state, []);
    expect(new Set(fired(events).map((e) => e.actor))).toEqual(new Set([a, b]));

    // The snapshot shows whichever member the UI follows.
    expect(snapshot(state, { follow: a }).floor.id).toBe('d2');
    expect(snapshot(state, { follow: b }).floor.id).toBe('d1');
    expect(snapshot(state).domains.floors).toEqual({ depth: 3, deepest: 2 });

    // And a save taken now carries on the same.
    const copy = deserialize(serialize(state));
    for (let i = 0; i < 20; i++) expect(step(copy, [])).toEqual(step(state, []));
  });
});

describe('the view a host sends', () => {
  it('follows the entity the UI asks for', () => {
    const host = new InlineHost();
    const snaps: Snapshot[] = [];
    host.onSnapshot((s) => snaps.push(s));
    // The stairs down is entity 1, so the hero is 2. A view set before `start` is kept.
    host.setView({ follow: 2 });
    host.start({ party: [HERO], depth: 3, floorTexts: [['#####', '#@>.#', '#####'], D2, D3] }, 1);
    expect(snaps.at(-1)?.party[0]?.id).toBe(2);
    expect(snaps.at(-1)?.floor.id).toBe('d1');
    host.send({ type: 'playerAction', actor: 2, action: { id: 'move', dir: { x: 1, y: 0 } } });
    host.run(1);
    host.send({ type: 'playerAction', actor: 2, action: { id: 'stairs', dir: 'down' } });
    host.run(1);
    expect(snaps.at(-1)?.floor.id).toBe('d2');
    host.setView({ floor: 'd1' });
    expect(snaps.at(-1)?.floor.id).toBe('d1');
  });

  it('checks setView requests', () => {
    expect(readHostRequest({ type: 'setView', view: { follow: 3 } })).toEqual({ type: 'setView', view: { follow: 3 } });
    expect(readHostRequest({ type: 'setView', view: {} })).toEqual({ type: 'setView', view: {} });
    expect(readHostRequest({ type: 'setView', view: { follow: 'x' } })).toMatch(/entity id/);
    expect(readHostRequest({ type: 'setView', view: { zoom: 2 } })).toMatch(/Unknown view option/);
    expect(readHostRequest({ type: 'setView' })).toMatch(/view object/);
  });
});
