/**
 * Each attribute's second job (ETH-081): the skill stats derived from attributes (identify, trap
 * spotting, status resistance, disarm, flee, force doors), Grit shortening harmful statuses, and
 * Finesse deciding whether a flee from an adjacent enemy breaks away. Hand-built maps, fixed seeds.
 */
import { describe, expect, it } from 'vitest';
import { attributeDefId } from '../../src/content';
import {
  applyStatus,
  ATTRIBUTE_FORMULAS,
  attributeValue,
  BASELINE_RULES,
  checkInvariants,
  createRun,
  getEntity,
  getStat,
  performAction,
  resistedTurns,
  SKILL_CAP,
  SKILL_STAT_IDS,
  spawnMonster,
  STAT_INFO,
  STATUS_RESIST_CAP,
  statValue,
  step,
  validateAction,
} from '../../src/sim';
import type { ActorEntity, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const OPEN = ['############', '#..........#', '#..........#', '#....@.....#', '############'];

function setup(floorText: string[] = OPEN, seed = 1): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText, depth: 1 }, seed);
  return { state, hero: getEntity(state, state.party[0] as number) as ActorEntity };
}

function train(hero: ActorEntity, points: Partial<Record<'brawn' | 'finesse' | 'wits' | 'grit', number>>): void {
  (hero.stats as NonNullable<typeof hero.stats>).attributes = points;
}

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

describe('skill stats', () => {
  it('each come from one attribute, as percentages with Codex and tooltip text', () => {
    const from = Object.fromEntries(SKILL_STAT_IDS.map((s) => [s, ATTRIBUTE_FORMULAS.filter((f) => f.stat === s).map((f) => f.attribute)]));
    expect(from).toEqual({
      identify: ['wits'],
      trapSpot: ['wits'],
      statusResist: ['grit'],
      disarm: ['finesse'],
      flee: ['finesse'],
      forceDoor: ['brawn'],
    });
    for (const s of SKILL_STAT_IDS) {
      expect(STAT_INFO[s].percent).toBe(true);
      expect(STAT_INFO[s].label.length).toBeGreaterThan(2);
      expect(STAT_INFO[s].description.length).toBeGreaterThan(20);
      expect(STAT_INFO[s].max).toBeLessThanOrEqual(SKILL_CAP);
    }
  });

  it('follow base + attribute × per point, credited to the attribute for the tooltip', () => {
    const { state, hero } = setup();
    for (const f of ATTRIBUTE_FORMULAS.filter((r) => (SKILL_STAT_IDS as readonly string[]).includes(r.stat))) {
      const expected = STAT_INFO[f.stat].base + (attributeValue(hero, f.attribute) - f.from) * f.perPoint;
      expect(statValue(state, hero, f.stat)).toBe(expected);
    }
    // Finesse 10 on a Human Vanguard: Base 40, then +30 from Finesse.
    expect(getStat(state, hero, 'flee')).toEqual({
      stat: 'flee',
      value: 70,
      parts: [
        { op: 'add', value: 40, source: { id: hero.def, label: 'Base' } },
        { op: 'add', value: 30, source: { id: attributeDefId('finesse'), label: 'Finesse 10' } },
      ],
    });
  });

  it('cap at their maximum, and status resistance lower', () => {
    const { state, hero } = setup();
    train(hero, { wits: 60, grit: 60, finesse: 60, brawn: 60 });
    for (const s of SKILL_STAT_IDS) expect(statValue(state, hero, s)).toBe(STAT_INFO[s].max);
    expect(statValue(state, hero, 'statusResist')).toBe(STATUS_RESIST_CAP);
    expect(statValue(state, hero, 'identify')).toBe(SKILL_CAP);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('leave a creature without attributes at its base', () => {
    const { state } = setup();
    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 2, y: 1 });
    expect(statValue(state, rat, 'statusResist')).toBe(0);
    expect(statValue(state, rat, 'flee')).toBe(STAT_INFO.flee.base);
  });
});

