/**
 * XP, levels and class growth (ETH-034, ETH-110), on hand-built maps with fixed seeds: the
 * uncapped level curve, seeded growth rolls kept across save and load, a fight that levels an
 * adventurer, shared kill XP, depth XP, the `track.xp` extras for class Mastery, the snapshot,
 * the log line and the invariants.
 */
import { describe, expect, it } from 'vitest';
import { ATTRIBUTE_IDS, CLASS_VANGUARD, CLASSES, expectedGrowth, MONSTERS } from '../../src/content';
import {
  attributeValue,
  checkInvariants,
  createRun,
  deserialize,
  getAttribute,
  getEntity,
  grantKillXp,
  grantXp,
  growthOf,
  KILL_SHARE_RADIUS,
  killShare,
  levelForXp,
  levelOf,
  rollLevelGains,
  serialize,
  snapshot,
  spawnMonster,
  statValue,
  step,
  XP_PER_DEPTH,
  XP_PER_THREAT,
  XP_STEP,
  xpForLevel,
} from '../../src/sim';
import type { ActorEntity, Emit, EntityId, GrowthGains, RunConfig, RunState, SimEvent, XpTrackerState } from '../../src/sim';
import { logLines } from '../../src/ui/shell/text';

const HERO = { name: 'Brannoc', classId: CLASS_VANGUARD.id, raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: CLASS_VANGUARD.id, raceId: 'race.human' };
const ODO = { name: 'Odo', classId: CLASS_VANGUARD.id, raceId: 'race.human' };

function setup(config: Partial<RunConfig> = {}, seed = 7): { state: RunState; hero: ActorEntity } {
  const state = createRun({ party: [HERO], floorText: ['#######', '#@....#', '#######'], depth: 1, ...config }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

const ofType = <K extends SimEvent['type']>(events: SimEvent[], type: K) =>
  events.filter((e): e is Extract<SimEvent, { type: K }> => e.type === type);

function collect(state: RunState): { events: SimEvent[]; emit: Emit } {
  const events: SimEvent[] = [];
  return { events, emit: (e) => events.push({ ...e, turn: state.turn }) };
}

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

/** The sum of several levels' gains, per attribute. */
function sumGains(list: GrowthGains[]): GrowthGains {
  const out: GrowthGains = {};
  for (const g of list) for (const a of ATTRIBUTE_IDS) if (g[a] !== undefined) out[a] = (out[a] ?? 0) + (g[a] ?? 0);
  return out;
}

describe('the level curve', () => {
  it('needs XP_STEP × L more XP for each level after L, with no cap', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(XP_STEP);
    expect(xpForLevel(3)).toBe(3 * XP_STEP);
    expect(xpForLevel(4)).toBe(6 * XP_STEP);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(XP_STEP - 1)).toBe(1);
    expect(levelForXp(XP_STEP)).toBe(2);
    for (const level of [5, 20, 21, 57, 100, 1000]) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });
});

