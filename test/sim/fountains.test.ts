/**
 * Fountains (ETH-072): the gen step, the Dry Wells cap, the `drink` action and its draughts, the
 * baseline's drinking rule, and the invariants.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core';
import { DRAUGHTS, FLOOR_HALLS } from '../../src/content';
import {
  BASELINE_RULES,
  carriesHealingPotion,
  checkInvariants,
  createRun,
  deserialize,
  discoveriesOf,
  ensureFloor,
  floorIdAt,
  floorRngState,
  generateFloor,
  getEntity,
  getFloor,
  performAction,
  planFloor,
  serialize,
  statValue,
  step,
  TEXT_FOUNTAIN_DRAUGHTS,
  Terrain,
  validateAction,
} from '../../src/sim';
import type { ActorEntity, Entity, EntityId, RunConfig, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

/** A small room: the hero at the west end, a fountain at the east end. */
const ROOM = ['#########', '#@.....{#', '#.......#', '#########'];

function setup(floorText: string[] = ROOM, extra: Partial<RunConfig> = {}): { state: RunState; hero: ActorEntity; fountain: Entity } {
  const state = createRun({ party: [HERO], floorText, depth: 1, ...extra }, 7);
  const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
  const fountain = Object.values(state.entities).find((e) => e.feature?.kind === 'fountain') as Entity;
  return { state, hero, fountain };
}

function draughtsOf(e: Entity): string[] {
  if (e.feature?.kind !== 'fountain') throw new Error(`entity ${e.id} is not a fountain`);
  return e.feature.draughts;
}

/** Puts the hero on the fountain and drinks once, returning the events. */
function drink(state: RunState, hero: ActorEntity, fountain: Entity): SimEvent[] {
  hero.pos = { x: fountain.pos.x, y: fountain.pos.y };
  const events: SimEvent[] = [];
  expect(validateAction(state, hero, { id: 'drink' })).toBeNull();
  performAction(state, hero, { id: 'drink' }, (e) => events.push({ ...e, turn: state.turn } as SimEvent));
  return events;
}

const fountainsOf = (plan: ReturnType<typeof planFloor>) => plan.features.filter((f) => f.feature.kind === 'fountain');

describe('gen.fountains', () => {
  it('places 0 to 2 fountains per floor on free floor tiles, each with 2 to 4 known draughts', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 100; seed++) {
      const plan = generateFloor(FLOOR_HALLS, new Rng(floorRngState(seed, 'd1')));
      const fountains = fountainsOf(plan);
      counts.add(fountains.length);
      expect(fountains.length).toBeLessThanOrEqual(2);
      for (const f of fountains) {
        expect(plan.terrain.get(f.pos.x, f.pos.y)).toBe(Terrain.Floor);
        expect(plan.features.filter((o) => o.pos.x === f.pos.x && o.pos.y === f.pos.y)).toHaveLength(1);
        if (f.feature.kind !== 'fountain') throw new Error('not a fountain');
        expect(f.feature.draughts.length).toBeGreaterThanOrEqual(2);
        expect(f.feature.draughts.length).toBeLessThanOrEqual(4);
        for (const id of f.feature.draughts) expect(DRAUGHTS.has(id)).toBe(true);
      }
    }
    expect([...counts].sort()).toEqual([0, 1, 2]);
  });

  it('rolls the same fountains for the same seed and floor', () => {
    const a = generateFloor(FLOOR_HALLS, new Rng(floorRngState(5, 'd3')));
    const b = generateFloor(FLOOR_HALLS, new Rng(floorRngState(5, 'd3')));
    expect(fountainsOf(a)).toEqual(fountainsOf(b));
  });

  it('draws every draught from the weighted table', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const f of fountainsOf(generateFloor(FLOOR_HALLS, new Rng(floorRngState(seed, 'd1'))))) {
        if (f.feature.kind === 'fountain') for (const d of f.feature.draughts) seen.add(d);
      }
    }
    expect([...seen].sort()).toEqual(DRAUGHTS.all().map((d) => d.id).sort());
  });
});

