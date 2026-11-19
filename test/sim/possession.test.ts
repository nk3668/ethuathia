/**
 * Possession (ETH-066): `possess` / `release`, the step holding for the player's command, bump
 * moves and attacks, the `player` trace, serializing a possessed run, and the paced runner
 * answering a command at once.
 */
import { describe, expect, it } from 'vitest';
import {
  bumpTarget,
  createRun,
  deserialize,
  getEntity,
  PacedRunner,
  placeItem,
  serialize,
  snapshot,
  spawnMonster,
  step,
} from '../../src/sim';
import type { ActionRequest, ActorEntity, Command, EntityId, HostUpdate, RunState, SimEvent } from '../../src/sim';

//   x 0123456789
// y 0 ##########
//   1 #@......>#
//   2 #........#
//   3 #...+....#
//   4 ##########
const ROOM = ['##########', '#@......>#', '#........#', '#...+....#', '##########'];

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ALLY = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

const E = { x: 1, y: 0 };

function setup(party = [HERO], seed = 7): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party, depth: 2, floorText: ROOM, monsters: false }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const possess = (actor: EntityId): Command => ({ type: 'possess', actor });
const release = (actor: EntityId): Command => ({ type: 'release', actor });
const act = (actor: EntityId, action: ActionRequest): Command => ({ type: 'playerAction', actor, action });
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe('possess and release', () => {
  it('holds the run at a possessed adventurer’s turn until a command arrives', () => {
    const { state, hero } = setup();
    const events = step(state, [possess(hero.id)]);
    expect(ofType(events, 'possessed')).toMatchObject([{ actor: hero.id }]);
    expect(hero.ai?.possessed).toBe(true);
    const turn = state.turn;
    const pos = { ...hero.pos };
    // Nothing happens however many steps run: the run waits for the player.
    for (let i = 0; i < 5; i++) expect(step(state, []).filter((e) => e.type !== 'runStarted')).toEqual([]);
    expect(state.turn).toBe(turn);
    expect(hero.pos).toEqual(pos);
  });

  it('carries out the command, traces it as the player’s, then holds again', () => {
    const { state, hero } = setup();
    step(state, [possess(hero.id)]);
    const events = step(state, [act(hero.id, { id: 'bump', dir: E })]);
    expect(ofType(events, 'moved')).toMatchObject([{ actor: hero.id, to: { x: 2, y: 1 } }]);
    expect(ofType(events, 'ruleFired')).toMatchObject([
      { actor: hero.id, rule: { set: 'player', index: 0 }, condition: 'player', action: 'bump', detail: 'Your command: step east' },
    ]);
    expect(hero.ai?.memory.intent).toMatchObject({ rule: { set: 'player' }, detail: 'Your command: step east' });
    const turn = state.turn;
    step(state, []);
    step(state, []);
    expect(hero.pos).toEqual({ x: 2, y: 1 });
    expect(state.turn).toBe(turn + 1);
  });

  it('hands control back to the AI the same turn it is released', () => {
    const { state, hero } = setup();
    step(state, [possess(hero.id)]);
    step(state, []);
    const events = step(state, [release(hero.id)]);
    expect(ofType(events, 'released')).toMatchObject([{ actor: hero.id }]);
    expect(hero.ai?.possessed).toBeUndefined();
    expect(ofType(events, 'ruleFired')).toMatchObject([{ actor: hero.id, rule: { set: 'baseline' } }]);
  });

  it('never counts a possessed adventurer’s waiting toward stuck detection', () => {
    const { state, hero } = setup([HERO, ALLY]);
    step(state, [possess(hero.id)]);
    const events: SimEvent[] = [];
    for (let i = 0; i < 80; i++) {
      events.push(...step(state, []));
      events.push(...step(state, [act(hero.id, { id: 'wait' })]));
    }
    expect(ofType(events, 'stuck').filter((e) => e.actor === hero.id)).toEqual([]);
    expect(hero.ai?.memory.waited).toBe(0);
    expect(hero.ai?.possessed).toBe(true);
  });

  it('possesses one adventurer at a time and lets the others keep to the AI', () => {
    const { state, hero } = setup([HERO, ALLY]);
    const ally = state.party[1] as EntityId;
    step(state, [possess(hero.id)]);
    const events = step(state, [possess(ally)]);
    expect(events.filter((e) => e.type === 'possessed' || e.type === 'released').map((e) => e.type)).toEqual(['released', 'possessed']);
    expect(hero.ai?.possessed).toBeUndefined();
    expect(getEntity(state, ally)?.ai?.possessed).toBe(true);
  });

  it('rejects possessing a stranger, a monster or the dead, and releasing someone not possessed', () => {
    const { state, hero } = setup();
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 5, y: 2 });
    const rejected = (command: Command) => ofType(step(state, [command]), 'commandRejected');
    expect(rejected(possess(9999))).toHaveLength(1);
    expect(rejected(possess(toad.id))).toHaveLength(1);
    expect(rejected(release(hero.id))).toHaveLength(1);
    hero.actor.hp = 0;
    expect(rejected(possess(hero.id))).toHaveLength(1);
  });

  it('survives serialize: a possessed run carries on the same after a reload', () => {
    const { state, hero } = setup();
    step(state, [possess(hero.id)]);
    step(state, [act(hero.id, { id: 'bump', dir: E })]);
    const copy = deserialize(serialize(state));
    expect(copy.entities[hero.id]?.ai?.possessed).toBe(true);
    const commands = [act(hero.id, { id: 'bump', dir: E })];
    expect(step(copy, commands)).toEqual(step(state, commands));
    expect(serialize(copy)).toBe(serialize(state));
  });
});

