/**
 * Cohesive monster group AI (ETH-135), on hand-built maps with fixed seeds:
 * - `withGroupAiRules` compatibility with plain `spawnMonster` vs grouped/tethered/patrolling monsters
 * - Room-tethered idle (`act.tether_wander`) staying inside `homeRoom` and returning if pulled out
 * - Shared pack alert on sight (`combatTurnStart`) and on damage (`strike`, even on lethal 1-hit kill)
 * - Support + caster + frontline coordinated engagement
 * - 8-turn pursuit memory (`PURSUIT_MEMORY_TURNS`) around corners & closed doors
 * - Save/load mid-pursuit determinism (`serialize`/`deserialize`/`stateHash`)
 */
import { describe, expect, it } from 'vitest';
import { BRUTE_RULES, CASTER_RULES, MONSTERS } from '../../src/content';
import {
  checkInvariants,
  chooseRule,
  createRun,
  deserialize,
  getEntity,
  moveEntity,
  PURSUIT_MEMORY_TURNS,
  serialize,
  spawnMonster,
  stateHash,
  step,
  withGroupAiRules,
} from '../../src/sim';
import type { ActorEntity, AiActor, Entity, EntityId, Rect, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

function setup(floorText: string[], seed = 1, holdHero = true): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText, depth: 1, monsters: false }, seed);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  if (holdHero && hero.ai !== undefined) {
    hero.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];
  }
  return { state, hero };
}

function runSteps(state: RunState, steps: number, until: () => boolean = () => false): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
    if (until()) break;
  }
  return events;
}

const inRect = (pos: { x: number; y: number }, r: Rect) =>
  pos.x >= r.x && pos.x < r.x + r.w && pos.y >= r.y && pos.y < r.y + r.h;

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

const intentAction = (e: Entity) => e.ai?.memory.intent?.action;

describe('withGroupAiRules', () => {
  it('keeps plain spawnMonster rules untouched and inserts cond.has_alert + idle action when tethered or patrolling', () => {
    const plain = withGroupAiRules(CASTER_RULES, { hasHomeRoom: false, hasPatrol: false });
    expect(plain.map((r) => r.action.id)).toEqual(CASTER_RULES.map((r) => r.action.id));

    const tethered = withGroupAiRules(BRUTE_RULES, { hasHomeRoom: true, hasPatrol: false });
    expect(tethered.map((r) => [r.condition.id, r.action.id])).toEqual([
      ['cond.enemy_adjacent', 'act.attack_adjacent'],
      ['cond.enemy_visible', 'act.approach_enemy'],
      ['cond.has_alert', 'act.pursue_alert'],
      ['cond.always', 'act.tether_wander'],
    ]);

    const patrol = withGroupAiRules(BRUTE_RULES, { hasHomeRoom: false, hasPatrol: true });
    expect(patrol.map((r) => [r.condition.id, r.action.id])).toEqual([
      ['cond.enemy_adjacent', 'act.attack_adjacent'],
      ['cond.enemy_visible', 'act.approach_enemy'],
      ['cond.has_alert', 'act.pursue_alert'],
      ['cond.always', 'act.patrol'],
    ]);
  });
});

