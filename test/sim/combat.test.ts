/**
 * Monsters, melee combat and death (ETH-060), on hand-built maps with fixed seeds: fights to the
 * death, fleeing, monster pathing and wandering, tile sharing, the spawn step, and what the
 * snapshot, the Codex and the invariants make of it all.
 */
import { describe, expect, it } from 'vitest';
import { findGlyph, MONSTER_MOSSLING, monsterRules, MONSTERS } from '../../src/content';
import {
  afterArmor,
  BASELINE_RULES,
  checkGame,
  checkInvariants,
  createRun,
  discoveriesOf,
  ensureFloor,
  floorIdAt,
  getEntity,
  hitChance,
  isPartyWiped,
  monstersForDanger,
  planFloor,
  snapshot,
  spawnMonster,
  step,
  trophiesForKill,
  validateAction,
} from '../../src/sim';
import type { ActorEntity, Entity, RunConfig, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

function setup(floorText: string[], seed = 1, extra: Partial<RunConfig> = {}): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText, depth: 1, ...extra }, seed);
  return { state, hero: getEntity(state, state.party[0] as number) as ActorEntity };
}

function run(state: RunState, steps: number, until: (events: SimEvent[]) => boolean = () => false): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    const events = step(state, []);
    all.push(...events);
    expect(checkInvariants(state)).toEqual([]);
    if (until(events)) break;
  }
  return all;
}

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

const dist = (a: Entity, b: Entity) => Math.max(Math.abs(a.pos.x - b.pos.x), Math.abs(a.pos.y - b.pos.y));

describe('monster content', () => {
  it('has at least six original monsters, each valid, with a glyph the map can color', () => {
    expect(MONSTERS.all().length).toBeGreaterThanOrEqual(6);
    expect(checkGame()).toEqual([]);
    for (const def of MONSTERS.all()) {
      expect(findGlyph(def.id)).toEqual(def.glyph);
      expect(monsterRules(def).length).toBeGreaterThan(0);
    }
    expect(MONSTERS.all().filter((m) => m.sharesTile === true).length).toBeGreaterThan(0);
    expect(monstersForDanger(1).length).toBeGreaterThan(0);
    expect(monstersForDanger(10).length).toBeGreaterThan(0);
  });
});

