/**
 * The roles, ranges and focuses (ETH-193) on a hand-built hall with a fixed seed: Tank, Healer
 * and Scout, the engagement distance of each range, the target each focus picks, the tag and
 * "nobody up front" fallbacks in the trace, and that neutral picks leave the run exactly as it
 * was with no tactics at all.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  FOCUS_INFO,
  FOCUS_PREFERENCES,
  NEUTRAL_PICKS,
  TACTICS,
  tacticsOn,
} from '../../src/content';
import type { TacticPicks } from '../../src/sim';
import {
  checkGame,
  checkInvariants,
  chooseRule,
  createRun,
  defaultPicks,
  getEntity,
  getFloor,
  getMemory,
  moveEntity,
  spawnMonster,
  step,
} from '../../src/sim';
import type { ActorEntity, AdventurerConfig, AiActor, EntityId, RunState } from '../../src/sim';

const WIDTH = 40;
const wall = '#'.repeat(WIDTH);
const shaft = `###.${'#'.repeat(WIDTH - 4)}`;
// A long hall with an unlit shaft off it: ground left to explore, so the baseline explores and regroups.
const HALL = [wall, `#@${'.'.repeat(WIDTH - 3)}#`, `#${'.'.repeat(WIDTH - 2)}#`, shaft, shaft, shaft, wall];

const member = (name: string, tactics: Partial<TacticPicks> = {}): AdventurerConfig => ({
  name,
  classId: 'class.reaver',
  raceId: 'race.human',
  tactics,
});

/** A party in the hall, with the whole hall known (the shaft stays unseen) and no monsters. */
function party(...members: AdventurerConfig[]): { state: RunState; actors: AiActor[] } {
  const state = createRun({ party: members, floorText: HALL, depth: 1, monsters: false }, 1);
  const terrain = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
  for (let y = 3; y < 7; y++) for (let x = 2; x <= 4; x++) memory[y * WIDTH + x] = 0;
  return { state, actors: state.party.map((id) => getEntity(state, id as EntityId) as AiActor) };
}

const at = (state: RunState, who: ActorEntity, x: number, y: number) => moveEntity(state, who.id, 'd1', { x, y });

/** A monster that stands where it is put and has a fixed HP. */
function foe(state: RunState, def: string, x: number, y: number, hp?: number): ActorEntity {
  const m = spawnMonster(state, def, 'd1', { x, y }) as AiActor;
  if (hp !== undefined) m.actor.hp = hp;
  return m;
}

const RAT = 'monster.gloam_rat';

describe('role, range and focus content', () => {
  it('passes the game checks and has the starter options on every axis', () => {
    expect(checkGame()).toEqual([]);
    expect(tacticsOn('role').map((t) => t.name)).toEqual(expect.arrayContaining(['Damage', 'Healer', 'Tank', 'Scout']));
    expect(tacticsOn('range').map((t) => t.name)).toEqual(expect.arrayContaining(['Front line', 'Close support', 'Back line', 'Keep away']));
    expect(tacticsOn('focus').map((t) => t.params?.prefer).sort()).toEqual([...FOCUS_PREFERENCES].sort());
  });

  it('gives every focus a label and every class a playable default build', () => {
    for (const p of FOCUS_PREFERENCES) expect(FOCUS_INFO[p].label).not.toBe('');
    for (const c of CLASSES.all()) expect(defaultPicks(c.id).role, c.id).toMatch(/^tactic\./);
    expect(defaultPicks('class.vanguard')).toMatchObject({ role: 'tactic.tank', range: 'tactic.front_line', focus: 'tactic.protect_allies' });
    expect(defaultPicks('class.lorekeeper')).toMatchObject({ role: 'tactic.healer', range: 'tactic.back_line', focus: 'tactic.casters' });
    expect(defaultPicks('class.reaver')).toMatchObject(NEUTRAL_PICKS);
  });

  it('only gives the options named by ability tag and never by class', () => {
    for (const t of TACTICS.all()) expect(JSON.stringify(t.rows ?? []), t.id).not.toMatch(/class\.|item\./);
  });
});

