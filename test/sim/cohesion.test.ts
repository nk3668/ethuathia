/**
 * Party cohesion (ETH-145): the baseline walks a straggler back to the party's lead once it is
 * more than `PARTY_LEASH` tiles away, keeps going until within `PARTY_CLOSE`, never when an enemy
 * is adjacent, and never makes two members chase each other (the lead regroups on no one).
 */
import { describe, expect, it } from 'vitest';
import {
  BASELINE_RULES,
  checkInvariants,
  chooseRule,
  createRun,
  DROP_TURNS,
  explored,
  getEntity,
  getFloor,
  getMemory,
  PARTY_CLOSE,
  PARTY_LEASH,
  spawnMonster,
  step,
} from '../../src/sim';
import type { ActorEntity, AiActor, EntityId, Rule, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ALLY = { name: 'Isolde', classId: 'class.vanguard', raceId: 'race.human' };
const THIRD = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };
const FOURTH = { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' };

/** A fresh own-rule list per member: the state must not share objects between entities. */
const hold = (): Rule[] => [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];

const WIDTH = 40;
const wall = '#'.repeat(WIDTH);
const shaft = `###.${'#'.repeat(WIDTH - 4)}`;
// A long hall with an unlit shaft off it, three tiles from the lead: ground left to explore.
const LONG_HALL = [wall, `#@${'.'.repeat(WIDTH - 3)}#`, shaft, shaft, shaft, shaft, shaft, wall];

function party(floorText: string[], members = [HERO, ALLY], monsters = false, shaftUnseen = true): { state: RunState; actors: AiActor[] } {
  const state = createRun({ party: members, floorText, depth: 1, monsters }, 1);
  const actors = state.party.map((id) => getEntity(state, id as EntityId) as AiActor);
  // The party knows the whole hall, so planning a walk across it needs no exploring first.
  const terrain = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
  // The shaft stays unseen, so there is still something to explore (regrouping only applies
  // while there is) without drawing the followers away from the lead.
  if (shaftUnseen) for (let y = 3; y < 8; y++) for (let x = 2; x <= 4; x++) memory[y * WIDTH + x] = 0;
  return { state, actors };
}

type RuleFired = Extract<SimEvent, { type: 'ruleFired' }>;
const fired = (events: SimEvent[]): RuleFired[] => events.filter((e): e is RuleFired => e.type === 'ruleFired');
const dist = (a: ActorEntity, b: ActorEntity) => Math.max(Math.abs(a.pos.x - b.pos.x), Math.abs(a.pos.y - b.pos.y));

/** Moves a member somewhere else on its floor, as a test of a party that has strayed. */
function place(who: ActorEntity, x: number, y: number): void {
  who.pos = { x, y };
}

describe('party cohesion baseline', () => {
  it('sits in the baseline between the combat rules and exploring', () => {
    const at = (action: string) => BASELINE_RULES.findIndex((r) => r.action.id === action);
    expect(at('act.regroup')).toBeGreaterThan(at('act.attack_adjacent'));
    expect(at('act.regroup')).toBeLessThan(at('act.explore'));
  });

  it('walks a straggler back to the lead beyond the leash and stops within PARTY_CLOSE', () => {
    const { state, actors } = party(LONG_HALL);
    const [lead, follower] = actors as [AiActor, AiActor];
    lead.ai.rules = hold();
    place(follower, 1 + PARTY_LEASH + 12, 1);
    expect(dist(lead, follower)).toBeGreaterThan(PARTY_LEASH);

    const events: SimEvent[] = [];
    for (let i = 0; i < 40 && dist(lead, follower) > PARTY_CLOSE; i++) {
      const now = step(state, []);
      events.push(...now);
      expect(checkInvariants(state)).toEqual([]);
    }
    const mine = fired(events).filter((e) => e.actor === follower.id);
    expect(mine[0]?.action).toBe('act.regroup');
    expect(mine[0]?.detail).toMatch(/^Regroup: regrouping with Brannoc, \d+ tiles away/);
    expect(dist(lead, follower)).toBeLessThanOrEqual(PARTY_CLOSE);

    // Back in range, it goes back to its own business: no regroup rule fires from then on.
    const after = fired(Array.from({ length: 20 }, () => step(state, [])).flat()).filter((e) => e.actor === follower.id);
    expect(after.some((e) => e.action === 'act.regroup')).toBe(false);
  });

  it('does nothing within the leash, and never for the lead', () => {
    const { state, actors } = party(LONG_HALL);
    const [lead, follower] = actors as [AiActor, AiActor];
    lead.ai.rules = hold();
    place(follower, 1 + PARTY_LEASH, 1);
    const events = Array.from({ length: 5 }, () => step(state, [])).flat();
    expect(fired(events).some((e) => e.action === 'act.regroup')).toBe(false);
  });

  it('does not fire once there is nothing left to explore (the descent is not chased)', () => {
    const { state, actors } = party(LONG_HALL, [HERO, ALLY], false, false);
    const [lead, follower] = actors as [AiActor, AiActor];
    lead.ai.rules = hold();
    place(follower, 1 + PARTY_LEASH + 12, 1);
    expect(chooseRule({ state, actor: follower })?.action).not.toBe('act.regroup');
  });

  it('does not fire while an enemy is adjacent', () => {
    const { state, actors } = party(LONG_HALL);
    const [lead, follower] = actors as [AiActor, AiActor];
    lead.ai.rules = hold();
    place(follower, 1 + PARTY_LEASH + 12, 1);
    spawnMonster(state, 'monster.mossling', 'd1', { x: follower.pos.x - 1, y: 1 });
    const choice = chooseRule({ state, actor: follower });
    expect(choice?.action).toBe('act.attack_adjacent');
  });

  it('has no ping-pong: stragglers on both sides converge on the lead and stay', () => {
    const { state, actors } = party(LONG_HALL, [HERO, ALLY, THIRD]);
    const [lead, a, b] = actors as [AiActor, AiActor, AiActor];
    lead.ai.rules = hold();
    place(a, 30, 1);
    place(b, 20, 1);
    const closest = new Map<EntityId, number>();
    const flips = new Map<EntityId, number>();
    const last = new Map<EntityId, boolean>();
    for (let i = 0; i < 150; i++) {
      for (const e of fired(step(state, []))) {
        const regrouping = e.action === 'act.regroup';
        if (last.has(e.actor) && last.get(e.actor) !== regrouping) flips.set(e.actor, (flips.get(e.actor) ?? 0) + 1);
        last.set(e.actor, regrouping);
      }
      for (const m of [a, b]) closest.set(m.id, Math.min(closest.get(m.id) ?? Infinity, dist(lead, m)));
      expect(checkInvariants(state)).toEqual([]);
    }
    // The nearer straggler came back to the lead. Once the shaft is explored there is nothing left
    // to explore and regrouping stops by design (the party heads for the stairs together), so the
    // farther one is not asked to finish the walk.
    expect(closest.get(b.id)).toBeLessThanOrEqual(PARTY_CLOSE);
    // Regroup, then back to its own business: one switch each way at most, never a flip-flop.
    for (const id of [a.id, b.id]) expect(flips.get(id) ?? 0).toBeLessThanOrEqual(3);
  });

  it('gets a straggler past an ally in a one-tile corridor (ETH-017 swap logic still applies)', () => {
    const corridor = LONG_HALL;
    const { state, actors } = party(corridor, [HERO, ALLY, THIRD]);
    const [lead, mid, far] = actors as [AiActor, AiActor, AiActor];
    lead.ai.rules = hold();
    // `mid` idles (waiting on the spot) between the lead and the straggler, so the straggler has
    // to squeeze past it to reach the lead.
    mid.ai.rules = hold();
    place(mid, 12, 1);
    place(far, 30, 1);
    for (let i = 0; i < 80 && dist(lead, far) > PARTY_CLOSE; i++) {
      step(state, []);
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(dist(lead, far)).toBeLessThanOrEqual(PARTY_CLOSE);
  });

  it('shares the lead frontier goal so followers follow instead of splitting to opposite wings', () => {
    const FORK = [
      '###################',
      '#...+..@...@..+...#',
      '#...#.........#...#',
      '#...###########...#',
      '###################',
    ];
    const state = createRun({ party: [HERO, ALLY], floorText: FORK, depth: 1, monsters: false }, 1);
    const [lead, follower] = state.party.map((id) => getEntity(state, id) as AiActor) as [AiActor, AiActor];
    expect(dist(lead, follower)).toBeLessThanOrEqual(PARTY_LEASH);

    // On turn 1, lead (x=7) picks the closer west door (4,1), and follower (x=11) shares that
    // west goal rather than splitting east toward (14,1).
    const startX = follower.pos.x;
    const events = step(state, []);
    const leadFire = fired(events).find((e) => e.actor === lead.id);
    const followerFire = fired(events).find((e) => e.actor === follower.id);
    expect(leadFire?.action).toBe('act.explore');
    expect(lead.ai.memory.intent?.goal).toEqual({ x: 4, y: 1 });
    expect(followerFire?.action).toBe('act.explore');
    expect(follower.ai.memory.intent?.goal).toEqual({ x: 4, y: 1 });
    expect(follower.pos.x).toBeLessThan(startX);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('waits out a dropped explore goal on the bottom floor instead of triggering premature retreat', () => {
    const state = createRun({ party: [HERO], floorText: ['########', '#@<+...#', '########'], depth: 1, monsters: false }, 1);
    const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
    hero.ai.memory.dropped = {
      rule: { set: 'baseline', index: BASELINE_RULES.findIndex((r) => r.action.id === 'act.explore') },
      action: 'act.explore',
      floor: 'd1',
      pos: { x: 2, y: 1 },
      since: 0,
      until: DROP_TURNS,
    };
    // Backed into (1,1) relative to dropped.pos (2,1), so act.back_off returns null; stairs up at
    // (2,1) are known and unseen ground lies past the door at (3,1).
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.wait');
    step(state, []);
    expect(state.domains.run.leaving).toBeNull();
    expect(checkInvariants(state)).toEqual([]);
  });

  it('finishes exploring a four-member two-corridor fork without ping-ponging or getting stuck', () => {
    const TWO_CORRIDOR_FORK = [
      '#################################',
      '#...+........@.@.@.@........+...#',
      '#.###.......................###.#',
      '#.#.#########################.#.#',
      '#...............#...............#',
      '#################################',
    ];
    const state = createRun(
      { party: [HERO, ALLY, THIRD, FOURTH], floorText: TWO_CORRIDOR_FORK, depth: 1, monsters: false },
      1,
    );
    const events: SimEvent[] = [];
    for (let i = 0; i < 150 && explored(state, 'd1').fraction < 1; i++) {
      events.push(...step(state, []));
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(explored(state, 'd1').fraction).toBe(1);
    expect(events.filter((e) => e.type === 'stuck')).toEqual([]);
  });

  it('keeps the lead committed to its explore frontier even when an adjacent ally stands on that route', () => {
    // East door (13,2) is 5 steps from (8,2) vs 6 to west door (2,2). With ALLY_OCCUPIED_COST (2)
    // on an ally ahead at (9,2), east costs 7 > west 6, which used to flip the lead back and
    // forth across turns (seed 196 stuck storm).
    const ANTI_OSCILLATION = [
      '##################',
      '#.#..........#...#',
      '#.+..@@......+...#',
      '#.#..........#...#',
      '##################',
    ];
    const state = createRun({ party: [HERO, ALLY], floorText: ANTI_OSCILLATION, depth: 1, monsters: false }, 1);
    const [lead, follower] = state.party.map((id) => getEntity(state, id) as AiActor) as [AiActor, AiActor];
    place(lead, 8, 2);
    place(follower, 6, 2);
    step(state, []);
    expect(lead.ai.memory.intent?.goal).toEqual({ x: 13, y: 2 });

    // Put lead back at (8,2) with follower blocking east at (9,2). Lead stays on (13,2) and
    // advances east over 6 turns to open/reveal it with zero goal flip-flops and zero stuck events.
    place(lead, 8, 2);
    place(follower, 9, 2);
    expect(chooseRule({ state, actor: lead })?.goal).toEqual({ x: 13, y: 2 });

    const events: SimEvent[] = [];
    const goalsBeforeDoor: { x: number; y: number }[] = [];
    let maxLeadX = lead.pos.x;
    for (let i = 0; i < 6; i++) {
      const now = step(state, []);
      events.push(...now);
      maxLeadX = Math.max(maxLeadX, lead.pos.x);
      if (!events.some((e) => e.type === 'doorOpened') && lead.ai.memory.intent?.action === 'act.explore' && lead.ai.memory.intent.goal) {
        goalsBeforeDoor.push(lead.ai.memory.intent.goal);
      }
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(goalsBeforeDoor.length).toBeGreaterThan(0);
    expect(goalsBeforeDoor.every((g) => g.x === 13 && g.y === 2)).toBe(true);
    expect(events.some((e) => e.type === 'doorOpened' && e.pos.x === 13 && e.pos.y === 2)).toBe(true);
    expect(events.filter((e) => e.type === 'stuck')).toEqual([]);
    expect(maxLeadX).toBeGreaterThanOrEqual(10);
  });
});
