/**
 * The habits (ETH-194) on hand-built maps with fixed seeds: each habit doing its thing and
 * saying so in the trace, each habit staying out of the way when it has nothing to act on, habit
 * slots and exclusive pairs refused by `setTactics` and `createRun`, the healing-threshold habits
 * moving the baseline's quaff line, and that Curious decides the same whatever an unidentified
 * potion hides (docs/ARCHITECTURE.md §11.6).
 */
import { describe, expect, it } from 'vitest';
import { TACTICS, tacticsOn } from '../../src/content';
import type { TacticPicks } from '../../src/sim';
import {
  checkGame,
  checkInvariants,
  chooseRule,
  createRun,
  getEntity,
  getFloor,
  getMemory,
  moveEntity,
  placeItem,
  spawnMonster,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActorEntity, AdventurerConfig, AiActor, EntityId, RunState, SimEvent } from '../../src/sim';
import { statValue } from '../../src/sim/stats/getStat';

const WIDTH = 40;
const wall = '#'.repeat(WIDTH);
const shaft = `###.${'#'.repeat(WIDTH - 4)}`;
// A long hall with an unlit shaft off it: ground left to explore, so the party is not heading out.
const HALL = [wall, `#@${'.'.repeat(WIDTH - 3)}#`, `#${'.'.repeat(WIDTH - 2)}#`, shaft, shaft, wall];
const RAT = 'monster.gloam_rat';
const DRAUGHT = 'item.mending_draught';

const QUICK = 'tactic.quick_to_quaff';
const SPARING = 'tactic.sparing_with_potions';
const HUNTER = 'tactic.treasure_hunter';
const AVOIDS = 'tactic.avoids_combat';
const FINISHER = 'tactic.finisher';
const BODYGUARD = 'tactic.bodyguard';
const CURIOUS = 'tactic.curious';

const member = (name: string, tactics: Partial<TacticPicks> = {}): AdventurerConfig => ({ name, classId: 'class.reaver', raceId: 'race.human', tactics });

/** A party in the hall, with the whole hall known and no monsters. */
function party(extra: { habitSlots?: number } = {}, ...members: AdventurerConfig[]): { state: RunState; actors: AiActor[] } {
  const state = createRun({ party: members, floorText: HALL, depth: 1, monsters: false, ...extra }, 1);
  const terrain = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
  for (let y = 3; y < 5; y++) for (let x = 2; x <= 4; x++) memory[y * WIDTH + x] = 0;
  return { state, actors: state.party.map((id) => getEntity(state, id as EntityId) as AiActor) };
}

const at = (state: RunState, who: ActorEntity, x: number, y: number) => moveEntity(state, who.id, 'd1', { x, y });
const choose = (state: RunState, who: ActorEntity) => chooseRule({ state, actor: who as AiActor });
const rejected = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: 'commandRejected' }> => e.type === 'commandRejected');

/** Puts a draught at (x, 1) and has `hero` see it from 5 tiles off, then walks `hero` back to the start: the item is remembered, `x - 1` steps away. */
function remember(state: RunState, hero: ActorEntity, x: number): void {
  placeItem(state, 'd1', { x, y: 1 }, { def: DRAUGHT, qty: 1 });
  at(state, hero, x - 5, 1);
  step(state, [], { decide: waitDecide });
  at(state, hero, 1, 1);
}

function foe(state: RunState, x: number, y: number, hp?: number): ActorEntity {
  const m = spawnMonster(state, RAT, 'd1', { x, y }) as AiActor;
  if (hp !== undefined) m.actor.hp = hp;
  return m;
}

describe('habit content', () => {
  it('passes the game checks and lists the six M3 habits', () => {
    expect(checkGame()).toEqual([]);
    expect(tacticsOn('habit').map((t) => t.id).sort()).toEqual([AVOIDS, BODYGUARD, CURIOUS, FINISHER, HUNTER, QUICK, SPARING].sort());
  });

  it('makes Quick to quaff and Sparing one exclusive pair, and Avoids combat and Finisher another', () => {
    expect(TACTICS.get(QUICK).exclusiveWith).toEqual([SPARING]);
    expect(TACTICS.get(SPARING).exclusiveWith).toEqual([QUICK]);
    expect(TACTICS.get(AVOIDS).exclusiveWith).toEqual([FINISHER]);
    expect(TACTICS.get(FINISHER).exclusiveWith).toEqual([AVOIDS]);
  });

  it('is either rows or a parameter, never both, and names only ability tags and ids', () => {
    for (const t of tacticsOn('habit')) {
      expect(t.rows !== undefined && t.params !== undefined, t.id).toBe(false);
      expect(JSON.stringify(t.rows ?? []), t.id).not.toMatch(/class\.|item\./);
    }
  });
});

