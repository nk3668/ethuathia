/**
 * XP, levels and class growth (ETH-034), on hand-built maps with fixed seeds: the level curve,
 * the class's growth, a fight that levels an adventurer, depth XP, the `track.xp` extras for
 * class Mastery, the snapshot, the log line and the invariants.
 */
import { describe, expect, it } from 'vitest';
import { CLASS_VANGUARD, CLASSES, MONSTERS } from '../../src/content';
import {
  attributeValue,
  checkInvariants,
  createRun,
  getAttribute,
  getEntity,
  grantXp,
  growthAt,
  levelForXp,
  levelGains,
  levelOf,
  MAX_LEVEL,
  snapshot,
  spawnMonster,
  statValue,
  step,
  XP_PER_DEPTH,
  XP_PER_THREAT,
  XP_STEP,
  xpForLevel,
} from '../../src/sim';
import type { ActorEntity, Emit, EntityId, RunConfig, RunState, SimEvent, XpTrackerState } from '../../src/sim';
import { logLines } from '../../src/ui/shell/text';

const HERO = { name: 'Brannoc', classId: CLASS_VANGUARD.id, raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: CLASS_VANGUARD.id, raceId: 'race.human' };

function setup(config: Partial<RunConfig> = {}, seed = 7): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText: ['#######', '#@....#', '#######'], depth: 1, ...config }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

/** Steps until `done`, checking every invariant after each step. */
function runUntil(state: RunState, done: (events: SimEvent[]) => boolean, cap = 200): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < cap; i++) {
    const events = step(state, []);
    all.push(...events);
    expect(checkInvariants(state)).toEqual([]);
    if (done(events)) break;
  }
  return all;
}

describe('the level curve', () => {
  it('needs XP_STEP × L more XP for each level after L, capped at MAX_LEVEL', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(XP_STEP);
    expect(xpForLevel(3)).toBe(3 * XP_STEP);
    expect(xpForLevel(4)).toBe(6 * XP_STEP);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(XP_STEP - 1)).toBe(1);
    expect(levelForXp(XP_STEP)).toBe(2);
    expect(levelForXp(xpForLevel(MAX_LEVEL) * 10)).toBe(MAX_LEVEL);
  });

  it('grows each attribute by floor(rate × (level − 1)) of the class growth', () => {
    for (const cls of CLASSES.all()) expect(Object.values(cls.growth).some((r) => r > 0)).toBe(true);
    expect(growthAt(CLASS_VANGUARD.id, 'grit', 1)).toBe(0);
    expect(growthAt(CLASS_VANGUARD.id, 'grit', 2)).toBe(1);
    expect(growthAt(CLASS_VANGUARD.id, 'grit', 3)).toBe(3);
    expect(growthAt(CLASS_VANGUARD.id, 'wits', 4)).toBe(0);
    expect(growthAt(CLASS_VANGUARD.id, 'wits', 5)).toBe(1);
    expect(levelGains(CLASS_VANGUARD.id, 1, 2)).toEqual({ brawn: 1, grit: 1 });
    expect(levelGains(CLASS_VANGUARD.id, 2, 3)).toEqual({ brawn: 1, finesse: 1, grit: 2 });
  });
});

