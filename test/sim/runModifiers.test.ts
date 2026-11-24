/**
 * Run-wide modifiers (ETH-115): the `stats.run` bundle source by scope, mid-run changes and
 * expiry, flags and `cond.run_flag`, the reward multiplier before the wipe loss, and saves.
 * Fixed seed, hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { defineBundle, defineUpgrade } from '../../src/content';
import { applyRunResult, buildRunConfig, defaultRunChoices, newProfile, upgradeRunModifiers } from '../../src/meta';
import type { Profile } from '../../src/meta';
import {
  addRunModifier,
  checkInvariants,
  checkRequirement,
  CONDITIONS,
  createRun,
  deserialize,
  discoveriesOf,
  getEntity,
  getStat,
  removeRunModifier,
  rewardMultiplier,
  runFlag,
  runResult,
  serialize,
  snapshot,
  spawnMonster,
  statValue,
  step,
  waitDecide,
} from '../../src/sim';
import type { ActorEntity, EntityId, RunConfig, RunModifierConfig, RunState, SimEvent } from '../../src/sim';

const GLOOM = defineBundle({
  id: 'bundle.test_gloom',
  name: 'Test Gloom',
  description: 'A test darkness.',
  tags: [],
  bundle: { modifiers: [{ stat: 'sight', op: 'add', value: -2 }] },
});
const TOUGH = defineBundle({
  id: 'bundle.test_tough',
  name: 'Test Tough',
  description: 'A test toughness.',
  tags: [],
  bundle: { modifiers: [{ stat: 'hp', op: 'add', value: 5 }] },
});
defineUpgrade({
  id: 'upgrade.test_lanterns',
  name: 'Test Lanterns',
  description: 'Lights the way for the whole run.',
  tags: [],
  building: 'building.guild_hall',
  tier: 9,
  column: 1,
  cost: { renown: 1 },
  requires: [],
  grants: [{ kind: 'bundle', scope: 'run', bundle: { modifiers: [{ stat: 'sight', op: 'add', value: 1 }] } }],
});

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['#######', '#<...>#', '#######'];
const D3 = ['#####', '#<..#', '#####'];
const BASE: RunConfig = { party: [HERO], depth: 3, floorTexts: [D1, D2, D3], monsters: false };

const OMEN: RunModifierConfig = {
  key: 'omen.test_gloom',
  source: { id: 'bundle.test_gloom', label: 'Gloom (Omen, rank 2)' },
  scope: 'party',
  bundle: GLOOM.id,
  potency: 1,
  flags: ['omen.dry_wells'],
  rewardBonus: 0.5,
};

function setup(config: Partial<RunConfig> = {}): { state: RunState; hero: ActorEntity } {
  const state = createRun({ ...BASE, ...config }, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

function steps(state: RunState, n: number, opts = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n && state.domains.run.end === null; i++) {
    events.push(...step(state, [], opts));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('run modifiers: the stats.run bundle source', () => {
  it('a party-scope modifier changes only the party, with a tooltip part naming it', () => {
    const { state, hero } = setup({ runModifiers: [OMEN] });
    const monster = spawnMonster(state, 'monster.mossling', 'd1', { x: 5, y: 1 });
    const plain = setup();
    const plainMonster = spawnMonster(plain.state, 'monster.mossling', 'd1', { x: 5, y: 1 });
    expect(statValue(state, hero, 'sight')).toBe(statValue(plain.state, plain.hero, 'sight') - 2);
    expect(getStat(state, hero, 'sight').parts).toContainEqual({
      op: 'add',
      value: -2,
      source: { id: 'bundle.test_gloom', label: 'Gloom (Omen, rank 2)' },
    });
    expect(statValue(state, monster, 'sight')).toBe(statValue(plain.state, plainMonster, 'sight'));
    expect(checkInvariants(state)).toEqual([]);
  });

  it('a monster-scope modifier changes only monsters, at its potency', () => {
    const mod: RunModifierConfig = { key: 'omen.thriving', source: { id: 'bundle.test_tough', label: 'Thriving Dark' }, scope: 'monsters', bundle: TOUGH.id, potency: 2 };
    const { state, hero } = setup({ runModifiers: [mod] });
    const plain = setup();
    const monster = spawnMonster(state, 'monster.mossling', 'd1', { x: 5, y: 1 });
    const plainMonster = spawnMonster(plain.state, 'monster.mossling', 'd1', { x: 5, y: 1 });
    expect(statValue(state, monster, 'hp')).toBe(statValue(plain.state, plainMonster, 'hp') + 10);
    expect(getStat(state, monster, 'hp').parts).toContainEqual({ op: 'add', value: 10, source: { id: 'bundle.test_tough', label: 'Thriving Dark' } });
    expect(statValue(state, hero, 'hp')).toBe(statValue(plain.state, plain.hero, 'hp'));
  });

  it('`all` reaches both sides', () => {
    const { state, hero } = setup({ runModifiers: [{ ...OMEN, scope: 'all' }] });
    const monster = spawnMonster(state, 'monster.mossling', 'd1', { x: 5, y: 1 });
    expect(getStat(state, hero, 'sight').parts.some((p) => p.source.label === 'Gloom (Omen, rank 2)')).toBe(true);
    expect(getStat(state, monster, 'sight').parts.some((p) => p.source.label === 'Gloom (Omen, rank 2)')).toBe(true);
  });
});

describe('run modifiers: changes during the run', () => {
  it('announces the config modifiers on the first turn and discovers their source', () => {
    const { state } = setup({ runModifiers: [OMEN] });
    const events = step(state, [], { decide: waitDecide });
    const added = events.filter((e) => e.type === 'runModifierAdded');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ key: OMEN.key, atStart: true, rewardBonus: 0.5 });
    expect(discoveriesOf(added[0] as SimEvent)).toEqual([{ id: 'bundle.test_gloom', mark: 'seen' }]);
    expect(steps(state, 3, { decide: waitDecide }).some((e) => e.type === 'runModifierAdded')).toBe(false);
  });

  it('adds and removes a modifier mid-run, emitting events and clamping lowered maxima', () => {
    const { state, hero } = setup({ runModifiers: [{ key: 'vet', source: { id: 'bundle.test_tough', label: 'Old Tor' }, scope: 'party', bundle: TOUGH.id }] });
    const events: SimEvent[] = [];
    const emit = (e: Omit<SimEvent, 'turn'>) => events.push({ ...e, turn: state.turn } as SimEvent);
    const full = statValue(state, hero, 'hp');
    expect(hero.actor.hp).toBe(full);

    addRunModifier(state, OMEN, emit);
    expect(runFlag(state, 'omen.dry_wells')).toBe(true);
    expect(statValue(state, hero, 'sight')).toBe(getStat(setup().state, setup().hero, 'sight').value - 2);
    expect(events.map((e) => e.type)).toEqual(['runModifierAdded']);

    expect(removeRunModifier(state, 'vet', emit)).toBe(true);
    expect(removeRunModifier(state, 'vet', emit)).toBe(false);
    expect(statValue(state, hero, 'hp')).toBe(full - 5);
    expect(hero.actor.hp).toBe(full - 5);
    expect(events.at(-1)).toMatchObject({ type: 'runModifierRemoved', key: 'vet', reason: 'removed' });

    // The same key replaces rather than doubling.
    addRunModifier(state, { ...OMEN, rewardBonus: 1 }, emit);
    expect(state.domains.stats.runModifiers).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'runModifierAdded', replaced: true });
    expect(rewardMultiplier(state)).toBe(2);
    expect(() => addRunModifier(state, { ...OMEN, key: 'bad', bundle: 'bundle.nope' }, emit)).toThrow(/unknown bundle/);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('a floor-bound modifier ends when the party leaves that floor', () => {
    const { state, hero } = setup({ runModifiers: [{ ...OMEN, until: { floor: 'd1' } }] });
    let events: SimEvent[] = [];
    for (let i = 0; i < 100 && hero.floor === 'd1'; i++) events = steps(state, 1);
    expect(hero.floor).toBe('d2');
    expect(events.find((e) => e.type === 'runModifierRemoved')).toMatchObject({ key: OMEN.key, reason: 'expired' });
    expect(state.domains.stats.runModifiers).toEqual([]);
    expect(getStat(state, hero, 'sight').parts.some((p) => p.source.id === 'bundle.test_gloom')).toBe(false);
  });

  it('a turn-bound modifier ends on its turn', () => {
    const { state } = setup({ runModifiers: [{ ...OMEN, until: { turn: 3 } }] });
    const events = steps(state, 6, { decide: waitDecide });
    const removed = events.find((e) => e.type === 'runModifierRemoved');
    expect(removed).toMatchObject({ reason: 'expired', turn: 3 });
    expect(runFlag(state, 'omen.dry_wells')).toBe(false);
  });
});

describe('run modifiers: flags', () => {
  it('cond.run_flag reads a flag as a run-scope requirement', () => {
    const { state } = setup({ runModifiers: [OMEN] });
    const cond = CONDITIONS.get('cond.run_flag');
    expect(cond.scope).toBe('run');
    expect(checkRequirement({ state }, { cond: 'cond.run_flag', params: { flag: 'omen.dry_wells' } })).toMatchObject({ ok: true });
    expect(checkRequirement({ state }, { cond: 'cond.run_flag', params: { flag: 'doctrine.seek_stairs' } }).ok).toBe(false);
    expect(runFlag(setup().state, 'omen.dry_wells')).toBe(false);
  });
});

describe('run modifiers: rewards', () => {
  it('is exactly 1 with no bonuses, and 1 + the sum of bonuses otherwise', () => {
    expect(rewardMultiplier(setup().state)).toBe(1);
    const two = setup({ runModifiers: [OMEN, { ...OMEN, key: 'omen.b', rewardBonus: 0.25 }] });
    expect(rewardMultiplier(two.state)).toBe(1.75);
  });

  it('scales at-risk rewards, and a wipe loses 25% of the multiplied total', () => {
    const plain = setup();
    const boosted = setup({ runModifiers: [OMEN] });
    for (const s of [plain, boosted]) for (let i = 0; i < 300 && s.state.domains.floors.deepest < 3; i++) step(s.state, []);
    const base = plain.state.domains.run.rewards.atRisk.renown as number;
    expect(base).toBeGreaterThan(0);
    expect(boosted.state.domains.run.rewards.atRisk.renown).toBe(Math.floor(base * 1.5));
    expect(snapshot(boosted.state).domains.stats.rewardMultiplier).toBe(1.5);

    boosted.hero.actor.hp = 0;
    const events = step(boosted.state, []);
    expect(checkInvariants(boosted.state)).toEqual([]);
    const result = runResult(boosted.state);
    const multiplied = result.atRisk.renown as number;
    expect(multiplied).toBeGreaterThanOrEqual(Math.floor(base * 1.5));
    expect(result.lost).toEqual({ renown: multiplied - Math.floor(multiplied * 0.75) });
    expect(events.find((e) => e.type === 'earningsLost')).toMatchObject({ atRisk: result.atRisk, lost: result.lost });
    const after = applyRunResult(newProfile(), result);
    expect(after.currencies.renown).toBe(Math.floor(multiplied * 0.75));
  });
});

describe('run modifiers: saves, snapshot and meta', () => {
  it('survives a serialize round-trip', () => {
    const { state } = setup({ runModifiers: [{ ...OMEN, until: { floor: 'd1' } }] });
    steps(state, 2, { decide: waitDecide });
    const copy = deserialize(serialize(state));
    expect(copy.domains.stats).toEqual(state.domains.stats);
    expect(copy.domains.stats.runModifiers).not.toBe(state.domains.stats.runModifiers);
    expect(checkInvariants(copy)).toEqual([]);
  });

  it('lists the modifiers in the snapshot with tooltip text', () => {
    const { state } = setup({ runModifiers: [{ ...OMEN, until: { floor: 'd1' } }] });
    const view = snapshot(state).domains.stats.runModifiers;
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ key: OMEN.key, source: OMEN.source, potency: 1 });
    expect(view[0]?.text).toBe('The party: Sight −2. Sets omen.dry_wells. Rewards +50%. Ends when the party leaves floor 1.');
  });

  it('turns owned run-scope upgrade grants into run modifiers credited to the node', () => {
    const profile: Profile = { ...newProfile(), upgrades: { owned: ['upgrade.test_lanterns'], ranks: {} } };
    expect(upgradeRunModifiers(profile)).toEqual([
      { key: 'upgrade.test_lanterns', source: { id: 'upgrade.test_lanterns', label: 'Test Lanterns' }, scope: 'party', bundle: 'upgrade.test_lanterns' },
    ]);
    const config = buildRunConfig(profile, defaultRunChoices(), 3);
    expect(config.runModifiers?.map((m) => m.key)).toEqual(['upgrade.test_lanterns']);
    const state = createRun(config, 3);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    expect(getStat(state, hero, 'sight').parts).toContainEqual({ op: 'add', value: 1, source: { id: 'upgrade.test_lanterns', label: 'Test Lanterns' } });
    expect(buildRunConfig(newProfile(), defaultRunChoices(), 3).runModifiers).toBeUndefined();
  });

  it('rejects a malformed config', () => {
    expect(() => setup({ runModifiers: [OMEN, OMEN] })).toThrow(/used twice/);
    expect(() => setup({ runModifiers: [{ ...OMEN, scope: 'nobody' as never }] })).toThrow(/unknown scope/);
  });
});