describe('room-tethered idle (act.tether_wander)', () => {
  it('keeps unalerted room pack members inside homeRoom even next to open doorways, and walks back if outside', () => {
    // Hero on far left separated by walls and an open doorway; room on the right is x:8..12, y:1..3.
    const MAP = [
      '##############',
      '#@.....#.....#',
      '######.#.....#',
      '######' + "'......#",
      '##############',
    ];
    const homeRoom: Rect = { x: 8, y: 1, w: 5, h: 3 };
    const { state } = setup(MAP, 5);
    const a = spawnMonster(state, 'monster.bone_gnawer', 'd1', { x: 9, y: 2 }, undefined, { groupId: 1, homeRoom }) as ActorEntity;
    const b = spawnMonster(state, 'monster.mossling', 'd1', { x: 11, y: 2 }, undefined, { groupId: 1, homeRoom }) as ActorEntity;

    for (let i = 0; i < 20; i++) {
      step(state, []);
      expect(checkInvariants(state)).toEqual([]);
      expect(inRect(a.pos, homeRoom)).toBe(true);
      expect(inRect(b.pos, homeRoom)).toBe(true);
      // Step 1 stops right after the party member's turn; monster intents populate from step 2 onward.
      if (i >= 1) expect(intentAction(a)).toBe('act.tether_wander');
    }

    // Place a tethered monster outside its homeRoom with no alert: it walks back inside.
    moveEntity(state, a.id, 'd1', { x: 6, y: 3 });
    runSteps(state, 10, () => inRect(a.pos, homeRoom));
    expect(inRect(a.pos, homeRoom)).toBe(true);
  });

  it('falls back cleanly to act.wander when homeRoom is absent', () => {
    // Wall separates hero from the monster so cond.enemy_visible is false and idle rule fires.
    const MAP = ['###########', '#@.#......#', '#..#......#', '###########'];
    const { state } = setup(MAP, 3);
    const lonely = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 8, y: 2 }, undefined, { groupId: 1 }) as ActorEntity;
    const choice = chooseRule({ state, actor: lonely as AiActor });
    // Even with groupId & no alert, act.wander fires without homeRoom.
    expect(choice?.action).toBe('act.wander');
  });
});

