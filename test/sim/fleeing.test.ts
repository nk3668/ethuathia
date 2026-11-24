/**
 * Smarter fleeing (ETH-148): only real threats make an adventurer flee, fleeing has hysteresis
 * (it goes on until HP recovers or the coast has been clear for a while), and a wounded adventurer
 * with no healing doesn't walk back past where it last saw a threat.
 */
import { describe, expect, it } from 'vitest';
import {
  AVOID_RADIUS,
  BASELINE_FLEE_PERCENT,
  checkInvariants,
  chooseRule,
  CONDITIONS,
  createRun,
  deserialize,
  FLEE_CALM_TURNS,
  FLEE_HOLD_TURNS,
  FLEE_RELEASE_PERCENT,
  getEntity,
  getFloor,
  getMemory,
  isThreat,
  perceive,
  serialize,
  spawnMonster,
  step,
  THREAT_MEMORY_TURNS,
} from '../../src/sim';
import type { ActorEntity, AiActor, Rule, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

/** Monsters that stand where they are put: no rules, so they never move or attack. */
const still = (state: RunState, def: string, x: number, y: number, overlay?: { templates: string[] }): ActorEntity => {
  const m = spawnMonster(state, def, 'd1', { x, y }, overlay) as AiActor;
  m.ai.rules = [];
  return m;
};

const hold = (): Rule[] => [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];

type RuleFired = Extract<SimEvent, { type: 'ruleFired' }>;
const fired = (events: SimEvent[]): RuleFired[] => events.filter((e): e is RuleFired => e.type === 'ruleFired');

const W = 40;
const wall = '#'.repeat(W);
const shaft = `${'#'.repeat(30)}.${'#'.repeat(W - 31)}`;
// A hall with the hero in the middle and an unlit shaft to the east: ground left to explore.
const HALL = [wall, `#${'.'.repeat(9)}@${'.'.repeat(W - 12)}#`, shaft, shaft, wall];

function hall(): { state: RunState; hero: AiActor; maxHp: number } {
  const state = createRun({ party: [HERO], floorText: HALL, depth: 1, monsters: false }, 1);
  const hero = getEntity(state, state.party[0] as number) as AiActor;
  const terrain = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
  for (let y = 2; y < 4; y++) memory[y * W + 30] = 0;
  return { state, hero, maxHp: hero.actor.hp };
}

const hpTo = (hero: ActorEntity, maxHp: number, percent: number): void => {
  hero.actor.hp = Math.max(1, Math.round((maxHp * percent) / 100));
};

/** Steps until the hero decides, and returns what it chose. */
function decide(state: RunState, hero: ActorEntity): RuleFired {
  for (let i = 0; i < 40; i++) {
    const f = fired(step(state, [])).find((e) => e.actor === hero.id);
    if (f !== undefined) return f;
  }
  throw new Error('the hero never decided');
}

describe('isThreat', () => {
  const { state } = hall();
  let nextX = 31;
  const kinds = (def: string) => isThreat(state, spawnMonster(state, def, 'd1', { x: nextX++, y: 1 }));

  it('is content-driven: chasers, bolt users and damage dealers are threats; a moss tender is not', () => {
    expect(kinds('monster.moss_tender')).toBe(false);
    expect(kinds('monster.pit_badger')).toBe(true);
  });

  it('counts casters (bolt), swarms and skirmishers even with a damage stat of 0', () => {
    for (const [i, def] of ['monster.mire_toad', 'monster.gloam_rat', 'monster.mossling'].entries()) {
      const m = spawnMonster(state, def, 'd1', { x: 25 + i * 2, y: 1 });
      expect(isThreat(state, m), def).toBe(true);
    }
  });

  it('counts a harmless monster given a damage bonus by its overlay', () => {
    const m = spawnMonster(state, 'monster.moss_tender', 'd1', { x: 20, y: 1 }, { stats: { add: { damage: 2 } } });
    expect(isThreat(state, m)).toBe(true);
  });

  it('counts adventurers', () => {
    const hero = getEntity(state, state.party[0] as number);
    expect(isThreat(state, hero)).toBe(true);
  });
});

describe('flee hysteresis', () => {
  it('keeps fleeing a pursuer between the start and release thresholds, then lets go', () => {
    const { state, hero, maxHp } = hall();
    still(state, 'monster.pit_badger', 16, 1);
    hpTo(hero, maxHp, BASELINE_FLEE_PERCENT - 5);
    const first = decide(state, hero);
    expect(first.action).toBe('act.flee');
    expect(hero.ai.memory.fleeing).not.toBeNull();

    // Above the start threshold but below the release one, with the pursuer still in sight: still fleeing.
    hpTo(hero, maxHp, BASELINE_FLEE_PERCENT + 10);
    for (let i = 0; i < 3; i++) {
      const next = decide(state, hero);
      expect(next.action).toBe('act.flee');
      expect(next.detail).toMatch(/still fleeing: the pit badger (in pursuit|last seen nearby), HP \d+%/);
      hpTo(hero, maxHp, BASELINE_FLEE_PERCENT + 10);
    }

    // Recovered: the memory clears and it is no longer fleeing.
    hpTo(hero, maxHp, FLEE_RELEASE_PERCENT + 5);
    const after = decide(state, hero);
    expect(after.action).not.toBe('act.flee');
    expect(hero.ai.memory.fleeing).toBeNull();
    expect(checkInvariants(state)).toEqual([]);
  });

  it('releases normally when nothing is pursuing: after FLEE_CALM_TURNS without a threat in sight', () => {
    const { state, hero, maxHp } = hall();
    hero.ai.rules = hold();
    hpTo(hero, maxHp, BASELINE_FLEE_PERCENT + 10);
    hero.ai.memory.fleeing = { since: state.turn, lastSeen: state.turn, held: 0 };
    for (let i = 0; i < FLEE_CALM_TURNS - 3; i++) step(state, []);
    expect(hero.ai.memory.fleeing).not.toBeNull();
    for (let i = 0; i < 10; i++) {
      step(state, []);
      hpTo(hero, maxHp, BASELINE_FLEE_PERCENT + 10);
    }
    expect(hero.ai.memory.fleeing).toBeNull();
  });

  it('cornered while fleeing it holds still instead of walking back toward the threat, then gives up', () => {
    const rows = ['##########', '#@.......#', '##########'];
    const state = createRun({ party: [HERO], floorText: rows, depth: 1, monsters: false }, 1);
    const hero = getEntity(state, state.party[0] as number) as AiActor;
    const terrain = getFloor(state, 'd1').terrain.cells;
    const memory = getMemory(state, 'd1').terrain.cells;
    for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
    still(state, 'monster.pit_badger', 6, 1);
    hpTo(hero, hero.actor.hp, BASELINE_FLEE_PERCENT + 10);
    hero.ai.memory.fleeing = { since: state.turn, lastSeen: state.turn, held: 0 };
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.hold_position');
    expect(choice?.detail).toMatch(/nowhere left to run/);
    for (let i = 0; i < FLEE_HOLD_TURNS + 3; i++) step(state, []);
    expect(hero.ai.memory.fleeing).toBeNull();
    expect(checkInvariants(state)).toEqual([]);
  });

  it('never starts without a threat in sight', () => {
    const { state, hero, maxHp } = hall();
    hero.ai.rules = hold();
    hpTo(hero, maxHp, BASELINE_FLEE_PERCENT - 10);
    step(state, []);
    expect(hero.ai.memory.fleeing).toBeNull();
  });

  it('survives a save mid-flee: the restored run plays out identically', () => {
    const { state, hero, maxHp } = hall();
    still(state, 'monster.pit_badger', 16, 1);
    hpTo(hero, maxHp, BASELINE_FLEE_PERCENT - 5);
    for (let i = 0; i < 4; i++) step(state, []);
    expect(hero.ai.memory.fleeing).not.toBeNull();
    expect(hero.ai.memory.threats.length).toBeGreaterThan(0);

    const copy = deserialize(serialize(state));
    const a: SimEvent[] = [];
    const b: SimEvent[] = [];
    for (let i = 0; i < 25; i++) {
      a.push(...step(state, []));
      b.push(...step(copy, []));
    }
    expect(b).toEqual(a);
    expect(serialize(copy)).toBe(serialize(state));
    expect(checkInvariants(copy)).toEqual([]);
  });
});

describe('harmless enemies', () => {
  it('a low-HP adventurer does not flee from a moss tender, and the trace says why', () => {
    const { state, hero, maxHp } = hall();
    still(state, 'monster.moss_tender', 15, 1);
    hpTo(hero, maxHp, 20);
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).not.toBe('act.flee');
    expect(choice?.skipped?.some((s) => /ignoring the moss tender: it can't hurt anyone/.test(s))).toBe(true);
  });

  it('does flee from a real threat at the same HP', () => {
    const { state, hero, maxHp } = hall();
    still(state, 'monster.pit_badger', 15, 1);
    hpTo(hero, maxHp, 20);
    expect(chooseRule({ state, actor: hero })?.action).toBe('act.flee');
  });

  it('does not start fleeing from a harmless monster in sight', () => {
    const { state, hero, maxHp } = hall();
    still(state, 'monster.moss_tender', 15, 1);
    hpTo(hero, maxHp, 20);
    step(state, []);
    expect(hero.ai.memory.fleeing).toBeNull();
  });

  it('cond.safe_to_test ignores a harmless monster in sight but not a threat', () => {
    const rows = [wall, `#${'.'.repeat(9)}@..>${'.'.repeat(W - 15)}#`, wall];
    const state = createRun({ party: [HERO], floorText: rows, depth: 1, monsters: false }, 1);
    const hero = getEntity(state, state.party[0] as number) as AiActor;
    hero.ai.rules = hold();
    hero.inventory = { items: [{ def: 'item.scroll_of_identify', qty: 1, identified: false }] };
    perceive(state, hero.id);
    // A known way out: stairs down three tiles east.
    (getMemory(state, 'd1').features as Record<number, unknown>)[W + 13] = { def: 'feature.stairs', feature: { kind: 'stairs', dir: 'down' } };
    const safe = () => CONDITIONS.get('cond.safe_to_test').evaluate({ state, actor: hero } as never, undefined).ok;
    const tender = still(state, 'monster.moss_tender', 15, 1);
    expect(safe()).toBe(true);
    tender.actor.hp = 0;
    still(state, 'monster.pit_badger', 16, 1);
    expect(safe()).toBe(false);
  });
});

describe('no walking back into danger', () => {
  // A ring: a short corridor along the top and a long way round along the bottom, both ending at
  // the east end, where the unexplored shaft is. The hero starts at the west end.
  const rows = [
    '####################.###',
    '#@...................###',
    '#.##################.###',
    '#.##################.###',
    '#.##################.###',
    '#....................###',
    '########################',
  ];
  function ring(): { state: RunState; hero: AiActor; maxHp: number } {
    const state = createRun({ party: [HERO], floorText: rows, depth: 1, monsters: false }, 1);
    const hero = getEntity(state, state.party[0] as number) as AiActor;
    const width = rows[0]?.length as number;
    const terrain = getFloor(state, 'd1').terrain.cells;
    const memory = getMemory(state, 'd1').terrain.cells;
    for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
    memory[0 * width + 20] = 0; // the shaft's far end is unseen
    return { state, hero, maxHp: hero.actor.hp };
  }
  const mark = (turn: number) => ({ id: 999, name: 'the crypt sentinel', floor: 'd1', pos: { x: 10, y: 1 }, seen: turn });
  const stepDir = (choice: ReturnType<typeof chooseRule>) => (choice?.request as { dir?: { x: number; y: number } } | undefined)?.dir;

  it('baseline: a healthy adventurer takes the short way along the top', () => {
    const { state, hero } = ring();
    hero.ai.memory.threats.push(mark(state.turn));
    expect(stepDir(chooseRule({ state, actor: hero }))).toEqual({ x: 1, y: 0 });
  });

  it('a wounded adventurer with no healing goes round the remembered threat, and the trace says so', () => {
    const { state, hero, maxHp } = ring();
    hpTo(hero, maxHp, 40);
    hero.ai.memory.threats.push(mark(state.turn));
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.explore');
    expect(stepDir(choice)).toEqual({ x: 0, y: 1 });
    expect(choice?.skipped?.some((s) => /avoiding the crypt sentinel's last position while wounded/.test(s))).toBe(true);
  });

  it('forgets after THREAT_MEMORY_TURNS, and ignores a threat on another floor or one that is far away', () => {
    const { state, hero, maxHp } = ring();
    hpTo(hero, maxHp, 40);
    hero.ai.memory.threats.push(mark(state.turn));
    state.turn += THREAT_MEMORY_TURNS + 1;
    expect(stepDir(chooseRule({ state, actor: hero }))).toEqual({ x: 1, y: 0 });
    hero.ai.memory.threats = [{ ...mark(state.turn), floor: 'd2' }];
    expect(stepDir(chooseRule({ state, actor: hero }))).toEqual({ x: 1, y: 0 });
    hero.ai.memory.threats = [{ ...mark(state.turn), pos: { x: 10 + AVOID_RADIUS + 20, y: 5 } }];
    expect(stepDir(chooseRule({ state, actor: hero }))).toEqual({ x: 1, y: 0 });
  });

  it('only while wounded: recovered past the release threshold it goes the short way again', () => {
    const { state, hero, maxHp } = ring();
    hpTo(hero, maxHp, FLEE_RELEASE_PERCENT + 5);
    hero.ai.memory.threats.push(mark(state.turn));
    expect(stepDir(chooseRule({ state, actor: hero }))).toEqual({ x: 1, y: 0 });
  });
});