describe('growth rolls', () => {
  it('every class can raise something, and each attribute has its own odds', () => {
    for (const cls of CLASSES.all()) expect(Object.values(cls.growth).some((r) => r !== undefined && expectedGrowth(r) > 0)).toBe(true);
    const g = CLASS_VANGUARD.growth;
    // A warrior: Grit and Brawn grow fast, Wits slowly.
    expect(expectedGrowth(g.grit ?? { min: 0, max: 0 })).toBeGreaterThan(expectedGrowth(g.wits ?? { min: 0, max: 0 }));
  });

  it('are seeded by run, actor and level: the same arguments give the same gains, within each range', () => {
    const { state, hero } = setup({}, 7);
    const counts: Record<string, number> = {};
    for (let level = 2; level < 400; level++) {
      const gains = rollLevelGains(state, hero.id, CLASS_VANGUARD.id, level);
      expect(rollLevelGains(state, hero.id, CLASS_VANGUARD.id, level)).toEqual(gains);
      for (const a of ATTRIBUTE_IDS) {
        const roll = CLASS_VANGUARD.growth[a];
        const gain = gains[a] ?? 0;
        expect(gain).toBeGreaterThanOrEqual(0);
        expect(gain).toBeLessThanOrEqual(roll?.max ?? 0);
        counts[a] = (counts[a] ?? 0) + gain;
      }
    }
    // Over ~400 levels each attribute lands near its expected rate.
    for (const a of ATTRIBUTE_IDS) {
      const roll = CLASS_VANGUARD.growth[a];
      if (roll === undefined) continue;
      expect((counts[a] ?? 0) / 398).toBeCloseTo(expectedGrowth(roll), 0);
    }
    // A different seed rolls differently somewhere.
    const other = setup({}, 8).state;
    const differs = [2, 3, 4, 5, 6, 7, 8, 9].some(
      (l) => JSON.stringify(rollLevelGains(other, hero.id, CLASS_VANGUARD.id, l)) !== JSON.stringify(rollLevelGains(state, hero.id, CLASS_VANGUARD.id, l)),
    );
    expect(differs).toBe(true);
  });

  it('are stored, so a save and load keeps the attributes and later levels roll the same', () => {
    const { state, hero } = setup({}, 7);
    grantXp(state, hero, xpForLevel(5), 'kill', 'x', collect(state).emit);
    const loaded = deserialize(serialize(state));
    const again = getEntity(loaded, hero.id) as ActorEntity;
    for (const a of ATTRIBUTE_IDS) expect(attributeValue(again, a)).toBe(attributeValue(hero, a));
    expect(again.growth).toEqual(hero.growth);
    grantXp(state, hero, xpForLevel(9) - xpForLevel(5), 'kill', 'x', collect(state).emit);
    grantXp(loaded, again, xpForLevel(9) - xpForLevel(5), 'kill', 'x', collect(loaded).emit);
    expect(again.growth).toEqual(hero.growth);
  });
});