describe('pack alert on sight and on damage', () => {
  it('broadcasts alert on sight across groupId so blind packmates join the fight while other groups stay unalerted', () => {
    // Hero stands at (1,1); scout (6,1) sees hero down the corridor, while ally (11,3) is behind a wall corner.
    const MAP = [
      '##############',
      '#@...........#',
      '#########.####',
      '#########....#',
      '##############',
    ];
    const { state, hero } = setup(MAP, 2);
    const room: Rect = { x: 9, y: 3, w: 4, h: 1 };
    const scout = spawnMonster(state, 'monster.bone_gnawer', 'd1', { x: 6, y: 1 }, undefined, { groupId: 1, homeRoom: room }) as ActorEntity;
    const mate = spawnMonster(state, 'monster.bone_gnawer', 'd1', { x: 11, y: 3 }, undefined, { groupId: 1, homeRoom: room }) as ActorEntity;
    const outsider = spawnMonster(state, 'monster.bone_gnawer', 'd1', { x: 12, y: 3 }, undefined, { groupId: 2, homeRoom: room }) as ActorEntity;

    // Two steps so monster turns run after the hero's turn 1.
    runSteps(state, 2);
    // Scout saw hero and broadcasted alert to mate (groupId 1), but NOT outsider (groupId 2).
    expect(scout.monster?.alert?.pos).toEqual(hero.pos);
    expect(mate.monster?.alert?.pos).toEqual(hero.pos);
    expect(outsider.monster?.alert).toBeUndefined();

    // Mate moves north toward the corridor via act.pursue_alert even before seeing hero.
    runSteps(state, 5, () => mate.pos.y <= 1);
    expect(mate.pos.y).toBeLessThanOrEqual(2);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('immediately alerts packmates on damage, even when a single lethal blow kills the struck member', () => {
    const MAP = [
      '############',
      '#@.........#',
      '########.###',
      '########...#',
      '############',
    ];
    const { state, hero } = setup(MAP, 7);
    const room: Rect = { x: 8, y: 3, w: 3, h: 1 };
    const frontline = spawnMonster(state, 'monster.mossling', 'd1', { x: 2, y: 1 }, undefined, { groupId: 5, homeRoom: room }) as ActorEntity;
    const reserve = spawnMonster(state, 'monster.bone_gnawer', 'd1', { x: 10, y: 3 }, undefined, { groupId: 5, homeRoom: room }) as ActorEntity;
    // Set frontline speed 0 so it doesn't act before hero strikes, and HP 1 so hero's blow kills it.
    frontline.actor.hp = 1;
    if (frontline.stats !== undefined) frontline.stats.base.speed = 0;

    // Guarantee hit on the queued attack so the 1-hit kill strike fires immediately.
    if (hero.stats !== undefined) hero.stats.base.accuracy = 30;
    const events = step(state, [{ type: 'playerAction', actor: hero.id, action: { id: 'attack', dir: { x: 1, y: 0 } } }]);
    expect(ofType(events, 'attacked').length).toBe(1);
    expect(ofType(events, 'died').some((e) => e.actor === frontline.id)).toBe(true);
    expect(reserve.monster?.alert?.pos).toEqual(hero.pos);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('coordinates frontline, support, and caster together when alerted', () => {
    // Open hall: hero on left, frontline/caster/support in a side alcove around the corner, frontline sees hero.
    const MAP = [
      '###############',
      '#@......#.....#',
      '#.......+.....#',
      '#.............#',
      '###############',
    ];
    const { state } = setup(MAP, 4);
    const room: Rect = { x: 9, y: 1, w: 5, h: 3 };
    const brute = spawnMonster(state, 'monster.bone_gnawer', 'd1', { x: 9, y: 3 }, undefined, { groupId: 3, homeRoom: room }) as ActorEntity;
    const caster = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 12, y: 1 }, undefined, { groupId: 3, homeRoom: room }) as ActorEntity;
    const tender = spawnMonster(state, 'monster.moss_tender', 'd1', { x: 13, y: 1 }, undefined, { groupId: 3, homeRoom: room }) as ActorEntity;
    brute.actor.hp = 4; // wounded so tender has someone to mend once alerted and in view.

    const events = runSteps(state, 15);
    // Brute rushes hero, caster shoots a bolt, and tender rushes out to mend/bolster brute!
    expect(caster.monster?.alert).toBeDefined();
    expect(tender.monster?.alert).toBeDefined();
    const bolts = ofType(events, 'attacked').concat(ofType(events, 'missed') as never[]).filter((e) => e.actor === caster.id && e.ranged === true);
    const aids = ofType(events, 'aided').filter((e) => e.actor === tender.id);
    expect(bolts.length + aids.length).toBeGreaterThan(0);
  });
});

describe('8-turn pursuit memory & save/load determinism', () => {
  it('opens a closed door during 8-turn pursuit, forgets after expiry, and matches save/load mid-pursuit', () => {
    const PILLAR_MAP = [
      '###############',
      '#@...#........#',
      '#.............#',
      '###########+###',
      '#.............#',
      '###############',
    ];
    const homeRoom: Rect = { x: 1, y: 4, w: 13, h: 1 };
    const { state: s2, hero: h2 } = setup(PILLAR_MAP, 8);
    const chaser = spawnMonster(s2, 'monster.bone_gnawer', 'd1', { x: 11, y: 4 }, undefined, {
      groupId: 7,
      homeRoom,
    }) as ActorEntity;
    expect(MONSTERS.has(chaser.def)).toBe(true);
    moveEntity(s2, h2.id, 'd1', { x: 1, y: 1 });
    chaser.monster = {
      ...(chaser.monster as NonNullable<typeof chaser.monster>),
      alert: { pos: { x: 11, y: 1 }, untilTurn: s2.turn + PURSUIT_MEMORY_TURNS },
    };

    // Step 3 turns: chaser opens the closed door at (11,3) and advances into row 2/1!
    const earlyEvents = runSteps(s2, 3);
    expect(ofType(earlyEvents, 'doorOpened').some((e) => e.actor === chaser.id)).toBe(true);

    // Save/load mid-pursuit and step both forward identically!
    const twin = deserialize(serialize(s2));
    expect(stateHash(twin)).toBe(stateHash(s2));
    for (let i = 0; i < 12; i++) {
      const e1 = step(s2, []);
      const e2 = step(twin, []);
      expect(e2).toEqual(e1);
      expect(stateHash(twin)).toBe(stateHash(s2));
    }

    // After > PURSUIT_MEMORY_TURNS with no visible enemy, alert is cleared and chaser returns to homeRoom!
    expect(chaser.monster?.alert).toBeUndefined();
    runSteps(s2, 10, () => inRect(chaser.pos, homeRoom));
    expect(inRect(chaser.pos, homeRoom)).toBe(true);
  });
});