describe('player actions while possessed', () => {
  it('bumps into an enemy to attack it, into a closed door to open it, and into an ally to swap', () => {
    const { state, hero } = setup([HERO, ALLY]);
    const ally = getEntity(state, state.party[1] as EntityId) as ActorEntity;
    step(state, [possess(hero.id)]);
    // A door: stand north of it.
    hero.pos = { x: 4, y: 2 };
    expect(bumpTarget({ state, actor: hero }, { x: 0, y: 1 })).toMatchObject({ id: 'openDoor' });
    // An ally next to the hero.
    ally.pos = { x: 5, y: 2 };
    expect(bumpTarget({ state, actor: hero }, E)).toMatchObject({ id: 'swap' });
    // An enemy.
    spawnMonster(state, 'monster.mire_toad', 'd1', { x: 3, y: 2 });
    expect(bumpTarget({ state, actor: hero }, { x: -1, y: 0 })).toMatchObject({ id: 'attack' });
    const events = step(state, [act(hero.id, { id: 'bump', dir: { x: -1, y: 0 } })]);
    expect(ofType(events, 'ruleFired').find((e) => e.actor === hero.id)?.detail).toBe('Your command: attack west');
    expect(events.some((e) => e.type === 'attacked' && e.actor === hero.id)).toBe(true);
    // A wall says why.
    hero.pos = { x: 1, y: 1 };
    expect(bumpTarget({ state, actor: hero }, { x: 0, y: -1 })).toBe('A wall is in the way');
  });

  it('picks up, equips and unequips, and takes the stairs down', () => {
    const { state, hero } = setup();
    step(state, [possess(hero.id)]);
    placeItem(state, 'd1', hero.pos, { def: 'item.iron_cap', qty: 1 });
    let events = step(state, [act(hero.id, { id: 'pickup' })]);
    expect(ofType(events, 'pickedUp')).toMatchObject([{ actor: hero.id, item: 'item.iron_cap' }]);
    const index = hero.inventory?.items.findIndex((i) => i.def === 'item.iron_cap') ?? -1;
    events = step(state, [act(hero.id, { id: 'equip', index })]);
    expect(ofType(events, 'equipped')).toMatchObject([{ actor: hero.id, item: 'item.iron_cap' }]);
    events = step(state, [act(hero.id, { id: 'unequip', slot: 'head' })]);
    expect(ofType(events, 'unequipped')).toMatchObject([{ actor: hero.id, item: 'item.iron_cap' }]);
    hero.pos = { x: 8, y: 1 };
    events = step(state, [act(hero.id, { id: 'stairs', dir: 'down' })]);
    expect(ofType(events, 'tookStairs')).toMatchObject([{ actor: hero.id, dir: 'down' }]);
    expect(ofType(events, 'ruleFired')[0]?.detail).toBe('Your command: take the stairs down');
  });

  it('fails a command that can’t be done and holds again for the next', () => {
    const { state, hero } = setup();
    step(state, [possess(hero.id)]);
    const events = step(state, [act(hero.id, { id: 'bump', dir: { x: 0, y: -1 } })]);
    expect(ofType(events, 'actionFailed')).toMatchObject([{ actor: hero.id, action: 'bump', reason: 'A wall is in the way' }]);
    expect(step(state, []).filter((e) => e.type !== 'runStarted')).toEqual([]);
  });

  it('shows who is possessed and who is waiting for a command in the snapshot', () => {
    const { state, hero } = setup([HERO, ALLY]);
    step(state, [possess(hero.id)]);
    const [mine, theirs] = snapshot(state).party;
    expect(mine).toMatchObject({ possessed: true, awaitingInput: true });
    expect(theirs).toMatchObject({ possessed: false, awaitingInput: false });
    hero.actor.queued = { id: 'wait' };
    expect(snapshot(state).party[0]).toMatchObject({ possessed: true, awaitingInput: false });
  });
});

describe('the paced runner while possessed', () => {
  it('stops stepping while it waits, and answers a command at once even when paused', () => {
    let now = 0;
    const updates: HostUpdate[] = [];
    const runner = new PacedRunner((u) => updates.push(u), () => now);
    runner.start({ party: [HERO], depth: 2, floorText: ROOM, monsters: false }, 7);
    const hero = updates[0]?.snapshot.party[0]?.id as EntityId;
    runner.send(possess(hero));
    runner.setSpeed(1);
    now += 1000;
    runner.pump();
    now += 1000;
    // Waiting for the player: nothing more to do until a message arrives.
    expect(runner.pump()).toBeNull();
    const last = updates.at(-1)?.snapshot;
    expect(last?.party[0]).toMatchObject({ possessed: true, awaitingInput: true, pos: { x: 1, y: 1 } });

    runner.setSpeed(0);
    const before = updates.length;
    runner.send(act(hero, { id: 'bump', dir: E }));
    expect(updates.length).toBe(before + 1);
    expect(updates.at(-1)?.snapshot.party[0]).toMatchObject({ awaitingInput: true, pos: { x: 2, y: 1 } });
  });
});