describe('earning XP', () => {
  it('a fixed-seed fight levels the Vanguard with the expected stats', () => {
    const { state, hero } = setup({}, 7);
    // The Vanguard starts one kill short of level 3 (the level-2 growth is rolled getting there);
    // a weakened cavern brute (threat 6) two steps away is worth exactly that kill.
    const brute = spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 3, y: 1 }) as ActorEntity;
    brute.actor.hp = 2;
    expect(MONSTERS.get('monster.cavern_brute').threat).toBe(6);
    expect(statValue(state, hero, 'hp')).toBe(33);
    grantXp(state, hero, xpForLevel(3) - 6 * XP_PER_THREAT, 'kill', 'x', collect(state).emit);
    expect(levelOf(hero)).toBe(2);
    const events = runUntil(state, (es) => es.some((e) => e.type === 'killed'));
    expect(state.entities[brute.id]).toBeUndefined();

    const gained = ofType(events, 'xpGained');
    expect(gained).toHaveLength(1);
    expect(gained[0]).toMatchObject({
      actor: hero.id,
      classId: CLASS_VANGUARD.id,
      amount: 6 * XP_PER_THREAT,
      xp: xpForLevel(3),
      reason: 'kill',
      source: 'monster.cavern_brute',
    });
    const ups = ofType(events, 'leveledUp');
    expect(ups.map((e) => e.level)).toEqual([3]);
    expect(ups.map((e) => e.gains)).toEqual([rollLevelGains(state, hero.id, CLASS_VANGUARD.id, 3)]);
    // Seed 7's rolls, pinned so a change to the roll shows up here.
    expect(rollLevelGains(state, hero.id, CLASS_VANGUARD.id, 2)).toEqual({ brawn: 1, finesse: 1, grit: 2 });
    expect(ups.map((e) => e.gains)).toEqual([{ brawn: 2, grit: 1, wits: 1 }]);
    const types = events.map((e) => e.type);
    expect(types.indexOf('killed')).toBeLessThan(types.indexOf('xpGained'));
    expect(types.indexOf('xpGained')).toBeLessThan(types.indexOf('leveledUp'));

    // Human Vanguard (Brawn 12, Finesse 10, Wits 5, Grit 14) plus the two rolls: Brawn 15,
    // Finesse 11, Wits 6, Grit 17 → max HP 4.5 × 9 + 7.5 = 48; Carry 30.
    const total = sumGains([2, 3].map((l) => rollLevelGains(state, hero.id, CLASS_VANGUARD.id, l)));
    expect(statValue(state, hero, 'hp')).toBe(48);
    expect(attributeValue(hero, 'finesse')).toBe(11);
    expect(attributeValue(hero, 'wits')).toBe(6);
    expect(levelOf(hero)).toBe(3);
    expect(hero.growth?.gained).toEqual(total);
    const brawn = 12 + (total.brawn ?? 0);
    const grit = 14 + (total.grit ?? 0);
    expect(attributeValue(hero, 'brawn')).toBe(brawn);
    expect(attributeValue(hero, 'grit')).toBe(grit);
    expect(growthOf(hero, 'grit')).toBe(total.grit ?? 0);
    expect(getAttribute(hero, 'grit').parts.find((p) => p.source.label === 'Level 3')?.value ?? 0).toBe(total.grit ?? 0);
    expect(statValue(state, hero, 'hp')).toBe(Math.round(4.5 * (grit - 8) + brawn / 2));
    expect(statValue(state, hero, 'carry')).toBe(2 * brawn);
  });

  it('is the same for the same seed', () => {
    const play = () => {
      const { state } = setup({}, 11);
      const brute = spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 3, y: 1 }) as ActorEntity;
      brute.actor.hp = 2;
      spawnMonster(state, 'monster.mire_toad', 'd1', { x: 5, y: 1 });
      const events = runUntil(state, () => false, 60);
      return { events: events.filter((e) => e.type === 'xpGained' || e.type === 'leveledUp'), growth: state.entities[state.party[0] as EntityId]?.growth };
    };
    const a = play();
    expect(a.events.length).toBeGreaterThan(0);
    expect(play()).toEqual(a);
  });

  it('levels many times from one big grant, past level 20, raising current HP only by what the maximum gained', () => {
    const { state, hero } = setup();
    hero.actor.hp = 10;
    const maxBefore = statValue(state, hero, 'hp');
    const { events, emit } = collect(state);
    grantXp(state, hero, xpForLevel(30), 'kill', 'monster.cavern_brute', emit);
    expect(ofType(events, 'leveledUp').map((e) => e.level)).toEqual(Array.from({ length: 29 }, (_, i) => i + 2));
    expect(levelOf(hero)).toBe(30);
    expect(hero.actor.hp).toBe(10 + statValue(state, hero, 'hp') - maxBefore);
    expect(snapshot(state).domains.stats.members[hero.id]?.level).toEqual({ level: 30, xp: xpForLevel(30), levelXp: xpForLevel(30), nextXp: xpForLevel(31) });
    expect(checkInvariants(state)).toEqual([]);
  });

  it('gives nothing to monsters or the fallen', () => {
    const { state, hero } = setup();
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 4, y: 1 });
    const { events, emit } = collect(state);
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
    const state = createRun({ party: [HERO, MIRA], depth: 3, floorTexts: [D1, D2, D3], monsters: false }, 3);
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

describe('shared kill XP', () => {
  // Brannoc at x 1, Mira at x 7 (6 from Brannoc), Odo far off at x 20.
  const LONG = ['#######################', '#@.....@............@.#', '#######################'];

  it('splits with a group bonus: a lone killer gets it all, a group a little more in total', () => {
    expect(killShare(24, 1)).toBe(24);
    // ceil(base * (1 + KILL_GROUP_BONUS * (n - 1)) / n) with KILL_GROUP_BONUS = 0.55 (ETH-080).
    expect(killShare(24, 2)).toBe(19);
    expect(killShare(24, 3)).toBe(17);
    expect(killShare(4, 4)).toBe(3);
    expect(killShare(0, 2)).toBe(0);
  });

  it('goes to every living member near the killer or the victim, a healer standing back included', () => {
    const state = createRun({ party: [HERO, MIRA, ODO], floorText: LONG, depth: 1, monsters: false }, 5);
    const [brannoc, mira, odo] = state.party.map((id) => getEntity(state, id) as ActorEntity) as [ActorEntity, ActorEntity, ActorEntity];
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 2, y: 1 });
    expect(Math.abs(mira.pos.x - brannoc.pos.x)).toBe(KILL_SHARE_RADIUS);
    expect(Math.abs(odo.pos.x - toad.pos.x)).toBeGreaterThan(KILL_SHARE_RADIUS);
    const { events, emit } = collect(state);
    grantKillXp(state, brannoc, toad, 2, emit);
    const gained = ofType(events, 'xpGained');
    expect(gained.map((e) => [e.actor, e.amount, e.reason, e.source, e.classId])).toEqual([
      [brannoc.id, killShare(2 * XP_PER_THREAT, 2), 'kill', 'monster.mire_toad', CLASS_VANGUARD.id],
      [mira.id, killShare(2 * XP_PER_THREAT, 2), 'kill', 'monster.mire_toad', CLASS_VANGUARD.id],
    ]);
  });

  it('skips the fallen and gives nothing for a monster’s kill', () => {
    const state = createRun({ party: [HERO, MIRA, ODO], floorText: LONG, depth: 1, monsters: false }, 5);
    const [brannoc, mira] = state.party.map((id) => getEntity(state, id) as ActorEntity) as [ActorEntity, ActorEntity];
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 2, y: 1 });
    const rat = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 3, y: 1 });
    mira.actor.hp = 0;
    const { events, emit } = collect(state);
    grantKillXp(state, brannoc, toad, 2, emit);
    expect(ofType(events, 'xpGained').map((e) => [e.actor, e.amount])).toEqual([[brannoc.id, 2 * XP_PER_THREAT]]);
    events.length = 0;
    grantKillXp(state, rat, toad, 2, emit);
    expect(events).toEqual([]);
  });
});

