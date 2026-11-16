import { describe, expect, it } from 'vitest';
import {
  addEntity,
  addFloor,
  createRun,
  deserialize,
  getEntity,
  moveEntity,
  parseFloorText,
  removeEntity,
  serialize,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActionRequest, ActorPart, Command, Decide, EntityId, RunConfig, RunState, SimEvent } from '../../src/sim';

const ROOM = ['#######', '#@....#', '#<....#', '#######'];
const hero = (name: string) => ({ name, classId: 'class.test', raceId: 'race.test' });
const ONE: RunConfig = { party: [hero('Brannoc')], floorText: ROOM };

const MONSTER: ActorPart = { energy: 0, speed: 100, hp: 5, maxHp: 5, mp: 0, maxMp: 0, faction: 'monster' };

function addMonster(state: RunState, speed: number, pos = { x: 5, y: 2 }): EntityId {
  return addEntity(state, { def: 'monster.test', floor: 'd1', pos, actor: { ...MONSTER, speed } }).id;
}

function setSpeed(state: RunState, id: EntityId, speed: number): void {
  const actor = getEntity(state, id).actor;
  if (actor === undefined) throw new Error('not an actor');
  actor.speed = speed;
}

/** The ids of the actors that took a turn, in order. */
function actors(events: SimEvent[]): EntityId[] {
  return events.flatMap((e) => (e.type === 'waited' ? [e.actor] : []));
}

function count(ids: EntityId[], id: EntityId): number {
  return ids.filter((x) => x === id).length;
}

describe('step', () => {
  it('lets a speed-100 adventurer act once per step, one turn apart', () => {
    const state = createRun(ONE, 1);
    const id = state.party[0] as EntityId;
    const options = { decide: waitDecide };
    expect(step(state, [], options)).toEqual([{ type: 'waited', actor: id, turn: 1 }]);
    expect(state.turn).toBe(1);
    expect(getEntity(state, id).actor?.energy).toBe(0);
    expect(step(state, [], options)).toEqual([{ type: 'waited', actor: id, turn: 2 }]);
  });

  it('decides with the decision engine by default', () => {
    // The whole room is in view from the start, so the baseline has nothing to explore and waits.
    const state = createRun(ONE, 1);
    const id = state.party[0] as EntityId;
    expect(step(state, []).map((e) => e.type)).toEqual(['ruleFired', 'waited']);
    expect(getEntity(state, id).ai?.memory.intent?.action).toBe('act.wait');
  });

  it('gives actors turns in proportion to their speed', () => {
    const state = createRun(ONE, 1);
    const hero = state.party[0] as EntityId;
    const fast = addMonster(state, 200, { x: 5, y: 1 });
    const slow = addMonster(state, 50);
    const turns: EntityId[] = [];
    for (let i = 0; i < 100; i++) turns.push(...actors(step(state, [])));

    expect(state.turn).toBe(100);
    expect(count(turns, hero)).toBe(100);
    // Energy is conserved: every point gained is either spent on a turn or still held, and an
    // actor never holds more than one tick's worth past the threshold.
    for (const [id, speed] of [[hero, 100], [fast, 200], [slow, 50]] as const) {
      const energy = getEntity(state, id).actor?.energy ?? NaN;
      expect(count(turns, id) * 100 + energy).toBe(state.turn * speed);
      expect(energy).toBeLessThan(100 + speed);
    }
    expect(count(turns, fast)).toBeGreaterThanOrEqual(198);
    expect(count(turns, slow)).toBeGreaterThanOrEqual(49);
  });

  it('runs until every party member has acted once, letting faster ones act more', () => {
    const state = createRun({ ...ONE, party: [hero('A'), hero('B')] }, 1);
    const [a, b] = state.party as [EntityId, EntityId];
    setSpeed(state, a, 200);
    setSpeed(state, b, 50);

    const turns = actors(step(state, []));
    expect(count(turns, b)).toBe(1);
    // Turn 1: A acts twice (200 energy), B has 50. Turn 2: A acts, then B, which ends the step.
    expect(turns).toEqual([a, a, a, b]);
    expect(turns.at(-1)).toBe(b);
    expect(state.turn).toBe(2);
  });

  it('ends a step on the last party member to act, so the rest act next step', () => {
    const state = createRun(ONE, 1);
    const hero = state.party[0] as EntityId;
    const monster = addMonster(state, 100);
    expect(actors(step(state, []))).toEqual([hero]);
    expect(actors(step(state, []))).toEqual([monster, hero]);
    expect(actors(step(state, []))).toEqual([monster, hero]);
  });

  it('does not schedule actors on floors without a party member', () => {
    const state = createRun(ONE, 1);
    const monster = addMonster(state, 100);
    state.dungeon.nodes.d2 = { id: 'd2', depth: 2, up: 'd1', down: [] };
    addFloor(state, 'd2', parseFloorText(ROOM));
    moveEntity(state, monster, 'd2', { x: 5, y: 2 });

    for (let i = 0; i < 5; i++) expect(actors(step(state, []))).not.toContain(monster);
    expect(getEntity(state, monster).actor?.energy).toBe(0);
  });

  it('skips party members who cannot act, and returns at once if none can', () => {
    const state = createRun({ ...ONE, party: [hero('A'), hero('B')] }, 1);
    const [a, b] = state.party as [EntityId, EntityId];
    setSpeed(state, b, 0);
    expect(actors(step(state, []))).toEqual([a]);

    removeEntity(state, a);
    expect(step(state, [])).toEqual([]);
    expect(state.turn).toBe(1);
  });

  it('stops waiting for a party member removed during the step', () => {
    const state = createRun({ ...ONE, party: [hero('A'), hero('B')] }, 1);
    const [a, b] = state.party as [EntityId, EntityId];
    const decide: Decide = ({ state: s, actor }) => {
      if (actor.id === a) removeEntity(s, b);
      return { id: 'wait' };
    };
    expect(actors(step(state, [], { decide }))).toEqual([a]);
  });

  it('asks the decide function for each action and charges its cost', () => {
    const state = createRun(ONE, 1);
    const seen: EntityId[] = [];
    const decide: Decide = ({ actor, emit }) => {
      seen.push(actor.id);
      emit({ type: 'commandRejected', command: 'trace', reason: `decided for ${actor.id}` });
      return { id: 'wait' };
    };
    const events = step(state, [], { decide });
    expect(seen).toEqual(state.party);
    expect(events.map((e) => e.type)).toEqual(['commandRejected', 'waited']);
    expect(getEntity(state, state.party[0] as EntityId).actor?.energy).toBe(0);
  });

  it('turns an unknown action into a failed wait instead of stalling', () => {
    const state = createRun(ONE, 1);
    const id = state.party[0] as EntityId;
    const decide: Decide = () => ({ id: 'fly' }) as unknown as ActionRequest;
    expect(step(state, [], { decide })).toEqual([
      { type: 'actionFailed', actor: id, action: 'fly', reason: 'Unknown action "fly"', turn: 1 },
      { type: 'waited', actor: id, turn: 1 },
    ]);
    expect(getEntity(state, id).actor?.energy).toBe(0);
  });

  it('gives the same events and state for the same seed, commands and decisions', () => {
    const run = () => {
      const state = createRun({ ...ONE, party: [hero('A'), hero('B')] }, 9);
      setSpeed(state, state.party[1] as EntityId, 70);
      addMonster(state, 130);
      const events = Array.from({ length: 30 }, () => step(state, [])).flat();
      return { events, state: serialize(state) };
    };
    expect(run()).toEqual(run());
  });

  it('continues identically after a save and load', () => {
    const a = createRun(ONE, 3);
    addMonster(a, 150);
    for (let i = 0; i < 7; i++) step(a, []);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 7; i++) expect(step(b, [])).toEqual(step(a, []));
    expect(serialize(b)).toBe(serialize(a));
  });
});

