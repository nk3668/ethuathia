/**
 * The party formations (ETH-151) on a hand-built hall with a fixed seed: Stick together is the old
 * fixed cohesion, Loose and Spread out let a straggler stray further, a stance scales the formation's
 * numbers, and the regroup trace names the formation. Formation only changes when the player picks one.
 */
import { describe, expect, it } from 'vitest';
import {
  CAUTIOUS_LEASH_PERCENT,
  FORMATION_LOOSE,
  FORMATION_SPREAD_OUT,
  FORMATION_STICK_TOGETHER,
  LOOSE_CLOSE,
  LOOSE_LEASH,
  RECKLESS_LEASH_PERCENT,
  SPREAD_OUT_CLOSE,
  SPREAD_OUT_LEASH,
  STANCE_CAUTIOUS,
  STANCE_RECKLESS,
  stanceParamProblems,
  tacticsOn,
} from '../../src/content';
import { checkInvariants, chooseRule, createRun, getEntity, getFloor, getMemory, partyCohesionOf, PARTY_CLOSE, PARTY_LEASH, step } from '../../src/sim';
import type { ActorEntity, AiActor, EntityId, Rule, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ALLY = { name: 'Isolde', classId: 'class.vanguard', raceId: 'race.human' };

const WIDTH = 80;
const wall = '#'.repeat(WIDTH);
const shaft = `###.${'#'.repeat(WIDTH - 4)}`;
// A long hall with an unlit shaft off it, three tiles from the lead: ground left to explore.
const LONG_HALL = [wall, `#@${'.'.repeat(WIDTH - 3)}#`, shaft, shaft, shaft, shaft, shaft, wall];

const hold = (): Rule[] => [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];
const dist = (a: ActorEntity, b: ActorEntity) => Math.max(Math.abs(a.pos.x - b.pos.x), Math.abs(a.pos.y - b.pos.y));

/** A two-member party in the hall; the lead holds still, the follower is `gap` tiles from it. */
function party(tactics: { stance?: string; formation?: string } | undefined, gap: number): { state: RunState; lead: AiActor; follower: AiActor } {
  const state = createRun({ party: [HERO, ALLY], floorText: LONG_HALL, depth: 1, monsters: false, ...(tactics === undefined ? {} : { tactics }) }, 1);
  const [lead, follower] = state.party.map((id) => getEntity(state, id as EntityId) as AiActor) as [AiActor, AiActor];
  const terrain = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < terrain.length; i++) memory[i] = (terrain[i] as number) + 1;
  for (let y = 3; y < 8; y++) for (let x = 2; x <= 4; x++) memory[y * WIDTH + x] = 0;
  lead.ai.rules = hold();
  follower.pos = { x: lead.pos.x + gap, y: lead.pos.y };
  return { state, lead, follower };
}

const regroups = (state: RunState, follower: AiActor): boolean => chooseRule({ state, actor: follower })?.action === 'act.regroup';

describe('formation options', () => {
  it('has three options, Stick together the default, with the numbers the baseline always had', () => {
    expect(tacticsOn('formation').map((t) => t.id)).toEqual([FORMATION_STICK_TOGETHER.id, FORMATION_LOOSE.id, FORMATION_SPREAD_OUT.id]);
    expect(FORMATION_STICK_TOGETHER.tags).toContain('default');
    expect(FORMATION_STICK_TOGETHER.params).toEqual({ leash: PARTY_LEASH, close: PARTY_CLOSE });
    expect(PARTY_LEASH).toBe(8);
    expect(PARTY_CLOSE).toBe(3);
    for (const f of tacticsOn('formation')) {
      expect(f.params?.close).toBeLessThan(f.params?.leash as number);
      expect(f.description).toContain(String(f.params?.leash));
    }
  });

  it('puts each option further out than the last', () => {
    expect(LOOSE_LEASH).toBeGreaterThan(PARTY_LEASH);
    expect(SPREAD_OUT_LEASH).toBeGreaterThan(LOOSE_LEASH);
    expect(LOOSE_CLOSE).toBeGreaterThan(PARTY_CLOSE);
    expect(SPREAD_OUT_CLOSE).toBeGreaterThan(LOOSE_CLOSE);
  });

  it('rejects the old stance leash key and bounds leashPercent', () => {
    expect(stanceParamProblems({ leash: 5 })).toHaveLength(1);
    expect(stanceParamProblems({ leashPercent: 24 })).toHaveLength(1);
    expect(stanceParamProblems({ leashPercent: 401 })).toHaveLength(1);
    expect(stanceParamProblems({ leashPercent: 60 })).toEqual([]);
  });
});

