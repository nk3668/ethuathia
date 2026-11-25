/**
 * Gated run modifiers (ETH-187): Extraction Drills speed an adventurer up only while it flees, and
 * Waymark Lanterns help only once the party has turned back. Fixed seeds, hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { UPGRADE_EXTRACTION_DRILLS, UPGRADE_WAYMARK_LANTERNS } from '../../src/content';
import { buildRunConfig, defaultRunChoices, newProfile } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { checkInvariants, createRun, getEntity, getFloor, getMemory, getStat, spawnMonster, step } from '../../src/sim';
import type { ActorEntity, AiActor, RunConfig, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const W = 90;
const wall = '#'.repeat(W);
const HALL = [wall, `#${'.'.repeat(2)}@${'.'.repeat(W - 5)}#`, wall];

const own = (ranks: Record<string, number>): Profile => {
  const profile = newProfile();
  return { ...profile, upgrades: { owned: Object.keys(ranks), ranks: Object.fromEntries(Object.entries(ranks).filter(([, r]) => r > 1)) } };
};
const configFor = (profile: Profile): RunConfig => ({
  ...buildRunConfig(profile, defaultRunChoices(), 1),
  party: [HERO],
  floorText: HALL,
  depth: 1,
  monsters: false,
});
const drills = (rank: number) => own({ [UPGRADE_EXTRACTION_DRILLS.id]: rank });

function setup(profile: Profile): { state: RunState; hero: AiActor } {
  const state = createRun(configFor(profile), 1);
  const hero = getEntity(state, state.party[0] as number) as AiActor;
  const cells = getFloor(state, 'd1').terrain.cells;
  const memory = getMemory(state, 'd1').terrain.cells;
  for (let i = 0; i < cells.length; i++) memory[i] = (cells[i] as number) + 1;
  return { state, hero };
}

const speed = (state: RunState, hero: ActorEntity) => getStat(state, hero, 'speed');

describe('Extraction Drills', () => {
  it('add speed only while the adventurer is fleeing, +10 a rank', () => {
    const { state, hero } = setup(drills(3));
    const calm = speed(state, hero).value;
    hero.ai.memory.fleeing = { since: 0, lastSeen: 0, held: 0 };
    const running = speed(state, hero);
    expect(running.value).toBe(calm + 30);
    // The tooltip names the node and the gate.
    expect(running.parts.filter((p) => p.source.id === UPGRADE_EXTRACTION_DRILLS.id).map((p) => p.source.label)).toEqual(
      Array(3).fill('Extraction Drills, while fleeing'),
    );
    hero.ai.memory.fleeing = null;
    expect(speed(state, hero).value).toBe(calm);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('let a fleeing adventurer outpace a foe that otherwise keeps up', () => {
    const gap = (profile: Profile): number => {
      const { state, hero } = setup(profile);
      const foe = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 1, y: 1 }) as AiActor;
      hero.actor.hp = Math.max(1, Math.round(hero.actor.hp * 0.2));
      hero.ai.memory.fleeing = { since: 0, lastSeen: 0, held: 0 };
      for (let i = 0; i < 60; i++) {
        if (hero.actor.hp < 3) hero.actor.hp = 3;
        step(state, []);
      }
      return hero.pos.x - foe.pos.x;
    };
    const plain = gap(newProfile());
    const drilled = gap(drills(3));
    expect(drilled).toBeGreaterThan(plain);
  });
});

describe('Waymark Lanterns', () => {
  const lanterns = () => own({ [UPGRADE_WAYMARK_LANTERNS.id]: 1 });

  it('help only once the party has turned back, retreat included', () => {
    const { state, hero } = setup(lanterns());
    const down = { speed: speed(state, hero).value, sight: getStat(state, hero, 'sight').value };
    state.domains.run.leaving = { turn: state.turn, reason: 'ordered', by: null, announced: false };
    expect(speed(state, hero).value).toBe(down.speed + 10);
    expect(getStat(state, hero, 'sight').value).toBe(down.sight + 2);
    expect(speed(state, hero).parts.some((p) => p.source.label === 'Waymark Lanterns, on the return trip')).toBe(true);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('do nothing on the way down or for monsters', () => {
    const { state, hero } = setup(lanterns());
    const before = speed(state, hero).value;
    const foe = spawnMonster(state, 'monster.gloam_rat', 'd1', { x: 5, y: 1 }) as ActorEntity;
    const foeBefore = speed(state, foe).value;
    const plain = setup(newProfile());
    expect(before).toBe(speed(plain.state, plain.hero).value);
    state.domains.run.leaving = { turn: state.turn, reason: 'ordered', by: null, announced: false };
    expect(speed(state, foe).value).toBe(foeBefore);
  });
});