describe('commands', () => {
  it('rejects unknown and malformed commands with an event, not a throw', () => {
    const state = createRun(ONE, 1);
    const before = serialize(state);
    const bad = [{ type: 'teleport' }, null, 'retreat', { type: 'playerAction', actor: 99, action: { id: 'wait' } }];
    const events = step(state, bad as unknown as Command[]).filter((e) => e.type === 'commandRejected');
    expect(events).toEqual([
      { type: 'commandRejected', command: 'teleport', reason: 'Unknown command type "teleport"', turn: 0 },
      { type: 'commandRejected', command: '?', reason: 'Not a command object', turn: 0 },
      { type: 'commandRejected', command: '?', reason: 'Not a command object', turn: 0 },
      { type: 'commandRejected', command: 'playerAction', reason: 'No entity 99', turn: 0 },
    ]);
    // Only the step's own turn changed the state.
    const replay = deserialize(before);
    step(replay, []);
    expect(serialize(state)).toBe(serialize(replay));
  });

  it('rejects a player action for a non-actor or an unknown action', () => {
    const state = createRun(ONE, 1);
    const stairs = state.floors.d1?.entities.find((id) => getEntity(state, id).feature !== undefined) as EntityId;
    const hero = state.party[0] as EntityId;
    const events = step(state, [
      { type: 'playerAction', actor: stairs, action: { id: 'wait' } },
      { type: 'playerAction', actor: hero, action: { id: 'fly' } } as unknown as Command,
    ]);
    expect(events.filter((e) => e.type === 'commandRejected').map((e) => 'reason' in e && e.reason)).toEqual([
      `Entity ${stairs} cannot act`,
      'Unknown action "fly"',
    ]);
    expect(getEntity(state, hero).actor?.queued).toBeUndefined();
  });

  it('runs a queued player action in place of the next decision', () => {
    const state = createRun(ONE, 1);
    const hero = state.party[0] as EntityId;
    let decisions = 0;
    const decide: Decide = () => {
      decisions++;
      return { id: 'wait' };
    };
    const events = step(state, [{ type: 'playerAction', actor: hero, action: { id: 'wait' } }], { decide });
    expect(actors(events)).toEqual([hero]);
    expect(decisions).toBe(0);
    expect(getEntity(state, hero).actor?.queued).toBeUndefined();

    step(state, [], { decide });
    expect(decisions).toBe(1);
  });
});