describe('Tank', () => {
  const tank = { role: 'tactic.tank' };

  it('steps up when an ally already fighting is nearer the enemy, and says so', () => {
    const { state, actors } = party(member('Tank', tank), member('Ally'));
    const [hero, ally] = actors as [AiActor, AiActor];
    at(state, hero, 2, 1);
    at(state, ally, 8, 1);
    foe(state, RAT, 9, 1);
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.guard_front');
    expect(choice?.rule).toMatchObject({ set: 'own', option: 'tactic.tank' });
    expect(choice?.detail).toMatch(/^Tank: stepping up to take the gloam rat before Ally does/);
  });

  it('plays as normal with nobody ahead, with an ally not yet fighting, or once next to the foe', () => {
    const solo = party(member('Tank', tank), member('Ally'));
    const [hero, ally] = solo.actors as [AiActor, AiActor];
    at(solo.state, hero, 2, 1);
    at(solo.state, ally, 1, 2);
    foe(solo.state, RAT, 9, 1);
    expect(chooseRule({ state: solo.state, actor: hero })?.action).not.toBe('act.guard_front');
    at(solo.state, ally, 7, 1); // nearer, but nobody is fighting yet
    expect(chooseRule({ state: solo.state, actor: hero })?.action).not.toBe('act.guard_front');
    const next = party(member('Tank', tank), member('Ally'));
    const [h2, a2] = next.actors as [AiActor, AiActor];
    at(next.state, h2, 8, 1);
    at(next.state, a2, 9, 2);
    foe(next.state, RAT, 9, 1);
    expect(chooseRule({ state: next.state, actor: h2 })?.action).toBe('act.attack_adjacent');
  });

  it('leaves a harmless support creature to the baseline', () => {
    const { state, actors } = party(member('Tank', tank), member('Ally'));
    const [hero, ally] = actors as [AiActor, AiActor];
    at(state, hero, 2, 1);
    at(state, ally, 8, 1);
    foe(state, 'monster.moss_tender', 9, 1);
    expect(chooseRule({ state, actor: hero })?.action).not.toBe('act.guard_front');
  });
});

describe('Healer', () => {
  const healer = { role: 'tactic.healer' };

  it('notes that nothing it carries reaches an ally, then carries on as normal', () => {
    const { state, actors } = party(member('Healer', healer), member('Ally'));
    const [hero, ally] = actors as [AiActor, AiActor];
    at(state, hero, 2, 1);
    at(state, ally, 4, 1);
    ally.actor.hp = 2;
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.rule.set).toBe('baseline');
    expect(choice?.skipped).toContain('Healer: no healing that reaches allies, carrying on as normal');
  });

  it('keeps back while an ally fights, but not alone or once a foe is next to it', () => {
    const { state, actors } = party(member('Healer', healer), member('Ally'));
    const [hero, ally] = actors as [AiActor, AiActor];
    at(state, hero, 2, 1);
    at(state, ally, 8, 1);
    foe(state, RAT, 9, 1);
    const held = chooseRule({ state, actor: hero });
    expect(held?.action).toBe('act.hang_back');
    expect(held?.detail).toMatch(/^Healer: /);

    const alone = party(member('Healer', healer));
    foe(alone.state, RAT, 6, 1);
    expect(chooseRule({ state: alone.state, actor: alone.actors[0] as AiActor })?.action).not.toBe('act.hang_back');
  });
});