describe('partyCohesionOf', () => {
  it('gives each formation its own numbers', () => {
    expect(partyCohesionOf(party(undefined, 1).follower)).toMatchObject({ leash: 8, close: 3, formation: { name: 'Stick together' } });
    expect(partyCohesionOf(party({ formation: FORMATION_LOOSE.id }, 1).follower)).toMatchObject({ leash: LOOSE_LEASH, close: LOOSE_CLOSE });
    expect(partyCohesionOf(party({ formation: FORMATION_SPREAD_OUT.id }, 1).follower)).toMatchObject({ leash: SPREAD_OUT_LEASH, close: SPREAD_OUT_CLOSE });
  });

  it('scales by the stance: Cautious and Reckless keep their old numbers under Stick together', () => {
    expect(CAUTIOUS_LEASH_PERCENT).toBe(60);
    expect(RECKLESS_LEASH_PERCENT).toBe(175);
    expect(partyCohesionOf(party({ stance: STANCE_CAUTIOUS.id }, 1).follower)).toMatchObject({ leash: 5, close: 2 });
    expect(partyCohesionOf(party({ stance: STANCE_RECKLESS.id }, 1).follower)).toMatchObject({ leash: 14, close: 5 });
    expect(partyCohesionOf(party({ stance: STANCE_CAUTIOUS.id, formation: FORMATION_LOOSE.id }, 1).follower)).toMatchObject({ leash: 8, close: 4, formation: { name: 'Loose' } });
  });

  it('never lets close pass leash or drop under 2', () => {
    for (const stance of [STANCE_CAUTIOUS.id, STANCE_RECKLESS.id]) {
      for (const f of tacticsOn('formation')) {
        const { leash, close } = partyCohesionOf(party({ stance, formation: f.id }, 1).follower);
        expect(close).toBeGreaterThanOrEqual(2);
        expect(close).toBeLessThanOrEqual(leash);
      }
    }
  });
});

describe('regrouping by formation', () => {
  it('triggers only beyond the picked formation leash', () => {
    const cases: [string | undefined, number, boolean][] = [
      [undefined, 8, false],
      [undefined, 10, true],
      [FORMATION_LOOSE.id, 10, false],
      [FORMATION_LOOSE.id, 14, false],
      [FORMATION_LOOSE.id, 16, true],
      [FORMATION_SPREAD_OUT.id, 16, false],
      [FORMATION_SPREAD_OUT.id, 30, false],
      [FORMATION_SPREAD_OUT.id, 32, true],
    ];
    for (const [formation, gap, expected] of cases) {
      const { state, follower } = party(formation === undefined ? undefined : { formation }, gap);
      expect(regroups(state, follower), `${formation ?? 'default'} at gap ${gap}`).toBe(expected);
    }
  });

  it('keeps walking back until the close distance, then stops (hysteresis)', () => {
    for (const [formation, close, gap] of [
      [FORMATION_STICK_TOGETHER.id, PARTY_CLOSE, 14],
      [FORMATION_LOOSE.id, LOOSE_CLOSE, 20],
      [FORMATION_SPREAD_OUT.id, SPREAD_OUT_CLOSE, 40],
    ] as const) {
      const { state, lead, follower } = party({ formation }, gap);
      for (let i = 0; i < 80 && dist(lead, follower) > close; i++) {
        step(state, []);
        expect(checkInvariants(state)).toEqual([]);
      }
      expect(dist(lead, follower), formation).toBeLessThanOrEqual(close);
    }
  });

  it('names the formation in the regroup trace', () => {
    for (const [formation, name, gap] of [
      [FORMATION_STICK_TOGETHER.id, 'Stick together', 12],
      [FORMATION_LOOSE.id, 'Loose', 18],
    ] as const) {
      const { state, follower } = party({ formation }, gap);
      const events: SimEvent[] = [];
      for (let i = 0; i < 5; i++) events.push(...step(state, []));
      const fired = events.filter((e): e is Extract<SimEvent, { type: 'ruleFired' }> => e.type === 'ruleFired' && e.actor === follower.id);
      expect(fired[0]?.action).toBe('act.regroup');
      expect(fired[0]?.detail).toMatch(new RegExp(`^Regroup: regrouping with Brannoc, \\d+ tiles away \\(formation: ${name}\\)`));
    }
  });

  it('changes on the next decision when the player swaps the formation, and never by itself', () => {
    const { state, follower } = party(undefined, 12);
    expect(regroups(state, follower)).toBe(true);
    step(state, [{ type: 'setTactics', formation: FORMATION_LOOSE.id }]);
    expect(follower.ai.tactics?.formation).toBe(FORMATION_LOOSE.id);
    expect(regroups(state, follower)).toBe(false);
    for (let i = 0; i < 20; i++) step(state, []);
    expect(follower.ai.tactics?.formation).toBe(FORMATION_LOOSE.id);
  });

  it('lets Cautious regroup sooner and Reckless later than the formation alone', () => {
    const cautious = party({ stance: STANCE_CAUTIOUS.id }, 6);
    expect(regroups(cautious.state, cautious.follower)).toBe(true);
    const reckless = party({ stance: STANCE_RECKLESS.id }, 12);
    expect(regroups(reckless.state, reckless.follower)).toBe(false);
  });
});
