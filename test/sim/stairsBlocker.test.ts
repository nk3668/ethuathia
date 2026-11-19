/**
 * A creature that never moves, standing on the stairs the party needs (ETH-113). On the way out
 * a stationary monster on the stairs up used to leave a gathered adventurer waiting beside it
 * forever, and stuck detection didn't count waiting. Now the party walks up to whoever holds
 * the stairs unless it is a party member, fights it if it is hostile, and waiting too long with
 * nobody in the party moving drops the waiting rule with a `stuck` trace. Fixed seeds and
 * hand-built floors (`parseFloorText` through `floorTexts`).
 */
import { describe, expect, it } from 'vitest';
import {
  checkInvariants,
  createRun,
  GATHER_RADIUS,
  getEntity,
  moveEntity,
  partyMemberAt,
  ruleDecide,
  spawnMonster,
  step,
  WAIT_STUCK_TURNS,
} from '../../src/sim';
import type { ActorEntity, Decide, EntityId, RunConfig, RunState, SimEvent } from '../../src/sim';
import { MONSTER_MOSS_TENDER } from '../../src/content';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

/**
 * Floor 1: straight to the stairs down. Floor 2, the bottom: a corridor east of the stairs up
 * that bends south out of sight, so the party walks well away from the stairs before turning back.
 */
const D1 = ['#######', '#<@..>#', '#######'];
const D2 = ['############', '#<.........#', '##########.#', '##########.#', '##########.#', '############'];
const STAIRS_UP_D2 = { x: 1, y: 1 };

const CONFIG: RunConfig = { party: [HERO], depth: 2, floorTexts: [D1, D2] };

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

/** Steps until the run ends or `cap` steps pass, checking invariants; `each` runs before every step. */
function play(state: RunState, cap: number, each?: () => void, decide: Decide = ruleDecide): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < cap && state.domains.run.end === null; i++) {
    each?.();
    events.push(...step(state, [], { decide }));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('a creature that never moves on the stairs up (ETH-113)', () => {
  it('is fought off the stairs on the way out instead of waited on forever', () => {
    const state = createRun(CONFIG, 7);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    let blocker: EntityId | null = null;
    const events = play(state, 600, () => {
      // Once the party has turned back on the bottom floor, while it is still further from the
      // stairs up than GATHER_RADIUS, a moss tender with no rules (it only ever waits) takes them.
      if (blocker !== null || state.domains.run.leaving === null || hero.floor !== 'd2') return;
      if (Math.max(Math.abs(hero.pos.x - STAIRS_UP_D2.x), Math.abs(hero.pos.y - STAIRS_UP_D2.y)) <= GATHER_RADIUS) return;
      const tender = spawnMonster(state, MONSTER_MOSS_TENDER.id, 'd2', STAIRS_UP_D2);
      (tender.ai as { rules: unknown[] }).rules = [];
      blocker = tender.id;
    });

    expect(blocker).not.toBeNull();
    // The run ended: the party fought its way past and walked out.
    expect(state.domains.run.end).not.toBeNull();
    expect(ofType(events, 'leftDungeon')).toHaveLength(1);
    expect(ofType(events, 'killed').some((e) => e.victim === blocker)).toBe(true);
    // It went straight for the blocker: no waiting it out, and stuck detection never needed.
    expect(ofType(events, 'stuck')).toEqual([]);
    const gathers = ofType(events, 'ruleFired').filter((e) => e.actor === hero.id && e.action === 'act.gather');
    expect(gathers).toEqual([]);
  });

  it('only counts a party member on the stairs as holding them', () => {
    const state = createRun({ ...CONFIG, party: [HERO, MIRA] }, 7);
    const miraId = state.party[1] as EntityId;
    moveEntity(state, miraId, 'd1', { x: 1, y: 1 });
    expect(partyMemberAt(state, 'd1', { x: 1, y: 1 })).toBe(true);
    moveEntity(state, miraId, 'd1', { x: 4, y: 1 });
    spawnMonster(state, MONSTER_MOSS_TENDER.id, 'd1', { x: 1, y: 1 });
    expect(partyMemberAt(state, 'd1', { x: 1, y: 1 })).toBe(false);
  });
});

describe('stuck detection counts waiting (ETH-113)', () => {
  it('drops a gather rule after WAIT_STUCK_TURNS waits with nobody in the party moving, and says so', () => {
    const state = createRun({ ...CONFIG, party: [HERO, MIRA] }, 7);
    const [heroId, miraId] = state.party as [EntityId, EntityId];
    // Mira stands on the way out and never moves (as if possessed and left there), so Brannoc,
    // gathered beside her, waits for a turn at the stairs that never comes.
    moveEntity(state, miraId, 'd1', { x: 1, y: 1 });
    const decide: Decide = (ctx) => (ctx.actor.id === miraId ? { id: 'wait' } : ruleDecide(ctx));
    const events: SimEvent[] = [];
    events.push(...step(state, [{ type: 'retreat' }], { decide }));
    events.push(...play(state, 4 * WAIT_STUCK_TURNS, undefined, decide));

    const stuck = ofType(events, 'stuck');
    expect(stuck.length).toBeGreaterThan(0);
    const first = stuck[0] as Extract<SimEvent, { type: 'stuck' }>;
    expect(first).toMatchObject({ actor: heroId, action: 'act.gather', turns: WAIT_STUCK_TURNS });
    expect(first.detail).toMatch(/^Waited 50 turns with nobody in the party moving \(Gather at the stairs: waiting for a turn at the stairs up/);
    // The decision right after the drop is something other than gathering again.
    const after = ofType(events, 'ruleFired').find((e) => e.actor === heroId && e.turn === first.turn);
    expect(after?.action).not.toBe('act.gather');
  });

  it('does not count waiting while someone in the party is still on the move', () => {
    const state = createRun({ ...CONFIG, party: [HERO, MIRA] }, 7);
    const [heroId, miraId] = state.party as [EntityId, EntityId];
    // Brannoc waits on the way out for Mira, who paces back and forth out of reach of the stairs.
    moveEntity(state, miraId, 'd1', { x: 5, y: 1 });
    let east = false;
    const decide: Decide = (ctx) => {
      if (ctx.actor.id !== miraId) return ruleDecide(ctx);
      east = !east;
      return { id: 'move', dir: { x: east ? -1 : 1, y: 0 } };
    };
    moveEntity(state, heroId, 'd1', { x: 1, y: 1 });
    const events: SimEvent[] = [];
    events.push(...step(state, [{ type: 'retreat' }], { decide }));
    events.push(...play(state, 3 * WAIT_STUCK_TURNS, undefined, decide));
    expect(ofType(events, 'stuck')).toEqual([]);
  });
});