describe('status resistance (Grit)', () => {
  it('shrugs off a share of the turns, rounded, never the last one', () => {
    expect(resistedTurns(20, 28)).toBe(6);
    expect(resistedTurns(3, 28)).toBe(1);
    expect(resistedTurns(1, 75)).toBe(0);
    expect(resistedTurns(4, 75)).toBe(3);
    expect(resistedTurns(10, 0)).toBe(0);
  });

  it('shortens a harmful status and says so in the event; leaves a helpful one alone', () => {
    const { state, hero } = setup();
    const events: SimEvent[] = [];
    const emit = (e: Omit<SimEvent, 'turn'>) => events.push({ ...e, turn: state.turn } as SimEvent);
    // Grit 14: 28% of 10 turns = 3 shrugged off.
    applyStatus(state, hero, 'status.poisoned', 10, emit);
    expect(events[0]).toMatchObject({ type: 'statusApplied', status: 'status.poisoned', turns: 7, resisted: 3 });
    applyStatus(state, hero, 'status.hasted', 10, emit);
    expect(events[1]).toMatchObject({ type: 'statusApplied', status: 'status.hasted', turns: 10 });
    expect(events[1]).not.toHaveProperty('resisted');
    // Starting statuses aren't afflictions.
    applyStatus(state, hero, 'status.dazzled', 10, emit, 1, false);
    expect(events[2]).toMatchObject({ status: 'status.dazzled', turns: 10 });
  });

  it('grows with Grit', () => {
    const { state, hero } = setup();
    train(hero, { grit: 10 }); // Grit 24: 48%.
    const events: SimEvent[] = [];
    applyStatus(state, hero, 'status.poisoned', 10, (e) => events.push({ ...e, turn: 0 } as SimEvent));
    expect(events[0]).toMatchObject({ turns: 5, resisted: 5 });
  });
});

describe('fleeing (Finesse)', () => {
  it('always breaks away for a creature without attributes, or with nobody adjacent', () => {
    const { state, hero } = setup();
    const events: SimEvent[] = [];
    const emit = (e: Omit<SimEvent, 'turn'>) => events.push({ ...e, turn: 0 } as SimEvent);
    train(hero, { finesse: -100 }); // Flee 0%.
    expect(statValue(state, hero, 'flee')).toBe(0);
    performAction(state, hero, { id: 'flee', dir: { x: -1, y: 0 } }, emit);
    expect(hero.pos).toEqual({ x: 4, y: 3 });

    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 8, y: 1 }) as ActorEntity;
    spawnMonster(state, 'monster.mossling', 'd1', { x: 8, y: 2 });
    performAction(state, rat, { id: 'flee', dir: { x: 1, y: 0 } }, emit);
    expect(rat.pos).toEqual({ x: 9, y: 1 });
    expect(ofType(events, 'fleeFailed')).toEqual([]);
  });

  it('fails at Flee 0% next to an enemy: the hero stays put and the log says why', () => {
    const { state, hero } = setup();
    train(hero, { finesse: -100 });
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 6, y: 3 });
    const events: SimEvent[] = [];
    expect(validateAction(state, hero, { id: 'flee', dir: { x: -1, y: 0 } })).toBeNull();
    performAction(state, hero, { id: 'flee', dir: { x: -1, y: 0 } }, (e) => events.push({ ...e, turn: 0 } as SimEvent));
    expect(hero.pos).toEqual({ x: 5, y: 3 });
    expect(events).toEqual([
      { type: 'fleeFailed', actor: hero.id, enemy: toad.id, enemyDef: 'monster.mire_toad', chance: 0, floor: 'd1', pos: { x: 5, y: 3 }, turn: 0 },
    ]);
  });

  it('refuses a step into a wall like a move', () => {
    const { state, hero } = setup(['#####', '#@..#', '#####']);
    expect(validateAction(state, hero, { id: 'flee', dir: { x: -1, y: 0 } })).not.toBeNull();
  });

  it('is what the baseline flee uses: a clumsy hero is held back, a nimble one gets away', () => {
    const fleeIndex = BASELINE_RULES.findIndex((r) => r.action.id === 'act.flee');
    for (const [finesse, gotAway] of [
      [-100, false],
      [100, true],
    ] as const) {
      const { state, hero } = setup(OPEN, 2);
      train(hero, { finesse });
      hero.actor.hp = 3;
      spawnMonster(state, 'monster.mire_toad', 'd1', { x: 6, y: 3 });
      const events = step(state, []);
      const fired = ofType(events, 'ruleFired').find((e) => e.actor === hero.id);
      expect(fired).toMatchObject({ rule: { set: 'baseline', index: fleeIndex }, action: 'act.flee' });
      expect(ofType(events, 'fleeFailed').length > 0).toBe(!gotAway);
      expect(hero.pos.x !== 5 || hero.pos.y !== 3).toBe(gotAway);
      expect(checkInvariants(state)).toEqual([]);
    }
  });
});