describe('attacks', () => {
  it('hit chance and armor stay in range', () => {
    expect(hitChance(0, 0)).toBeCloseTo(0.7);
    expect(hitChance(100, 0)).toBe(0.95);
    expect(hitChance(0, 100)).toBe(0.05);
    expect(afterArmor(2, 5)).toBe(1);
    expect(afterArmor(6, 2)).toBe(4);
  });

  it('only targets an enemy one step away', () => {
    const { state, hero } = setup(['######', '#@...#', '######']);
    expect(validateAction(state, hero, { id: 'attack', dir: { x: 1, y: 0 } })).toBe('There is no enemy there');
    spawnMonster(state, 'monster.mossling', 'd1', { x: 2, y: 1 });
    expect(validateAction(state, hero, { id: 'attack', dir: { x: 1, y: 0 } })).toBeNull();
    expect(validateAction(state, hero, { id: 'attack', dir: { x: 2, y: 0 } })).not.toBeNull();
  });

  it('fight to the death: the loser leaves the floor and the schedule, with died and killed events', () => {
    const { state, hero } = setup(['#######', '#@....#', '#######'], 3);
    const rat = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 3, y: 1 });
    const events = run(state, 200, (es) => es.some((e) => e.type === 'died'));
    const sighted = ofType(events, 'monsterSighted');
    expect(sighted[0]).toMatchObject({ actor: hero.id, monster: rat.id, def: 'monster.mire_toad', floor: 'd1' });
    expect(ofType(events, 'attacked').length + ofType(events, 'missed').length).toBeGreaterThan(0);

    const [died] = ofType(events, 'died');
    const [killed] = ofType(events, 'killed');
    expect(died).toBeDefined();
    expect(killed).toMatchObject({ killer: died?.killer, victim: died?.actor, floor: 'd1' });
    const loser = died?.actor as number;
    expect(state.entities[loser]).toBeUndefined();
    expect(state.floors.d1?.entities).not.toContain(loser);

    // The Codex learns of the toad from the sighting, and of killing it if the hero won.
    expect(sighted.flatMap(discoveriesOf)).toEqual([{ id: 'monster.mire_toad', mark: 'seen' }]);
    if (loser === rat.id) expect(discoveriesOf(killed as SimEvent)).toEqual([{ id: 'monster.mire_toad', mark: 'killed' }]);
  });

  it('fells the last adventurer, ends the run as a wipe and credits Trophies for kills', () => {
    // A dead end: the hero has nowhere to run, so it fights at 1 HP and falls.
    const { state, hero } = setup(['#######', '#@....#', '#######'], 1);
    hero.actor.hp = 1;
    const brute = spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 2, y: 1 });
    const events = run(state, 100, (es) => es.some((e) => e.type === 'runEnded'));
    expect(isPartyWiped(state)).toBe(true);
    expect(state.domains.run.end?.outcome).toBe('wipe');
    // The fallen adventurer stays in the state at 0 HP, out of the way, for the run domain.
    expect(state.party).toEqual([hero.id]);
    expect(hero.actor.hp).toBe(0);
    expect(ofType(events, 'killed')).toMatchObject([{ killer: brute.id, victim: hero.id, byParty: false }]);
    expect(ofType(events, 'fell')).toMatchObject([{ actor: hero.id, name: 'Brannoc', floor: 'd1', pos: { x: 1, y: 1 } }]);
    // No combat `died` line for an adventurer: `fell` is the one.
    expect(ofType(events, 'died')).toEqual([]);
    expect(snapshot(state).party).toMatchObject([{ id: hero.id, name: 'Brannoc', alive: false, hp: 0 }]);
    // The run is over: a step does nothing.
    expect(step(state, [])).toEqual([]);
  });

  it('credits Trophies for a monster the party kills', () => {
    const { state, hero } = setup(['#####', '#@..#', '#####'], 1);
    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 2, y: 1 });
    rat.actor = { ...(rat.actor as NonNullable<typeof rat.actor>), hp: 1 };
    run(state, 30, () => state.entities[rat.id] === undefined);
    expect(state.entities[rat.id]).toBeUndefined();
    expect(state.domains.run.trackers['track.kills']).toEqual({
      kills: 1,
      trophies: trophiesForKill(MONSTERS.get('monster.gloam_rat').threat),
      byMonster: { 'monster.gloam_rat': 1 },
      byActor: { [hero.id]: 1 },
    });
    expect(state.domains.run.rewards.atRisk.trophies).toBe(trophiesForKill(MONSTERS.get('monster.gloam_rat').threat));
    void hero;
  });
});

describe('the baseline', () => {
  it('flees at very low HP when there is an escape route', () => {
    const { state, hero } = setup(['############', '#..........#', '#..........#', '#....@.....#', '############'], 2);
    hero.actor.hp = 3;
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 6, y: 3 });
    const events = run(state, 3);
    const fired = ofType(events, 'ruleFired').filter((e) => e.actor === hero.id);
    expect(fired[0]).toMatchObject({ rule: { set: 'baseline', index: BASELINE_RULES.findIndex((r) => r.action.id === 'act.flee') }, action: 'act.flee' });
    expect(dist(hero, toad)).toBeGreaterThan(1);
  });

  it('fights instead when cornered', () => {
    const { state, hero } = setup(['#####', '#@..#', '#####'], 2);
    hero.actor.hp = 3;
    spawnMonster(state, 'monster.mire_toad', 'd1', { x: 2, y: 1 });
    const events = run(state, 1);
    expect(ofType(events, 'ruleFired')[0]).toMatchObject({ action: 'act.attack_adjacent' });
  });
});

describe('monster AI', () => {
  it('closes in on an adventurer it can see, round a pillar, then attacks', () => {
    const { state, hero } = setup(['############', '#@...#.....#', '#.........##', '#..........#', '############'], 4);
    // Hold the hero in place so only the monster moves.
    if (hero.ai !== undefined) hero.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];
    const mossling = spawnMonster(state, 'monster.mossling', 'd1', { x: 9, y: 3 }) as ActorEntity;
    const events = run(state, 30, () => dist(hero, mossling) <= 1);
    expect(dist(hero, mossling)).toBeLessThanOrEqual(1);
    expect(ofType(events, 'actionFailed')).toEqual([]);
    expect(mossling.ai?.memory.intent?.action).toMatch(/act\.(approach_enemy|surround|attack_adjacent)/);
  });

  it('wanders when no adventurer is in sight, without tracing every decision', () => {
    const { state } = setup(['###############', '#@#...........#', '###...........#', '#.............#', '###############'], 5);
    const toad = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 9, y: 2 }) as ActorEntity;
    const start = { ...toad.pos };
    const events = run(state, 10);
    expect(toad.pos).not.toEqual(start);
    expect(toad.ai?.memory.intent?.action).toBe('act.wander');
    expect(ofType(events, 'ruleFired').filter((e) => e.actor === toad.id)).toEqual([]);
  });
});

