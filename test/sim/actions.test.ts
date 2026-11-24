import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  addEntity,
  createRun,
  featureAt,
  floorToText,
  getEntity,
  parseRequest,
  performAction,
  serialize,
  step,
  stepBlocker,
  validateAction,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, Command, EntityId, RunState, SimEventBody } from '../../src/sim';

//   x 0123456
// y 0 #######
//   1 #@.+..#     closed door at (3,1)
//   2 #..#'.#     open door at (4,2)
//   3 #######
const MAP = ['#######', '#@.+..#', "#..#'.#", '#######'];

const E = { x: 1, y: 0 };
const W = { x: -1, y: 0 };
const S = { x: 0, y: 1 };
const SE = { x: 1, y: 1 };
const SW = { x: -1, y: 1 };

function setup(floorText = MAP): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [{ name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' }], floorText }, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

/** Puts the hero somewhere on the same floor, between tests of what it can do from there. */
function place(hero: ActorEntity, x: number, y: number): void {
  hero.pos = { x, y };
}

/** Runs one action directly and returns the events and the energy it cost. */
function act(state: RunState, hero: ActorEntity, request: ActionRequest) {
  const events: SimEventBody[] = [];
  const cost = performAction(state, hero, request, (e) => events.push(e));
  return { events, cost };
}

describe('validateAction', () => {
  it('returns a reason and changes nothing when an action cannot be done', () => {
    const { state, hero } = setup();
    addEntity(state, { def: 'monster.test', floor: 'd1', pos: { x: 1, y: 2 }, actor: { ...hero.actor, faction: 'monster' } });
    const before = serialize(state);
    const cases: [ActionRequest, string][] = [
      [{ id: 'move', dir: W }, 'A wall is in the way'],
      [{ id: 'move', dir: S }, 'Entity 4 is in the way'],
      [{ id: 'openDoor', dir: E }, 'There is no door there'],
      [{ id: 'move', dir: { x: 2, y: 0 } }, 'The direction must be one step: x and y each -1, 0 or 1, not both 0'],
      [{ id: 'jump' } as unknown as ActionRequest, 'Unknown action "jump"'],
    ];
    for (const [request, reason] of cases) expect(validateAction(state, hero, request)).toBe(reason);
    expect(serialize(state)).toBe(before);
  });

  it('accepts an action that can be done, still without changing anything', () => {
    const { state, hero } = setup();
    const before = serialize(state);
    expect(validateAction(state, hero, { id: 'move', dir: E })).toBeNull();
    expect(validateAction(state, hero, { id: 'wait' })).toBeNull();
    expect(serialize(state)).toBe(before);
  });
});

describe('move', () => {
  it('steps to the neighboring tile and emits moved', () => {
    const { state, hero } = setup();
    const { events, cost } = act(state, hero, { id: 'move', dir: SE });
    expect(events).toEqual([{ type: 'moved', actor: hero.id, from: { x: 1, y: 1 }, to: { x: 2, y: 2 } }]);
    expect(hero.pos).toEqual({ x: 2, y: 2 });
    expect(cost).toBe(ACTIONS.move.cost);
  });

  it('is blocked by walls, closed doors, other actors and the edge of the map', () => {
    const { state, hero } = setup();
    expect(stepBlocker(state, 'd1', hero.pos, W)).toBe('A wall is in the way');
    place(hero, 2, 1);
    expect(stepBlocker(state, 'd1', hero.pos, E)).toBe('The door is closed');

    const edge = setup(['@.']);
    expect(stepBlocker(edge.state, 'd1', edge.hero.pos, W)).toBe('That is the edge of the map');
    expect(stepBlocker(edge.state, 'd1', edge.hero.pos, E)).toBeNull();
  });

  it('does not enter or leave a doorway diagonally', () => {
    const { state, hero } = setup();
    place(hero, 5, 1);
    expect(validateAction(state, hero, { id: 'move', dir: SW })).toBe('Doorways can’t be entered or left diagonally');
    place(hero, 4, 1);
    expect(validateAction(state, hero, { id: 'move', dir: S })).toBeNull();
    place(hero, 4, 2);
    expect(validateAction(state, hero, { id: 'move', dir: { x: 1, y: -1 } })).toBe(
      'Doorways can’t be entered or left diagonally',
    );
    expect(validateAction(state, hero, { id: 'move', dir: E })).toBeNull();
  });

  it('turns into a wait with actionFailed when it is blocked', () => {
    const { state, hero } = setup();
    const { events, cost } = act(state, hero, { id: 'move', dir: W });
    expect(events).toEqual([
      { type: 'actionFailed', actor: hero.id, action: 'move', reason: 'A wall is in the way' },
      { type: 'waited', actor: hero.id },
    ]);
    expect(hero.pos).toEqual({ x: 1, y: 1 });
    expect(cost).toBe(ACTIONS.wait.cost);
  });
});

describe('openDoor', () => {
  it('opens a closed door and emits doorOpened, after which the doorway can be entered', () => {
    const { state, hero } = setup();
    place(hero, 2, 1);
    const door = featureAt(state, 'd1', { x: 3, y: 1 });
    const { events, cost } = act(state, hero, { id: 'openDoor', dir: E });
    expect(events).toEqual([{ type: 'doorOpened', actor: hero.id, door: door?.id, pos: { x: 3, y: 1 } }]);
    expect(door?.feature).toEqual({ kind: 'door', open: true });
    expect(cost).toBe(ACTIONS.openDoor.cost);
    expect(hero.pos).toEqual({ x: 2, y: 1 });
    expect(validateAction(state, hero, { id: 'move', dir: E })).toBeNull();
    expect(validateAction(state, hero, { id: 'openDoor', dir: E })).toBe('The door is already open');
  });
});

describe('wait', () => {
  it('only spends energy', () => {
    const { state, hero } = setup();
    const before = serialize(state);
    const { events, cost } = act(state, hero, { id: 'wait' });
    expect(events).toEqual([{ type: 'waited', actor: hero.id }]);
    expect(cost).toBe(ACTIONS.wait.cost);
    expect(serialize(state)).toBe(before);
  });
});

describe('parseRequest', () => {
  it('builds a clean copy of a well-formed request', () => {
    const dir = { x: 1, y: 0, extra: 'dropped' };
    const parsed = parseRequest({ id: 'move', dir, note: 'dropped' });
    expect(parsed).toEqual({ id: 'move', dir: { x: 1, y: 0 } });
    expect(typeof parsed !== 'string' && parsed.id === 'move' && parsed.dir).not.toBe(dir);
  });

  it('explains what is wrong with a malformed one', () => {
    const bad = 'The direction must be one step: x and y each -1, 0 or 1, not both 0';
    expect(parseRequest(null)).toBe('Not an action request');
    expect(parseRequest(['move'])).toBe('Not an action request');
    expect(parseRequest({ id: 'move' })).toBe(bad);
    expect(parseRequest({ id: 'move', dir: { x: 0, y: 0 } })).toBe(bad);
    expect(parseRequest({ id: 'openDoor', dir: { x: 0.5, y: 0 } })).toBe(bad);
    expect(parseRequest({ id: 'toString' })).toBe('Unknown action "toString"');
  });
});

describe('actions in the step loop', () => {
  it('charges each action’s energy cost and lets a possessed adventurer walk through a door', () => {
    const { state, hero } = setup();
    const go = (action: ActionRequest): Command => ({ type: 'playerAction', actor: hero.id, action });
    const plan: ActionRequest[] = [
      { id: 'move', dir: E },
      { id: 'openDoor', dir: E },
      { id: 'move', dir: E },
      { id: 'move', dir: E },
      { id: 'move', dir: S },
    ];
    for (const action of plan) {
      const events = step(state, [go(action)]);
      expect(events.filter((e) => e.type === 'actionFailed' || e.type === 'commandRejected')).toEqual([]);
      expect(hero.actor.energy).toBe(100 - ACTIONS[action.id].cost);
    }
    expect(state.turn).toBe(plan.length);
    expect(floorToText(state, 'd1')).toEqual(['#######', "#..'..#", "#..#@.#", '#######']);
  });

  it('rejects a player action with a malformed direction', () => {
    const { state, hero } = setup();
    const events = step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'move', dir: { x: 3, y: 0 } } }]);
    expect(events.find((e) => e.type !== 'runStarted' && e.type !== 'kitIssued')).toMatchObject({ type: 'commandRejected', command: 'playerAction' });
    expect(hero.actor.queued).toBeUndefined();
  });
});

describe('ACTIONS', () => {
  it('gives every action Codex text and a positive energy cost', () => {
    for (const [id, def] of Object.entries(ACTIONS)) {
      expect(def.id).toBe(id);
      expect(def.name).not.toBe('');
      expect(def.description).not.toBe('');
      expect(def.cost).toBeGreaterThan(0);
    }
  });
});