describe('earning XP', () => {
  it('a fixed-seed fight levels the Vanguard with the expected stats', () => {
    const { state, hero } = setup({}, 7);
    // A cavern brute (threat 6) two steps away: 24 XP, enough for level 2 but not 3.
    const brute = spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 3, y: 1 });
    expect(MONSTERS.get('monster.cavern_brute').threat).toBe(6);
    expect(statValue(state, hero, 'hp')).toBe(20);
    const events = runUntil(state, (es) => es.some((e) => e.type === 'killed'));
    expect(state.entities[brute.id]).toBeUndefined();

    const gained = ofType(events, 'xpGained');
    expect(gained).toHaveLength(1);
    expect(gained[0]).toMatchObject({
      actor: hero.id,
      classId: CLASS_VANGUARD.id,
      amount: 6 * XP_PER_THREAT,
      xp: 24,
      reason: 'kill',
      source: 'monster.cavern_brute',
    });
    const ups = ofType(events, 'leveledUp');
    expect(ups).toHaveLength(1);
    expect(ups[0]).toMatchObject({ actor: hero.id, name: 'Brannoc', level: 2, gains: { brawn: 1, grit: 1 }, floor: 'd1' });
    // The level-up follows the kill and the XP, in that order.
    const types = events.map((e) => e.type);
    expect(types.indexOf('killed')).toBeLessThan(types.indexOf('xpGained'));
    expect(types.indexOf('xpGained')).toBeLessThan(types.indexOf('leveledUp'));

    // Human Vanguard at level 2: Brawn 12 + 1, Grit 14 + 1 → max HP 15 + 6.5 = 21.5, rounded to 22.
    expect(levelOf(hero)).toBe(2);
    expect(attributeValue(hero, 'brawn')).toBe(13);
    expect(attributeValue(hero, 'grit')).toBe(15);
    expect(attributeValue(hero, 'finesse')).toBe(10);
    expect(getAttribute(hero, 'grit').parts.at(-1)).toEqual({ value: 1, source: { id: CLASS_VANGUARD.id, label: 'Level 2' } });
    expect(statValue(state, hero, 'hp')).toBe(22);
    expect(statValue(state, hero, 'carry')).toBe(26);
  });

  it('is the same for the same seed', () => {
    const play = () => {
      const { state } = setup({}, 11);
      spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 3, y: 1 });
      spawnMonster(state, 'monster.mire_toad', 'd1', { x: 5, y: 1 });
      const events = runUntil(state, () => false, 60);
      return { events: events.filter((e) => e.type === 'xpGained' || e.type === 'leveledUp'), growth: state.entities[state.party[0] as EntityId]?.growth };
    };
    const a = play();
    expect(a.events.length).toBeGreaterThan(0);
    expect(play()).toEqual(a);
  });

  it('levels several times from one big grant, raising current HP by what the maximum gained', () => {
    const { state, hero } = setup();
    hero.actor.hp = 10;
    const events: SimEvent[] = [];
    grantXp(state, hero, xpForLevel(4), 'kill', 'monster.cavern_brute', (e) => events.push({ ...e, turn: state.turn }));
    expect(ofType(events, 'leveledUp').map((e) => e.level)).toEqual([2, 3, 4]);
    expect(levelOf(hero)).toBe(4);
    // Max HP 20 → 22 → 25 → 26: current HP rose by 6 too.
    expect(statValue(state, hero, 'hp')).toBe(26);
    expect(hero.actor.hp).toBe(16);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('gives nothing to monsters or the fallen', () => {
    const { state, hero } = setup();
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 4, y: 1 });
    const events: SimEvent[] = [];
    const emit: Emit = (e) => events.push({ ...e, turn: 0 });
    grantXp(state, toad, 100, 'kill', 'x', emit);
    hero.actor.hp = 0;
    grantXp(state, hero, 100, 'kill', 'x', emit);
    expect(events).toEqual([]);
    expect(toad.growth).toBeUndefined();
    expect(hero.growth).toBeUndefined();
  });

  it('gives every living member depth XP for each new deepest floor, once', () => {
    const D1 = ['#######', '#@@..>#', '#######'];
    const D2 = ['#######', '#<...>#', '#######'];
    const D3 = ['#####', '#<..#', '#####'];
    const state = createRun({ party: [HERO, MIRA], depth: 3, floorTexts: [D1, D2, D3] }, 3);
    const events = runUntil(state, () => state.domains.floors.deepest >= 3, 300);
    const depthXp = ofType(events, 'xpGained').filter((e) => e.reason === 'depth');
    expect(depthXp.map((e) => [e.actor, e.amount, e.source])).toEqual([
      [state.party[0], 2 * XP_PER_DEPTH, 'd2'],
      [state.party[1], 2 * XP_PER_DEPTH, 'd2'],
      [state.party[0], 3 * XP_PER_DEPTH, 'd3'],
      [state.party[1], 3 * XP_PER_DEPTH, 'd3'],
    ]);
  });
});

describe('the record of it', () => {
  it('tracks XP per actor and per class for class Mastery, and shows it in the snapshot and the log', () => {
    const { state, hero } = setup({}, 7);
    spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 3, y: 1 });
    const events = runUntil(state, (es) => es.some((e) => e.type === 'leveledUp'));

    // What `RunResult.extras['track.xp']` holds once the run ends.
    const tracked = state.domains.run.trackers['track.xp'] as XpTrackerState;
    expect(tracked).toEqual({
      byActor: { [hero.id]: { classId: CLASS_VANGUARD.id, xp: 24, level: 2 } },
      byClass: { [CLASS_VANGUARD.id]: 24 },
    });

    const view = snapshot(state).domains.stats.members[hero.id];
    expect(view?.level).toEqual({ level: 2, xp: 24, levelXp: XP_STEP, nextXp: 3 * XP_STEP });

    const logged = logLines(
      events.map((event, seq) => ({ seq, event })),
      () => 'Brannoc',
    );
    const lines = logged.map((l) => l.text);
    expect(lines).toContain('Brannoc reaches level 2: Brawn +1, Grit +1.');
    // A level-up is a highlight, placed where it happened.
    expect(logged.find((l) => l.text.includes('reaches level'))?.highlight?.kind.id).toBe('leveledUp');
    expect(lines.some((t) => t.includes('XP'))).toBe(false);
  });

  it('starts at level 1 with no XP', () => {
    const { state, hero } = setup();
    expect(snapshot(state).domains.stats.members[hero.id]?.level).toEqual({ level: 1, xp: 0, levelXp: 0, nextXp: XP_STEP });
  });

  it('flags a level that does not match the XP, and a level on a monster', () => {
    const { state, hero } = setup();
    hero.growth = { level: 3, xp: 0 };
    expect(checkInvariants(state).some((p) => p.includes('stats.growth') || p.includes('level 3'))).toBe(true);
    hero.growth = { level: 1, xp: 0 };
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 4, y: 1 });
    toad.growth = { level: 1, xp: 0 };
    expect(checkInvariants(state).some((p) => p.includes('no adventurer'))).toBe(true);
  });
});