describe('tile sharing', () => {
  it('lets small folk and swarms crowd together, and nobody else', () => {
    const { state } = setup(['#########', '#@......#', '#########']);
    const a = spawnMonster(state, MONSTER_MOSSLING.id, 'd1', { x: 5, y: 1 }) as ActorEntity;
    const b = spawnMonster(state, MONSTER_MOSSLING.id, 'd1', { x: 6, y: 1 }) as ActorEntity;
    const swarm = spawnMonster(state, 'monster.ashmite_swarm', 'd1', { x: 5, y: 1 });
    expect(swarm.pos).toEqual(a.pos);
    expect(validateAction(state, b, { id: 'move', dir: { x: -1, y: 0 } })).toBeNull();
    expect(() => spawnMonster(state, 'monster.mire_toad', 'd1', { x: 5, y: 1 })).toThrow(RangeError);
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 7, y: 1 }) as ActorEntity;
    expect(validateAction(state, toad, { id: 'move', dir: { x: -1, y: 0 } })).toMatch(/in the way/);
    expect(validateAction(state, b, { id: 'move', dir: { x: 1, y: 0 } })).toMatch(/in the way/);
    expect(checkInvariants(state)).toEqual([]);

    // The invariant allows only sharers together.
    toad.pos = { ...a.pos };
    expect(checkInvariants(state).some((p) => p.startsWith('[core.positions]'))).toBe(true);
  });
});

describe('spawning', () => {
  it('stocks generated floors by danger, away from the stairs, the same way every time', () => {
    const state = createRun({ party: [HERO], depth: 10 }, 7);
    const plan = planFloor(state, 'd1');
    const again = planFloor(state, 'd1');
    expect(plan.spawns).toEqual(again.spawns);
    expect(plan.spawns?.length).toBeGreaterThan(0);
    const stairs = plan.features.filter((f) => f.feature.kind === 'stairs').map((f) => f.pos);
    for (const s of plan.spawns ?? []) {
      expect(monstersForDanger(1).map((m) => m.id)).toContain(s.def);
      expect(plan.terrain.get(s.pos.x, s.pos.y)).toBe(1);
      for (const p of stairs) expect(Math.max(Math.abs(p.x - s.pos.x), Math.abs(p.y - s.pos.y))).toBeGreaterThanOrEqual(7);
    }
    const deep = planFloor(state, floorIdAt(10));
    expect(deep.spawns?.length ?? 0).toBeGreaterThan(plan.spawns?.length ?? 0);
    // Building the floor makes the monsters.
    const floor = ensureFloor(state, floorIdAt(10));
    const monsters = floor.entities.map((id) => getEntity(state, id)).filter((e) => e.monster !== undefined);
    expect(monsters.map((m) => m.def)).toEqual(deep.spawns?.map((s) => s.def));
    expect(checkInvariants(state)).toEqual([]);
  });

  it('leaves monsters out when the config says so', () => {
    const state = createRun({ party: [HERO], monsters: false }, 7);
    expect(planFloor(state, 'd1').spawns).toBeUndefined();
    expect(Object.values(state.entities).filter((e) => e.monster !== undefined)).toEqual([]);
  });
});

describe('snapshot', () => {
  it('shows visible actors with name and HP', () => {
    const { state, hero } = setup(['######', '#@...#', '######']);
    const m = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 3, y: 1 });
    const actors = snapshot(state).floor.actors;
    expect(actors).toContainEqual({ id: m.id, def: 'monster.gloam_rat', pos: { x: 3, y: 1 }, faction: 'monster', name: 'Gloam rat', hp: 3, maxHp: 3 });
    expect(actors.find((a) => a.id === hero.id)).toMatchObject({ name: 'Brannoc', hp: 20, maxHp: 20 });
  });
});
