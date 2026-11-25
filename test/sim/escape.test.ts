/**
 * Smarter escape direction (ETH-154): a fleeing adventurer breaks ties between equal escapes
 * toward a living ally, then toward the stairs up; and a wounded adventurer with no healing whose
 * every way forward is near a remembered threat heads home instead of walking past it.
 */
import { describe, expect, it } from 'vitest';
import { checkInvariants, chooseRule, createRun, FLEE_RELEASE_PERCENT, getEntity, getFloor, getMemory, isWounded, spawnMonster, step } from '../../src/sim';
import type { ActorEntity, AiActor, EntityId, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ALLY = { name: 'Isolde', classId: 'class.vanguard', raceId: 'race.human' };

const still = (state: RunState, def: string, x: number, y: number): ActorEntity => {
  const m = spawnMonster(state, def, 'd1', { x, y }) as AiActor;
  m.ai.rules = [];
  return m;
};

/** The party knows all the floor's terrain and features. */
function know(state: RunState): void {
  const floor = getFloor(state, 'd1');
  const memory = getMemory(state, 'd1');
  for (let i = 0; i < floor.terrain.cells.length; i++) memory.terrain.cells[i] = (floor.terrain.cells[i] as number) + 1;
  const { width } = floor.terrain;
  for (const id of floor.entities) {
    const e = getEntity(state, id);
    if (e.feature !== undefined) memory.features[e.pos.y * width + e.pos.x] = { def: e.def, feature: structuredClone(e.feature) };
  }
}

const hpTo = (a: ActorEntity, percent: number): void => {
  a.actor.hp = Math.max(1, Math.round((a.actor.hp * percent) / 100));
};

// An open room, the hero in the middle and a badger to its east: west, north-west and south-west are equal escapes.
const ROOM = [
  '#'.repeat(15),
  ...Array.from({ length: 9 }, (_, y) => (y === 4 ? `#${'.'.repeat(6)}@${'.'.repeat(6)}#` : `#${'.'.repeat(13)}#`)),
  '#'.repeat(15),
];

function room(allies: boolean): { state: RunState; hero: AiActor; ally: AiActor | null } {
  const state = createRun({ party: allies ? [HERO, ALLY] : [HERO], floorText: ROOM, depth: 1, monsters: false }, 1);
  know(state);
  const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
  const ally = allies ? (getEntity(state, state.party[1] as EntityId) as AiActor) : null;
  still(state, 'monster.pit_badger', hero.pos.x + 3, hero.pos.y);
  hpTo(hero, 20);
  return { state, hero, ally };
}

describe('escape direction', () => {
  it('flees toward an ally when two escapes are otherwise equal', () => {
    for (const side of [-1, 1]) {
      const { state, hero, ally } = room(true);
      (ally as AiActor).pos = { x: 5, y: hero.pos.y + side * 4 };
      const choice = chooseRule({ state, actor: hero });
      expect(choice?.action).toBe('act.flee');
      expect(choice?.request).toMatchObject({ id: 'flee' });
      const dir = (choice?.request as { dir: { x: number; y: number } }).dir;
      expect(Math.sign(dir.y)).toBe(side);
      expect(choice?.detail).toContain('fleeing toward Isolde');
    }
  });

  it('flees toward the stairs up when there is no ally to go to', () => {
    for (const side of [-1, 1]) {
      const rows = [...ROOM];
      const sy = 5 + side * 3;
      rows[sy] = `${rows[sy]?.slice(0, 5)}<${rows[sy]?.slice(6)}`;
      const state = createRun({ party: [HERO], floorText: rows, depth: 1, monsters: false }, 1);
      know(state);
      const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
      still(state, 'monster.pit_badger', 10, 5);
      hpTo(hero, 20);
      const choice = chooseRule({ state, actor: hero });
      expect(choice?.action).toBe('act.flee');
      const dir = (choice?.request as { dir: { x: number; y: number } }).dir;
      expect(Math.sign(dir.y)).toBe(side);
      expect(choice?.detail).toContain('fleeing toward the stairs up');
    }
  });

  it('never gives up a clearly better escape to reach an ally', () => {
    const { state, hero, ally } = room(true);
    // The ally stands east, behind the badger: the only good way out is west.
    (ally as AiActor).pos = { x: 12, y: hero.pos.y };
    const choice = chooseRule({ state, actor: hero });
    const dir = (choice?.request as { dir: { x: number; y: number } }).dir;
    expect(dir.x).toBeLessThan(0);
    expect(choice?.detail).not.toContain('fleeing toward');
  });
});

// A hall with the hero in the middle, stairs up at the west end and an unlit shaft to the east.
const W = 40;
const wall = '#'.repeat(W);
const shaft = `${'#'.repeat(30)}.${'#'.repeat(W - 31)}`;
const HALL = [wall, `#<${'.'.repeat(8)}@${'.'.repeat(W - 12)}#`, shaft, shaft, wall];

function hall(): { state: RunState; hero: AiActor } {
  const state = createRun({ party: [HERO], floorText: HALL, depth: 1, monsters: false }, 1);
  const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
  know(state);
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let y = 2; y < 4; y++) memory[y * W + 30] = 0;
  return { state, hero };
}

/** The hero remembers a badger guarding the shaft, which is the only ground left to explore. */
function guardShaft(state: RunState, hero: AiActor): void {
  const badger = still(state, 'monster.pit_badger', 29, 1);
  hero.ai.memory.threats = [{ id: badger.id, name: 'the pit badger', floor: 'd1', pos: { x: 29, y: 1 }, seen: state.turn }];
}

describe('boxed in', () => {
  it('a wounded adventurer with no healing and a threat on every way forward heads home', () => {
    const { state, hero } = hall();
    guardShaft(state, hero);
    hpTo(hero, FLEE_RELEASE_PERCENT - 20);
    expect(isWounded(state, hero)).toBe(true);
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.retreat_run');
    expect(choice?.detail).toContain('heading home: wounded, no healing, threats on every way forward');
    // It is the whole party's retreat: the run turns back when the rule fires.
    for (let i = 0; i < 5; i++) step(state, []);
    expect(state.domains.run.leaving).not.toBeNull();
    expect(checkInvariants(state)).toEqual([]);
  });

  it('a healthy adventurer in the same spot goes on exploring', () => {
    const { state, hero } = hall();
    guardShaft(state, hero);
    expect(isWounded(state, hero)).toBe(false);
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).not.toBe('act.retreat_run');
    expect(choice?.condition).not.toBe('cond.boxed_in');
  });

  it('a wounded adventurer with a safe way forward does not turn back', () => {
    const { state, hero } = hall();
    guardShaft(state, hero);
    // Unexplored ground in the far west too, well away from the badger.
    const memory = getMemory(state, 'd1').terrain.cells;
    memory[1 * W + 1] = 0;
    memory[1 * W + 2] = 0;
    hpTo(hero, FLEE_RELEASE_PERCENT - 20);
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.condition).not.toBe('cond.boxed_in');
  });
});
