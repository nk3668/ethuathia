/**
 * Field Rations (ETH-187): the Guild Hall node issues rations as starting kit, and the baseline
 * eats one when hurt with nothing in sight. Fixed seeds, hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { ITEM_FIELD_RATION, STATUS_REGENERATING, UPGRADE_FIELD_RATIONS } from '../../src/content';
import { buildRunConfig, defaultRunChoices, newProfile } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { checkInvariants, createRun, getEntity, getFloor, getMemory, itemSale, soldOnExit, spawnMonster, step } from '../../src/sim';
import type { ActorEntity, AiActor, RunState, SimEvent } from '../../src/sim';

const W = 40;
const wall = '#'.repeat(W);
const HALL = [wall, `#${'.'.repeat(9)}@${'.'.repeat(W - 12)}#`, wall];
const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

const withRations = (rank: number): Profile => {
  const profile = newProfile();
  return { ...profile, upgrades: { owned: [UPGRADE_FIELD_RATIONS.id], ranks: rank > 1 ? { [UPGRADE_FIELD_RATIONS.id]: rank } : {} } };
};
const rationsIn = (e: ActorEntity): number => (e.inventory?.items ?? []).filter((i) => i.def === ITEM_FIELD_RATION.id).reduce((n, i) => n + i.qty, 0);
const regen = (e: ActorEntity) => e.stats?.statuses.find((s) => s.status === STATUS_REGENERATING.id);

function hall(rank: number, party = [HERO]): { state: RunState; hero: AiActor } {
  const config = { ...buildRunConfig(withRations(rank), defaultRunChoices(), 1), party, floorText: HALL, depth: 1, monsters: false };
  const state = createRun(config, 1);
  const hero = getEntity(state, state.party[0] as number) as AiActor;
  const cells = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < cells.length; i++) memory[i] = (cells[i] as number) + 1;
  return { state, hero };
}

const fired = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: 'ruleFired' }> => e.type === 'ruleFired');

describe('the Field Rations node', () => {
  it('issues one ration per rank to every adventurer, as kit that is never sold', () => {
    for (const rank of [1, 2, 3]) {
      const { state } = hall(rank, [HERO, MIRA]);
      for (const id of state.party) {
        const member = getEntity(state, id) as ActorEntity;
        expect(rationsIn(member)).toBe(rank);
        expect(member.inventory?.items.every((i) => i.def !== ITEM_FIELD_RATION.id || soldOnExit(i) === false)).toBe(true);
      }
      expect(itemSale(state, 'retreat')).toMatchObject({ items: 0, trophies: 0 });
    }
  });

  it('adds nothing without the node', () => {
    const config = buildRunConfig(newProfile(), defaultRunChoices(), 1);
    expect(config.startStock).toBeUndefined();
  });

  it('is not loot: rations are only ever issued', () => {
    expect(ITEM_FIELD_RATION.loot).toBeUndefined();
  });
});

describe('eating a ration', () => {
  it('a hurt adventurer with nothing in sight eats one and starts regenerating', () => {
    const { state, hero } = hall(2);
    hero.actor.hp = Math.round(hero.actor.hp * 0.5);
    const events = step(state, []);
    const f = fired(events).find((e) => e.actor === hero.id);
    expect(f?.action).toBe('act.eat_ration');
    expect(f?.detail).toMatch(/eating a field ration/i);
    expect(rationsIn(hero)).toBe(1);
    expect(regen(hero)?.remaining).toBeGreaterThan(0);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('heals over the turns that follow', () => {
    const { state, hero } = hall(1);
    const hp0 = (hero.actor.hp = Math.round(hero.actor.hp * 0.4));
    for (let i = 0; i < 6; i++) step(state, []);
    expect(hero.actor.hp).toBeGreaterThan(hp0 + 2);
  });

  it('does not eat at full HP, or above the threshold', () => {
    const { state, hero } = hall(1);
    step(state, []);
    expect(rationsIn(hero)).toBe(1);
    hero.actor.hp = Math.ceil(hero.actor.hp * 0.9);
    step(state, []);
    expect(rationsIn(hero)).toBe(1);
  });

  it('does not eat while a threat is in sight', () => {
    const { state, hero } = hall(1);
    const foe = spawnMonster(state, 'monster.pit_badger', 'd1', { x: 16, y: 1 }) as AiActor;
    foe.ai.rules = [];
    hero.actor.hp = Math.round(hero.actor.hp * 0.5);
    const events = step(state, []);
    expect(fired(events).find((e) => e.actor === hero.id)?.action).not.toBe('act.eat_ration');
    expect(rationsIn(hero)).toBe(1);
  });

  it('does not waste a second ration while regeneration has turns to run, and eats it once it runs low', () => {
    const { state, hero } = hall(2);
    hero.actor.hp = Math.round(hero.actor.hp * 0.3);
    step(state, []);
    expect(rationsIn(hero)).toBe(1);
    for (let i = 0; i < 3; i++) {
      hero.actor.hp = Math.min(hero.actor.hp, Math.round(hero.actor.hp * 0.3));
      step(state, []);
    }
    expect(rationsIn(hero)).toBe(1);
    // With the status nearly spent, another is eaten and renews it rather than adding to it.
    const status = regen(hero);
    if (status === undefined) throw new Error('not regenerating');
    status.remaining = 2;
    hero.actor.hp = Math.round(hero.actor.hp * 0.3);
    step(state, []);
    expect(rationsIn(hero)).toBe(0);
    expect(regen(hero)?.remaining).toBeGreaterThan(5);
    expect(hero.stats?.statuses.filter((s) => s.status === STATUS_REGENERATING.id)).toHaveLength(1);
  });
});