describe('Scout', () => {
  const scout = { role: 'tactic.scout' };

  it('slips away from a fight an ally has taken, but not alone, and fights when a foe is next to it', () => {
    const { state, actors } = party(member('Scout', scout), member('Ally'));
    const [hero, ally] = actors as [AiActor, AiActor];
    at(state, hero, 3, 1);
    at(state, ally, 5, 1);
    foe(state, RAT, 6, 1);
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.avoid_fight');
    expect(choice?.detail).toMatch(/^Scout: slipping away from the gloam rat/);
    expect(choice?.request).toMatchObject({ id: 'move' });

    const alone = party(member('Scout', scout));
    foe(alone.state, RAT, 6, 1);
    expect(chooseRule({ state: alone.state, actor: alone.actors[0] as AiActor })?.action).not.toBe('act.avoid_fight');

    at(state, hero, 4, 1);
    at(state, ally, 7, 1);
    foe(state, RAT, 3, 1);
    expect(chooseRule({ state, actor: hero })?.action).toBe('act.attack_adjacent');
  });

  it('keeps exploring past the leash up to twice the formation leash, never with an enemy in sight', () => {
    const { state, actors } = party(member('Lead'), member('Scout', scout));
    const [lead, hero] = actors as [AiActor, AiActor];
    at(state, lead, 2, 1);
    at(state, hero, 14, 1); // 12 tiles: beyond the leash of 8, within 16
    const choice = chooseRule({ state, actor: hero });
    expect(choice?.action).toBe('act.scout_ahead');
    expect(choice?.detail).toMatch(/^Scout: ranging ahead, 12 tiles from Lead/);

    at(state, hero, 20, 1); // 18 tiles: too far, back to the party
    expect(chooseRule({ state, actor: hero })?.action).toBe('act.regroup');

    at(state, hero, 14, 1);
    foe(state, RAT, 18, 1);
    expect(chooseRule({ state, actor: hero })?.action).not.toBe('act.scout_ahead');
  });
});

describe('ranges', () => {
  /** A fighter at (9,1) in melee with a rat at (10,1); the hero at `x`. */
  function line(range: string, x: number, solo = false) {
    const { state, actors } = solo ? party(member('Hero', { range })) : party(member('Hero', { range }), member('Front'));
    const [hero, front] = actors as [AiActor, AiActor | undefined];
    at(state, hero, x, 1);
    if (front !== undefined) at(state, front, 9, 1);
    foe(state, RAT, 10, 1);
    return { state, hero, front };
  }

  it('Front line never holds range, whoever is up front', () => {
    const { state, hero } = line('tactic.front_line', 5);
    expect(chooseRule({ state, actor: hero })?.action).not.toBe('act.hold_range');
  });

  it('Back line waits at its distance behind a fighting ally, and backs off when closer', () => {
    const far = line('tactic.back_line', 5); // 5 tiles from the rat
    const held = chooseRule({ state: far.state, actor: far.hero });
    expect(held).toMatchObject({ action: 'act.hold_range', request: { id: 'wait' } });
    expect(held?.detail).toContain('Back line: holding 5 tiles from the gloam rat, behind Front');

    const near = line('tactic.back_line', 8, false); // 2 tiles from the rat
    at(near.state, near.hero, 7, 1); // 3 tiles
    const backed = chooseRule({ state: near.state, actor: near.hero });
    expect(backed?.action).toBe('act.hold_range');
    expect(backed?.request).toMatchObject({ id: 'move' });
    expect(backed?.detail).toContain('backing off to 4 tiles');
  });

  it('with nobody up front a ranged pick behaves as Front line', () => {
    const { state, hero } = line('tactic.keep_away', 5, true);
    expect(chooseRule({ state, actor: hero })?.action).not.toBe('act.hold_range');
  });

  it('Keep away leaves a melee another ally is already in, and fights when nobody else is', () => {
    const { state, hero, front } = line('tactic.keep_away', 8);
    at(state, hero, 11, 1);
    const left = chooseRule({ state, actor: hero });
    expect(left?.action).toBe('act.hold_range');
    expect(left?.detail).toContain('Keep away: leaving the gloam rat to Front');
    at(state, front as AiActor, 3, 1);
    expect(chooseRule({ state, actor: hero })?.action).toBe('act.attack_adjacent');
  });

  it('Close support holds two tiles back', () => {
    const { state, hero } = line('tactic.close_support', 7); // 3 tiles from the rat
    expect(chooseRule({ state, actor: hero })).toMatchObject({ action: 'act.hold_range', request: { id: 'wait' } });
  });
});