describe('maxFountains (the Dry Wells seam)', () => {
  /** A seed whose first floor has two fountains. */
  const seed = Array.from({ length: 50 }, (_, i) => i + 1).find(
    (s) => fountainsOf(generateFloor(FLOOR_HALLS, new Rng(floorRngState(s, 'd1')))).length === 2,
  ) as number;

  it('keeps today’s fountains when left out, and caps them otherwise without changing the rest of the floor', () => {
    const full = createRun({ party: [HERO] }, seed);
    const dry = createRun({ party: [HERO], maxFountains: 0 }, seed);
    const one = createRun({ party: [HERO], maxFountains: 1 }, seed);
    const planned = (s: RunState) => planFloor(s, floorIdAt(1));
    expect(fountainsOf(planned(full))).toHaveLength(2);
    expect(fountainsOf(planned(dry))).toHaveLength(0);
    expect(fountainsOf(planned(one))).toEqual(fountainsOf(planned(full)).slice(0, 1));
    const others = (s: RunState) => planned(s).features.filter((f) => f.feature.kind !== 'fountain');
    expect(others(dry)).toEqual(others(full));
    expect(planned(dry).terrain.toBuffer()).toEqual(planned(full).terrain.toBuffer());
    for (const s of [full, dry, one]) expect(checkInvariants(s)).toEqual([]);
  });

  it('applies to floors built later and to hand-built floors', () => {
    const state = createRun({ party: [HERO], maxFountains: 0, depth: 3 }, seed);
    ensureFloor(state, floorIdAt(2));
    ensureFloor(state, floorIdAt(3));
    expect(Object.values(state.entities).some((e) => e.feature?.kind === 'fountain')).toBe(false);
    expect(setup(ROOM, { maxFountains: 0 }).fountain).toBeUndefined();
  });

  it('rejects a cap that is not a whole number of 0 or more', () => {
    expect(() => createRun({ party: [HERO], maxFountains: -1 }, 1)).toThrow(/maxFountains/);
  });

  it('is checked by an invariant', () => {
    const { state } = setup(ROOM, { maxFountains: 1 });
    state.config.maxFountains = 0;
    expect(checkInvariants(state).join('\n')).toMatch(/floors\.fountains.*1 fountains, the config allows 0/);
  });
});

describe('drink', () => {
  it('drinks the next draught, applies its effects and runs the fountain dry', () => {
    const { state, hero, fountain } = setup();
    expect(draughtsOf(fountain)).toEqual(TEXT_FOUNTAIN_DRAUGHTS);
    hero.actor.hp = 1;

    const first = drink(state, hero, fountain);
    expect(first.map((e) => e.type)).toEqual(['drankFountain', 'healed']);
    expect(first[0]).toMatchObject({ actor: hero.id, fountain: fountain.id, draught: 'draught.mending', left: 2, floor: 'd1', pos: fountain.pos });
    expect(first[1]).toMatchObject({ amount: 8, source: 'draught.mending' });
    expect(hero.actor.hp).toBe(Math.min(9, statValue(state, hero, 'hp')));

    drink(state, hero, fountain);
    const last = drink(state, hero, fountain);
    expect(last.at(-1)).toMatchObject({ type: 'fountainRanDry', fountain: fountain.id, floor: 'd1' });
    expect(draughtsOf(fountain)).toEqual([]);
    expect(validateAction(state, hero, { id: 'drink' })).toBe('The fountain is dry');
    expect(checkInvariants(state)).toEqual([]);
  });

  it('needs a fountain underfoot', () => {
    const { state, hero } = setup();
    expect(validateAction(state, hero, { id: 'drink' })).toBe('There is no fountain here');
  });

  it('gives a short buff, a mild debuff or nothing for the other draughts', () => {
    const { state, hero, fountain } = setup();
    draughtsOf(fountain).splice(0, 3, 'draught.bright', 'draught.brackish', 'draught.still');
    const sight = statValue(state, hero, 'sight');
    const speed = statValue(state, hero, 'speed');

    expect(drink(state, hero, fountain)[1]).toMatchObject({ type: 'statusApplied', status: 'status.keen_eyed', turns: 40 });
    expect(statValue(state, hero, 'sight')).toBe(sight + 2);
    expect(drink(state, hero, fountain)[1]).toMatchObject({ type: 'statusApplied', status: 'status.queasy', turns: 20 });
    expect(statValue(state, hero, 'speed')).toBeLessThan(speed);
    expect(drink(state, hero, fountain).map((e) => e.type)).toEqual(['drankFountain', 'fountainRanDry']);
  });

  it('discovers the fountain and the draught for the Codex', () => {
    const { state, hero, fountain } = setup();
    const drank = drink(state, hero, fountain)[0] as SimEvent;
    expect(discoveriesOf(drank)).toEqual([
      { id: 'feature.fountain', mark: 'used' },
      { id: 'draught.mending', mark: 'seen' },
    ]);
  });

  it('survives a save and load mid-fountain', () => {
    const { state, hero, fountain } = setup();
    drink(state, hero, fountain);
    const copy = deserialize(serialize(state));
    expect(draughtsOf(getEntity(copy, fountain.id))).toEqual(draughtsOf(fountain));
  });
});

