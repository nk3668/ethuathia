/**
 * Breaking the flee/return loop (ETH-189): a hurt adventurer that keeps fleeing a foe standing
 * between it and the ground it wants to explore rests after a few flights instead of walking
 * back for ever, and stuck detection says so.
 */
import { describe, expect, it } from 'vitest';
import {
  checkInvariants,
  createRun,
  FLEE_BLOCK_RADIUS,
  FLEE_CYCLE_LIMIT,
  FLEE_REST_TURNS,
  FLEE_RELEASE_PERCENT,
  getEntity,
  getFloor,
  getMemory,
  spawnMonster,
  step,
} from '../../src/sim';
import type { AiActor, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const W = 40;
const wall = '#'.repeat(W);
const shaft = `${'#'.repeat(30)}.${'#'.repeat(W - 31)}`;
// A hall with the hero at the west end, a foe in the middle and an unlit shaft to the east.
const HALL = [wall, `#${'.'.repeat(4)}@${'.'.repeat(W - 7)}#`, shaft, shaft, wall];

/** A hurt hero and a bolt-throwing foe that never moves or fires, between the hero and the shaft. */
function setup(): { state: RunState; hero: AiActor; maxHp: number; foeX: number } {
  const state = createRun({ party: [HERO], floorText: HALL, depth: 1, monsters: false }, 1);
  const hero = getEntity(state, state.party[0] as number) as AiActor;
  const terrain = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
  for (let y = 2; y < 4; y++) memory[y * W + 30] = 0;
  const foeX = 20;
  const foe = spawnMonster(state, 'monster.tarn_spitter', 'd1', { x: foeX, y: 1 }) as AiActor;
  foe.ai.rules = [];
  const maxHp = hero.actor.hp;
  hero.actor.hp = Math.round(maxHp * 0.2);
  return { state, hero, maxHp, foeX };
}

type Stuck = Extract<SimEvent, { type: 'stuck' }>;
type RuleFired = Extract<SimEvent, { type: 'ruleFired' }>;

describe('flee/return cycle (ETH-189)', () => {
  it('rests after repeated flights instead of walking back toward the foe', () => {
    const { state, hero, maxHp, foeX } = setup();
    const stuck: Stuck[] = [];
    const fired: RuleFired[] = [];
    let fledStarts = 0;
    let wasFleeing = false;
    let restingFrom: number | null = null;
    let closest = 0;
    for (let i = 0; i < 1500; i++) {
      for (const e of step(state, [])) {
        if (e.type === 'stuck') stuck.push(e);
        if (e.type === 'ruleFired' && e.actor === hero.id) fired.push(e);
      }
      const fleeing = hero.ai.memory.fleeing !== null;
      if (fleeing && !wasFleeing) fledStarts++;
      wasFleeing = fleeing;
      if (stuck.length > 0 && restingFrom === null) restingFrom = state.turn;
      if (restingFrom !== null && state.turn - restingFrom > 20) closest = Math.max(closest, hero.pos.x);
      if (hero.actor.hp >= (maxHp * FLEE_RELEASE_PERCENT) / 100) break;
    }
    // Stuck detection noticed the cycle, once, after the limit's worth of flights, and said what it did.
    expect(stuck).toHaveLength(1);
    const found = stuck[0] as Stuck;
    expect(found.action).toBe('act.rest');
    expect(found.detail).toContain(`${FLEE_CYCLE_LIMIT} times`);
    expect(found.detail).toContain('Resting');
    expect(fledStarts).toBe(FLEE_CYCLE_LIMIT);
    // The trace names the rest, and the hero stays well short of the foe until it has recovered.
    expect(fired.some((f) => f.action === 'act.rest' && f.detail.includes('resting to recover'))).toBe(true);
    expect(hero.actor.hp).toBeGreaterThanOrEqual((maxHp * FLEE_RELEASE_PERCENT) / 100);
    expect(closest).toBeLessThan(foeX - 5);
    // Recovering ends the cycle.
    step(state, []);
    expect(hero.ai.memory.fleeCycle).toBeUndefined();
    expect(checkInvariants(state)).toEqual([]);
  });

  it('keeps the rest bounded when HP will not come back', () => {
    const { state, hero } = setup();
    let until: number | null = null;
    for (let i = 0; i < 600 && until === null; i++) {
      step(state, []);
      until = hero.ai.memory.fleeCycle?.restUntil ?? null;
    }
    expect(until).not.toBeNull();
    expect((until as number) - state.turn).toBeLessThanOrEqual(FLEE_REST_TURNS);
    // Pin HP low so the rest can only end by running out of turns.
    let rested = 0;
    let after = 0;
    for (let i = 0; i < FLEE_REST_TURNS + 40; i++) {
      hero.actor.hp = Math.max(1, hero.actor.hp > 5 ? 5 : hero.actor.hp);
      const before = state.turn;
      for (const e of step(state, [])) {
        if (e.type !== 'ruleFired' || e.actor !== hero.id) continue;
        if (e.action === 'act.rest') rested++;
        else if (before >= (until as number)) after++;
      }
    }
    expect(rested).toBeGreaterThan(0);
    // After the rest runs out the hero gets on with things (here, fleeing again) rather than resting for ever.
    expect(after).toBeGreaterThan(0);
  });

  it('a rest that ends, then another flight within the window, starts the next rest in the same cycle', () => {
    const { state, hero, maxHp, foeX } = setup();
    const rests: Stuck[] = [];
    const collect = (): void => {
      for (const e of step(state, [])) if (e.type === 'stuck' && e.detail.includes('Resting for')) rests.push(e);
    };
    for (let i = 0; i < 600 && rests.length === 0; i++) collect();
    expect(rests).toHaveLength(1);
    // The rest is cut short (a foe came into view), and the hero meets the foe again soon after.
    const cycle = hero.ai.memory.fleeCycle as NonNullable<typeof hero.ai.memory.fleeCycle>;
    cycle.restUntil = state.turn;
    hero.pos = { x: foeX - 6, y: 1 };
    hero.ai.memory.fleeing = null;
    for (let i = 0; i < 100 && rests.length < 2; i++) {
      hero.actor.hp = Math.round(maxHp * 0.2);
      collect();
    }
    expect(rests).toHaveLength(2);
    expect(hero.ai.memory.fleeCycle?.rests).toBe(2);
    expect(hero.ai.memory.fleeCycle?.episodes).toBeGreaterThan(FLEE_CYCLE_LIMIT);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('the rest of the party stays with a resting member instead of walking off', () => {
    const state = createRun({ party: [HERO, { ...HERO, name: 'Mira' }], floorText: HALL, depth: 1, monsters: false }, 1);
    const [aId, bId] = state.party as [number, number];
    const a = getEntity(state, aId) as AiActor;
    const b = getEntity(state, bId) as AiActor;
    const terrain = getFloor(state, 'd1').terrain.cells;
    const memory = getMemory(state, 'd1').terrain.cells;
    for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
    for (let y = 2; y < 4; y++) memory[y * W + 30] = 0;
    a.actor.hp = Math.round(a.actor.hp * 0.3);
    a.ai.memory.fleeCycle = { episodes: 3, last: 0, pos: { ...a.pos }, restUntil: 400, rests: 1 };
    // The healthy one starts well away, with ground to explore.
    b.pos = { x: a.pos.x + 14, y: a.pos.y };
    const start = { ...a.pos };
    const fired: string[] = [];
    for (let i = 0; i < 80; i++) {
      for (const e of step(state, [])) if (e.type === 'ruleFired' && e.actor === bId) fired.push(e.detail);
    }
    expect(a.ai.memory.intent?.action).toBe('act.rest');
    expect(a.pos).toEqual(start);
    expect(Math.max(Math.abs(b.pos.x - a.pos.x), Math.abs(b.pos.y - a.pos.y))).toBeLessThanOrEqual(3);
    expect(b.ai.memory.intent?.action).toBe('act.wait_for_ally');
    expect(fired.some((d) => d.includes('going back to Mira') === false && d.includes('resting'))).toBe(true);
    expect(fired.some((d) => d.includes('waiting for'))).toBe(true);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('never sends the party home: a hopeless cycle blocks the foe\'s area instead, with one log line', () => {
    const { state, hero, foeX } = setup();
    const stuck: Stuck[] = [];
    let nearest = 0;
    for (let i = 0; i < 2500; i++) {
      // The foe's ground is the only way on, and HP never comes back: the cycle is hopeless.
      if (hero.actor.hp > 8) hero.actor.hp = 8;
      for (const e of step(state, [])) if (e.type === 'stuck') stuck.push(e);
      if (hero.ai.memory.fleeCycle?.blocked !== undefined) nearest = Math.max(nearest, hero.pos.x);
    }
    const blocked = hero.ai.memory.fleeCycle?.blocked;
    expect(blocked).toBeDefined();
    expect(stuck.filter((s) => s.detail.includes("Can't get past"))).toHaveLength(1);
    expect(stuck.find((s) => s.detail.includes("Can't get past"))?.detail).toContain('Fall back');
    // It keeps out of the zone, and nothing turned the party back.
    expect(nearest).toBeLessThan(foeX - FLEE_BLOCK_RADIUS + 1);
    expect(state.domains.run.leaving).toBeNull();
    expect(checkInvariants(state)).toEqual([]);
  });
});
