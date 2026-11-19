/**
 * Monster roles (ETH-040), on hand-built maps with fixed seeds: brutes close in and never run,
 * skirmishers strike and step back, casters bolt from range and back away, supports mend and spur
 * on their kin from behind, and swarms spread out around their prey. The hero is held in place
 * (a single wait rule) unless the test is about the party's answer to a caster.
 */
import { describe, expect, it } from 'vitest';
import { MONSTERS, monsterRules, MONSTER_ROLES, ROLE_INFO, ROLE_RULES } from '../../src/content';
import { checkGame, checkInvariants, createRun, getEntity, moveEntity, spawnMonster, step, validateAction } from '../../src/sim';
import type { ActorEntity, Entity, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

const ROOM = ['###########', '#.........#', '#.........#', '#.........#', '#.........#', '#.........#', '###########'];

/** ows with the hero's start (@) at t. */
function withHero(rows: readonly string[], at: { x: number; y: number }): string[] {
  return rows.map((row, y) => (y === at.y ? row.slice(0, at.x) + '@' + row.slice(at.x + 1) : row));
}

function setup(floorText: string[], seed = 1, hold = true): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText, depth: 1 }, seed);
  const hero = getEntity(state, state.party[0] as number) as ActorEntity;
  if (hold && hero.ai !== undefined) hero.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];
  return { state, hero };
}

/** Steps until `until` holds (checked after each step) or `max` steps; returns every event. */
function runUntil(state: RunState, max: number, until: () => boolean = () => false): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    all.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
    if (until()) break;
  }
  return all;
}

const intent = (e: Entity) => e.ai?.memory.intent?.action;
const dist = (a: Entity, b: Entity) => Math.max(Math.abs(a.pos.x - b.pos.x), Math.abs(a.pos.y - b.pos.y));
const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('role content', () => {
  it('gives every monster a role with Codex text, and covers every role', () => {
    expect(checkGame()).toEqual([]);
    for (const def of MONSTERS.all()) {
      expect(MONSTER_ROLES).toContain(def.role);
      expect(monsterRules(def)).toBe(def.rules ?? ROLE_RULES[def.role]);
    }
    for (const role of MONSTER_ROLES) {
      expect(ROLE_INFO[role].description.length).toBeGreaterThan(20);
      expect(MONSTERS.all().some((m) => m.role === role)).toBe(true);
    }
  });
});

describe('brute', () => {
  it('closes in and keeps fighting even when nearly dead', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 2, y: 3 }));
    const brute = spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 7, y: 3 }) as ActorEntity;
    runUntil(state, 80, () => dist(hero, brute) <= 1);
    expect(dist(hero, brute)).toBe(1);
    brute.actor.hp = 1;
    runUntil(state, 20, () => intent(brute) === 'act.attack_adjacent');
    expect(intent(brute)).toBe('act.attack_adjacent');
    expect(dist(hero, brute)).toBe(1);
  });
});

describe('skirmisher', () => {
  it('strikes, then steps back out of reach, then comes back', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 5, y: 3 }), 3);
    const hound = spawnMonster(state, 'monster.slate_hound', 'd1', { x: 8, y: 3 }) as ActorEntity;
    runUntil(state, 60, () => intent(hound) === 'act.attack_adjacent');
    expect(intent(hound)).toBe('act.attack_adjacent');
    runUntil(state, 20, () => intent(hound) !== 'act.attack_adjacent');
    expect(intent(hound)).toBe('act.fall_back');
    expect(dist(hero, hound)).toBeGreaterThanOrEqual(2);
    runUntil(state, 20, () => intent(hound) === 'act.attack_adjacent');
    expect(intent(hound)).toBe('act.attack_adjacent');
  });
});

describe('caster', () => {
  it('bolts from range without closing in, and backs away from anyone next to it', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 2, y: 3 }), 2);
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 5, y: 3 }) as ActorEntity;
    const events = runUntil(state, 40, () => intent(toad) === 'act.cast_bolt');
    expect(intent(toad)).toBe('act.cast_bolt');
    expect(toad.pos).toEqual({ x: 5, y: 3 });
    const shots = [...ofType(events, 'attacked'), ...ofType(events, 'missed')].filter((e) => e.actor === toad.id);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => e.ranged === true)).toBe(true);

    moveEntity(state, hero.id, 'd1', { x: 4, y: 3 });
    runUntil(state, 20, () => intent(toad) === 'act.fall_back');
    expect(intent(toad)).toBe('act.fall_back');
    expect(dist(hero, toad)).toBeGreaterThanOrEqual(2);
  });

  it('closes in only until in range when the target is farther', () => {
    const { state, hero } = setup(withHero(['##############', '#............#', '##############'], { x: 1, y: 1 }), 4);
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 8, y: 1 }) as ActorEntity;
    runUntil(state, 60, () => intent(toad) === 'act.cast_bolt');
    expect(intent(toad)).toBe('act.cast_bolt');
    expect(dist(hero, toad)).toBe(MONSTERS.get('monster.mire_toad').bolt?.range);
  });

  it('only casters may bolt, and only at an enemy in range', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 2, y: 3 }));
    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 4, y: 3 }) as ActorEntity;
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 8, y: 3 }) as ActorEntity;
    expect(validateAction(state, rat, { id: 'bolt', target: hero.id })).toMatch(/ranged attack/);
    expect(validateAction(state, toad, { id: 'bolt', target: hero.id })).toMatch(/out of sight or range/);
    expect(validateAction(state, toad, { id: 'bolt', target: rat.id })).toMatch(/no enemy/);
    moveEntity(state, toad.id, 'd1', { x: 6, y: 3 });
    expect(validateAction(state, toad, { id: 'bolt', target: hero.id })).toBeNull();
  });

  it('the party rushes a caster that has it in range', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 2, y: 3 }), 2, false);
    spawnMonster(state, 'monster.mire_toad', 'd1', { x: 6, y: 3 });
    const events = runUntil(state, 5);
    const fired = ofType(events, 'ruleFired').filter((e) => e.actor === hero.id);
    expect(fired[0]?.action).toBe('act.rush_caster');
  });
});