describe('the record of it', () => {
  it('tracks XP per actor and per class for class Mastery, and shows it in the snapshot and the log', () => {
    const { state, hero } = setup({}, 7);
    const brute = spawnMonster(state, 'monster.cavern_brute', 'd1', { x: 3, y: 1 }) as ActorEntity;
    brute.actor.hp = 2;
    // One kill short of level 3, so the brute's XP is what levels the hero up.
    hero.growth = { level: 2, xp: xpForLevel(3) - 6 * XP_PER_THREAT, gained: { ...rollLevelGains(state, hero.id, CLASS_VANGUARD.id, 2) } };
    const events = runUntil(state, (es) => es.some((e) => e.type === 'leveledUp'));

    // What `RunResult.extras['track.xp']` holds once the run ends.
    const tracked = state.domains.run.trackers['track.xp'] as XpTrackerState;
    expect(tracked).toEqual({
      byActor: { [hero.id]: { classId: CLASS_VANGUARD.id, xp: xpForLevel(3), level: 3 } },
      byClass: { [CLASS_VANGUARD.id]: 6 * XP_PER_THREAT },
    });

    const view = snapshot(state).domains.stats.members[hero.id];
    expect(view?.level).toEqual({ level: 3, xp: xpForLevel(3), levelXp: 3 * XP_STEP, nextXp: 6 * XP_STEP });

    const logged = logLines(
      events.map((event, seq) => ({ seq, event })),
      () => 'Brannoc',
    );
    const levelLines = logged.filter((l) => l.text.includes('reaches level'));
    expect(levelLines.map((l) => l.text.split(':')[0])).toEqual(['Brannoc reaches level 3']);
    // A level-up is a highlight, placed where it happened.
    expect(levelLines[0]?.highlight?.kind.id).toBe('leveledUp');
    expect(logged.some((l) => l.text.includes('XP'))).toBe(false);
  });

  it('starts at level 1 with no XP', () => {
    const { state, hero } = setup();
    expect(snapshot(state).domains.stats.members[hero.id]?.level).toEqual({ level: 1, xp: 0, levelXp: 0, nextXp: XP_STEP });
  });

  it('flags a level that does not match the XP, bad rolled growth, and a level on a monster', () => {
    const { state, hero } = setup();
    hero.growth = { level: 3, xp: 0, gained: {} };
    expect(checkInvariants(state).some((p) => p.includes('level 3'))).toBe(true);
    hero.growth = { level: 1, xp: 0, gained: { grit: -1 } };
    expect(checkInvariants(state).some((p) => p.includes('grit growth -1'))).toBe(true);
    hero.growth = { level: 1, xp: 0, gained: {} };
    const toad = spawnMonster(state, 'monster.mire_toad', 'd1', { x: 4, y: 1 });
    toad.growth = { level: 1, xp: 0, gained: {} };
    expect(checkInvariants(state).some((p) => p.includes('no adventurer'))).toBe(true);
  });
});