describe('baseline drinking', () => {
  it('walks to a known fountain and drinks when below half HP with no healing potion', () => {
    const { state, hero, fountain } = setup();
    expect(carriesHealingPotion(state, hero)).toBe(false);
    hero.actor.hp = 1;
    const events: SimEvent[] = [];
    for (let i = 0; i < 12 && !events.some((e) => e.type === 'drankFountain'); i++) events.push(...step(state, []));
    const fired = events.filter((e): e is Extract<SimEvent, { type: 'ruleFired' }> => e.type === 'ruleFired');
    expect(fired[0]).toMatchObject({
      rule: { set: 'baseline', index: BASELINE_RULES.findIndex((r) => r.action.id === 'act.drink_fountain') },
      condition: 'cond.hurt_no_healing',
      action: 'act.drink_fountain',
    });
    expect(fired[0]?.detail).toMatch(/heading for a fountain, 6 turns away \(HP 1\/\d+, below 50%, and no healing potion\)/);
    expect(events.find((e) => e.type === 'drankFountain')).toMatchObject({ actor: hero.id, fountain: fountain.id });
    expect(hero.pos).toEqual(fountain.pos);
  });

  it('leaves the fountain alone while carrying a healing potion, and drinks the potion at low HP (ETH-061)', () => {
    const { state, hero, fountain } = setup();
    hero.inventory = { items: [{ def: 'item.mending_draught', qty: 1 }] };
    expect(carriesHealingPotion(state, hero)).toBe(true);
    // Below half but above the potion's 35%: neither the fountain nor the potion.
    const max = statValue(state, hero, 'hp');
    hero.actor.hp = Math.floor(max * 0.45);
    let events: SimEvent[] = [];
    for (let i = 0; i < 12; i++) events.push(...step(state, []));
    expect(events.some((e) => e.type === 'drankFountain')).toBe(false);
    expect(events.some((e) => e.type === 'ruleFired' && e.action === 'act.drink_fountain')).toBe(false);
    expect(draughtsOf(fountain)).toHaveLength(3);
    // Lower still: the potion, not the fountain.
    hero.actor.hp = 1;
    events = step(state, []);
    expect(events.filter((e) => e.type === 'used').map((e) => e.type === 'used' && e.item)).toEqual(['item.mending_draught']);
    expect(events.some((e) => e.type === 'drankFountain')).toBe(false);
  });

  it('stops drinking once healthy, and leaves fountains alone when not hurt', () => {
    const { state, hero, fountain } = setup();
    const events: SimEvent[] = [];
    for (let i = 0; i < 20; i++) events.push(...step(state, []));
    expect(events.some((e) => e.type === 'drankFountain')).toBe(false);
    expect(draughtsOf(fountain)).toHaveLength(3);
    expect(hero.actor.hp).toBe(statValue(state, hero, 'hp'));
  });

  it('ignores a fountain it remembers as dry', () => {
    const { state, hero, fountain } = setup();
    draughtsOf(fountain).length = 0;
    hero.actor.hp = 1;
    const events: SimEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(...step(state, []));
    expect(events.some((e) => e.type === 'ruleFired' && e.action === 'act.drink_fountain')).toBe(false);
  });

  it('does not count a fountain on another floor', () => {
    const { state, hero } = setup(['#####', '#@..#', '#####']);
    hero.actor.hp = 1;
    expect(getFloor(state, 'd1').entities.some((id) => getEntity(state, id).feature?.kind === 'fountain')).toBe(false);
    const events = step(state, []);
    expect(events.some((e) => e.type === 'ruleFired' && e.action === 'act.drink_fountain')).toBe(false);
  });
});