describe('focuses', () => {
  /** A hero in the middle of a ring: `foes` stand next to it, `ally` next to the first. */
  function ring(focus: string, foes: [string, number, number, number?][], withAlly = false) {
    const { state, actors } = withAlly ? party(member('Hero', { focus }), member('Ally')) : party(member('Hero', { focus }));
    const [hero, ally] = actors as [AiActor, AiActor | undefined];
    at(state, hero, 6, 1);
    if (ally !== undefined) at(state, ally, 8, 1);
    const made = foes.map(([def, x, y, hp]) => foe(state, def, x, y, hp));
    return { state, hero, made };
  }
  const target = (state: RunState, hero: AiActor) => chooseRule({ state, actor: hero });

  it('Nearest, Weakest and Strongest choose by distance and HP', () => {
    const { state, hero, made } = ring('tactic.weakest', [[RAT, 7, 1, 9], [RAT, 7, 2, 3]]);
    expect(target(state, hero)?.goal).toEqual(made[1]?.pos);
    step(state, [{ type: 'setTactics', actor: hero.id, focus: 'tactic.strongest' }]);
    expect(target(state, hero)?.goal).toEqual(made[0]?.pos);
  });

  it('Casters picks a caster over a weaker foe, and says so when there is none', () => {
    const withCaster = ring('tactic.casters', [[RAT, 7, 1, 2], ['monster.lantern_cap', 7, 2, 12]]);
    expect(target(withCaster.state, withCaster.hero)?.goal).toEqual(withCaster.made[1]?.pos);
    const without = ring('tactic.casters', [[RAT, 7, 1, 2], [RAT, 7, 2, 9]]);
    const choice = target(without.state, without.hero);
    expect(choice?.goal).toEqual(without.made[0]?.pos);
    expect(choice?.skipped).toContain('Casters: no caster next to me, striking the weakest');
  });

  it('Ranged and Melee split the foes by whether they bolt', () => {
    const foes: [string, number, number, number?][] = [[RAT, 7, 1, 2], ['monster.lantern_cap', 7, 2, 12]];
    const ranged = ring('tactic.ranged', foes);
    expect(target(ranged.state, ranged.hero)?.goal).toEqual(ranged.made[1]?.pos);
    const melee = ring('tactic.melee', foes);
    expect(target(melee.state, melee.hero)?.goal).toEqual(melee.made[0]?.pos);
    const none = ring('tactic.ranged', [[RAT, 7, 1, 2]]);
    expect(target(none.state, none.hero)?.skipped).toContain('Ranged: no ranged foe next to me, striking the weakest');
  });

  it('Protect allies picks the foe next to an ally, else the weakest', () => {
    // The strong rat is next to the ally at (8,1); the weak one only to the hero at (6,1).
    const { state, hero, made } = ring('tactic.protect_allies', [[RAT, 5, 2, 2], [RAT, 7, 1, 9]], true);
    expect(target(state, hero)?.goal).toEqual(made[1]?.pos);
    const alone = ring('tactic.protect_allies', [[RAT, 7, 1, 9], [RAT, 7, 2, 2]]);
    const choice = target(alone.state, alone.hero);
    expect(choice?.goal).toEqual(alone.made[1]?.pos);
    expect(choice?.skipped).toContain('Protect allies: no foe is hitting an ally next to me, striking the weakest');
  });
});

describe('neutral picks', () => {
  /** Plays a run with monsters on, either with the neutral picks in place or with tactics stripped out. */
  function play(strip: boolean): string {
    const state = createRun({ party: [member('A', { ...NEUTRAL_PICKS }), member('B', { ...NEUTRAL_PICKS })], depth: 3 }, 5);
    if (strip) {
      for (const id of state.party) {
        const e = getEntity(state, id as EntityId) as AiActor;
        delete e.ai.tactics;
      }
    }
    const log: unknown[] = [];
    for (let i = 0; i < 400; i++) log.push(step(state, []));
    expect(checkInvariants(state)).toEqual([]);
    return JSON.stringify(log);
  }

  it('give the same events as a run with no tactics at all', () => {
    expect(play(false)).toBe(play(true));
  });
});