describe('support', () => {
  it('mends a hurt ally it can see', () => {
    const { state } = setup(withHero(ROOM, { x: 1, y: 1 }), 5);
    const kin = spawnMonster(state, 'monster.mossling', 'd1', { x: 7, y: 5 }) as ActorEntity;
    kin.actor.hp = 1;
    const tender = spawnMonster(state, 'monster.moss_tender', 'd1', { x: 9, y: 5 }) as ActorEntity;
    // Monsters don't recover on their own, so only mending raises the mossling's HP.
    const all = runUntil(state, 20, () => kin.actor.hp > 1);
    expect(ofType(all, 'aided')).toContainEqual(expect.objectContaining({ actor: tender.id, target: kin.id, power: 'mend' }));
    expect(ofType(all, 'healed').some((e) => e.actor === kin.id && e.source === 'monster.moss_tender')).toBe(true);
    expect(kin.actor.hp).toBeGreaterThan(1);
  });

  it('spurs on an ally in a fight and hangs back itself', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 2, y: 3 }), 6);
    const kin = spawnMonster(state, 'monster.mossling', 'd1', { x: 3, y: 3 }) as ActorEntity;
    const tender = spawnMonster(state, 'monster.moss_tender', 'd1', { x: 5, y: 3 }) as ActorEntity;
    const events = runUntil(state, 20, () => intent(tender) === 'act.bolster_ally');
    expect(intent(tender)).toBe('act.bolster_ally');
    expect(ofType(events, 'aided')).toContainEqual(expect.objectContaining({ actor: tender.id, target: kin.id, power: 'bolster' }));
    expect(kin.stats?.statuses.map((s) => s.status)).toContain('status.emboldened');
    // With nobody left to help, it keeps its distance instead of joining the fight.
    kin.actor.hp = MONSTERS.get('monster.mossling').stats.hp;
    runUntil(state, 10, () => intent(tender) === 'act.hang_back');
    expect(intent(tender)).toBe('act.hang_back');
    expect(dist(hero, tender)).toBeGreaterThanOrEqual(2);
  });

  it('only supports may aid, and only allies', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 1, y: 1 }));
    const kin = spawnMonster(state, 'monster.mossling', 'd1', { x: 5, y: 3 }) as ActorEntity;
    const tender = spawnMonster(state, 'monster.moss_tender', 'd1', { x: 6, y: 3 }) as ActorEntity;
    expect(validateAction(state, kin, { id: 'aid', target: tender.id, power: 'mend' })).toMatch(/Only creatures/);
    expect(validateAction(state, tender, { id: 'aid', target: hero.id, power: 'bolster' })).toMatch(/no ally/);
    expect(validateAction(state, tender, { id: 'aid', target: kin.id, power: 'mend' })).toMatch(/isn’t hurt/);
    expect(validateAction(state, tender, { id: 'aid', target: kin.id, power: 'bolster' })).toBeNull();
  });
});

describe('swarm', () => {
  it('spreads out around its prey instead of piling onto one side', () => {
    const { state, hero } = setup(withHero(ROOM, { x: 5, y: 3 }), 7);
    const swarm = [
      spawnMonster(state, 'monster.mossling', 'd1', { x: 8, y: 3 }),
      spawnMonster(state, 'monster.mossling', 'd1', { x: 8, y: 3 }),
      spawnMonster(state, 'monster.mossling', 'd1', { x: 8, y: 3 }),
    ] as ActorEntity[];
    runUntil(state, 60, () => swarm.every((m) => dist(m, hero) === 1));
    expect(swarm.every((m) => dist(m, hero) === 1)).toBe(true);
    // Each on its own tile around the hero, though mosslings may share one.
    expect(new Set(swarm.map((m) => `${m.pos.x},${m.pos.y}`)).size).toBe(3);
  });
});