describe('habit slots', () => {
  it('refuses more habits than slots, a pair, and a repeat, and says why', () => {
    const { state, actors } = party({ habitSlots: 1 }, member('Hero'));
    const hero = actors[0] as AiActor;
    const set = (habits: string[]) => rejected(step(state, [{ type: 'setTactics', actor: hero.id, habits }]));
    expect(set([HUNTER, FINISHER])[0]?.reason).toMatch(/2 habits, but only 1 habit slot/);
    expect(set([QUICK, SPARING])[0]?.reason).toMatch(/can't be taken with/);
    expect(set([HUNTER, HUNTER])[0]?.reason).toMatch(/twice/);
    expect(hero.ai.tactics?.habits).toEqual([]);
    expect(set([HUNTER])).toEqual([]);
    expect(hero.ai.tactics?.habits).toEqual([HUNTER]);
  });

  it('allows as many habits as slots, up to three, and refuses a pair even then', () => {
    const { state, actors } = party({ habitSlots: 2 }, member('Hero'));
    const hero = actors[0] as AiActor;
    expect(rejected(step(state, [{ type: 'setTactics', actor: hero.id, habits: [HUNTER, FINISHER] }]))).toEqual([]);
    expect(rejected(step(state, [{ type: 'setTactics', actor: hero.id, habits: [HUNTER, FINISHER, CURIOUS] }]))[0]?.reason).toMatch(/only 2 habit slots/);
    expect(rejected(step(state, [{ type: 'setTactics', actor: hero.id, habits: [AVOIDS, FINISHER] }]))[0]?.reason).toMatch(/can't be taken with/);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('refuses a run that starts with more habits than slots', () => {
    expect(() => createRun({ party: [member('Hero', { habits: [HUNTER, CURIOUS] })], floorText: HALL, depth: 1, monsters: false, habitSlots: 1 }, 1)).toThrow(/only 1 habit slot/);
    expect(() => createRun({ party: [member('Hero', { habits: [HUNTER, CURIOUS] })], floorText: HALL, depth: 1, monsters: false }, 1)).not.toThrow();
  });
});

describe('Quick to quaff and Sparing with potions', () => {
  const quaffsAt = (habit: string | null, percent: number): boolean => {
    const { state, actors } = party({}, member('Hero', habit === null ? {} : { habits: [habit] }));
    const hero = actors[0] as AiActor;
    hero.inventory = { items: [{ def: DRAUGHT, qty: 1 }] };
    hero.actor.hp = Math.max(1, Math.round((statValue(state, hero, 'hp') * percent) / 100));
    return choose(state, hero)?.action === 'act.quaff_healing';
  };

  it('moves the baseline quaff line from 35% to 60% and to 20%', () => {
    expect([quaffsAt(null, 50), quaffsAt(null, 30)]).toEqual([false, true]);
    expect([quaffsAt(QUICK, 50), quaffsAt(QUICK, 65)]).toEqual([true, false]);
    expect([quaffsAt(SPARING, 30), quaffsAt(SPARING, 15)]).toEqual([false, true]);
  });

  it('keeps the gamble on an unknown potion at the baseline line, whatever the habit', () => {
    const gamble = (habit: string | null, percent: number): boolean => {
      const { state, actors } = party({}, member('Hero', habit === null ? {} : { habits: [habit] }));
      const hero = actors[0] as AiActor;
      hero.inventory = { items: [{ def: DRAUGHT, qty: 1, identified: false }] };
      hero.actor.hp = Math.round((statValue(state, hero, 'hp') * percent) / 100);
      return choose(state, hero)?.action === 'act.quaff_healing';
    };
    expect([gamble(QUICK, 50), gamble(QUICK, 30), gamble(null, 50), gamble(SPARING, 15)]).toEqual([false, true, false, true]);
  });

  it('names the habit in the trace', () => {
    const { state, actors } = party({}, member('Hero', { habits: [QUICK] }));
    const hero = actors[0] as AiActor;
    hero.inventory = { items: [{ def: DRAUGHT, qty: 1 }] };
    hero.actor.hp = Math.round(statValue(state, hero, 'hp') * 0.5);
    const events = step(state, []);
    const fired = events.find((e) => e.type === 'ruleFired' && e.actor === hero.id);
    expect(fired).toMatchObject({ action: 'act.quaff_healing', condition: 'cond.needs_healing' });
  });
});

describe('Treasure hunter', () => {
  it('walks past the usual 8 steps for an item it has seen, and says so', () => {
    const { state, actors } = party({}, member('Hero', { habits: [HUNTER] }));
    const hero = actors[0] as AiActor;
    remember(state, hero, 17);
    const c = choose(state, hero);
    expect(c).toMatchObject({ action: 'act.pick_up', rule: { set: 'own', option: HUNTER } });
    expect(c?.detail).toMatch(/^Treasure hunter: going for a .*, 16 turns away/);
  });

  it('plays the baseline without the habit, with an enemy in sight, and for items out of reach', () => {
    const plain = party({}, member('Hero'));
    remember(plain.state, plain.actors[0] as AiActor, 17);
    expect(choose(plain.state, plain.actors[0] as AiActor)?.action).not.toBe('act.pick_up');

    const watched = party({}, member('Hero', { habits: [HUNTER] }));
    remember(watched.state, watched.actors[0] as AiActor, 17);
    foe(watched.state, 6, 1);
    expect(choose(watched.state, watched.actors[0] as AiActor)?.rule).not.toMatchObject({ option: HUNTER });

    const far = party({}, member('Hero', { habits: [HUNTER] }));
    remember(far.state, far.actors[0] as AiActor, 37);
    expect(choose(far.state, far.actors[0] as AiActor)?.rule).not.toMatchObject({ option: HUNTER });
  });
});

describe('Avoids combat', () => {
  it('backs away from a fight an ally is already in, and names the habit', () => {
    const { state, actors } = party({}, member('Hero', { habits: [AVOIDS] }), member('Ally'));
    const [hero, ally] = actors as [AiActor, AiActor];
    at(state, hero, 6, 1);
    at(state, ally, 8, 1);
    foe(state, 9, 1);
    const c = choose(state, hero);
    expect(c).toMatchObject({ action: 'act.avoid_fight', rule: { option: AVOIDS } });
    expect(c?.detail).toMatch(/^Avoids combat: slipping away from the gloam rat/);
  });

  it('fights as normal alone or with the enemy next to it', () => {
    const { state, actors } = party({}, member('Hero', { habits: [AVOIDS] }));
    const hero = actors[0] as AiActor;
    at(state, hero, 6, 1);
    foe(state, 8, 1);
    expect(choose(state, hero)?.action).not.toBe('act.avoid_fight');
    foe(state, 5, 1);
    expect(choose(state, hero)?.action).toBe('act.attack_adjacent');
  });
});

describe('Finisher', () => {
  it('closes on a badly wounded enemy and names the habit', () => {
    const { state, actors } = party({}, member('Hero', { habits: [FINISHER] }));
    const hero = actors[0] as AiActor;
    foe(state, 6, 1, 1);
    const c = choose(state, hero);
    expect(c).toMatchObject({ action: 'act.finish_wounded', rule: { option: FINISHER } });
    expect(c?.detail).toMatch(/^Finisher: closing on the wounded gloam rat \(33% HP\) to finish it/);
  });

  it('ignores a healthy enemy, one out of range, and one that is already adjacent', () => {
    const healthy = party({}, member('Hero', { habits: [FINISHER] }));
    foe(healthy.state, 6, 1);
    expect(choose(healthy.state, healthy.actors[0] as AiActor)?.action).not.toBe('act.finish_wounded');

    const far = party({}, member('Hero', { habits: [FINISHER] }));
    foe(far.state, 20, 1, 1);
    expect(choose(far.state, far.actors[0] as AiActor)?.action).not.toBe('act.finish_wounded');

    const next = party({}, member('Hero', { habits: [FINISHER] }));
    foe(next.state, 2, 1, 1);
    expect(choose(next.state, next.actors[0] as AiActor)?.action).toBe('act.attack_adjacent');
  });
});

describe('Bodyguard', () => {
  it('walks back to a Healer more than 3 tiles away, and names the habit', () => {
    const { state, actors } = party({}, member('Hero', { habits: [BODYGUARD] }), member('Mira', { role: 'tactic.healer' }));
    const [hero, mira] = actors as [AiActor, AiActor];
    at(state, hero, 2, 1);
    at(state, mira, 12, 1);
    const c = choose(state, hero);
    expect(c).toMatchObject({ action: 'act.stay_by_healer', rule: { option: BODYGUARD } });
    expect(c?.detail).toMatch(/^Bodyguard: staying close to Mira, 10 tiles away/);
  });

  it('does nothing near the Healer, with no Healer, or with an enemy next to it', () => {
    const near = party({}, member('Hero', { habits: [BODYGUARD] }), member('Mira', { role: 'tactic.healer' }));
    at(near.state, near.actors[0] as AiActor, 2, 1);
    at(near.state, near.actors[1] as AiActor, 4, 1);
    expect(choose(near.state, near.actors[0] as AiActor)?.action).not.toBe('act.stay_by_healer');

    const none = party({}, member('Hero', { habits: [BODYGUARD] }), member('Bram'));
    at(none.state, none.actors[1] as AiActor, 12, 1);
    expect(choose(none.state, none.actors[0] as AiActor)?.action).not.toBe('act.stay_by_healer');

    const busy = party({}, member('Hero', { habits: [BODYGUARD] }), member('Mira', { role: 'tactic.healer' }));
    at(busy.state, busy.actors[1] as AiActor, 12, 1);
    foe(busy.state, 2, 1);
    expect(choose(busy.state, busy.actors[0] as AiActor)?.action).toBe('act.attack_adjacent');
  });
});

describe('Curious', () => {
  const ROOM_STAIRS = ['#########', '#@.>....#', '#.......#', '#########'];

  /** A hero holding the given pack in a room with stairs it remembers. */
  function curious(items: { def: string; qty: number; identified?: false }[], habits = [CURIOUS]) {
    const state = createRun({ party: [member('Hero', { habits })], depth: 2, floorTexts: [ROOM_STAIRS, ROOM_STAIRS], monsters: false }, 5);
    const hero = getEntity(state, state.party[0] as EntityId) as AiActor;
    step(state, [], { decide: waitDecide }); // look around so the stairs are remembered
    hero.inventory = { items };
    return { state, hero };
  }

  it('drinks an unknown potion when calm and healthy, and says what for', () => {
    const { state, hero } = curious([{ def: DRAUGHT, qty: 1, identified: false }]);
    const c = choose(state, hero);
    expect(c).toMatchObject({ action: 'act.test_unknown', rule: { option: CURIOUS } });
    expect(c?.detail).toMatch(/^Curious: drinking the unknown .* to learn what it does/);
  });

  it('leaves a known potion alone, and does nothing without the habit', () => {
    expect(choose(...(Object.values(curious([{ def: DRAUGHT, qty: 1 }])) as [RunState, ActorEntity]))?.action).not.toBe('act.test_unknown');
    const plain = curious([{ def: DRAUGHT, qty: 1, identified: false }], []);
    expect(choose(plain.state, plain.hero)?.action).not.toBe('act.test_unknown');
  });

  it('waits for a calm moment and for 70% HP', () => {
    const hurt = curious([{ def: DRAUGHT, qty: 1, identified: false }]);
    hurt.hero.actor.hp = Math.round(statValue(hurt.state, hurt.hero, 'hp') * 0.6);
    expect(choose(hurt.state, hurt.hero)?.action).not.toBe('act.test_unknown');
    const watched = curious([{ def: DRAUGHT, qty: 1, identified: false }]);
    spawnMonster(watched.state, RAT, 'd1', { x: 6, y: 1 });
    expect(choose(watched.state, watched.hero)?.action).not.toBe('act.test_unknown');
  });

  it('decides the same whatever the unidentified potions really are', () => {
    // Two different potion types, both unknown: nothing about what they are reaches the decision.
    const potions = ['item.mending_draught', 'item.quickstep_tonic'];
    const picks = potions.map((def) => {
      const { state, hero } = curious([{ def: 'item.iron_hatchet', qty: 1 }, { def, qty: 1, identified: false }]);
      const c = choose(state, hero);
      return { action: c?.action, rule: c?.rule, request: c?.request };
    });
    expect(picks[0]).toMatchObject({ action: 'act.test_unknown' });
    expect(picks[1]).toEqual(picks[0]);
  });
});
