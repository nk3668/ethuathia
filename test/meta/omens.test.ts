/**
 * The Omen system (ETH-185): ranked defs, locked until a town node unlocks them, switched on per
 * run on the Prepare screen, paid through one reward multiplier before the wipe loss, and recorded
 * in the config, the result and the run history. Fixture Omens stand in; the first real ones are ETH-186.
 */
import { describe, expect, it } from 'vitest';
import { defineOmen, defineUpgrade, OMEN_KIND } from '../../src/content';
import {
  applyRunResult,
  activeOmens,
  availableOmens,
  buildRunConfig,
  checkRunConfig,
  completeRunChoices,
  decodeSave,
  defaultRunChoices,
  encodeSave,
  multiplierText,
  newProfile,
  omenBreakdown,
  omenMultiplier,
  startRun,
} from '../../src/meta';
import type { Profile, RunChoices } from '../../src/meta';
import {
  checkGame,
  checkInvariants,
  createRun,
  getEntity,
  getStat,
  rewardMultiplier,
  runResult,
  serialize,
  snapshot,
  step,
} from '../../src/sim';
import type { ActorEntity, EntityId, RunConfig, SimEvent } from '../../src/sim';

const GLOOM = defineOmen({
  id: 'omen.test_gloom',
  name: 'Test Gloom',
  description: 'The dark closes in.',
  hint: 'Something about the dark.',
  tags: [],
  ranks: [
    { reward: 0.1, text: 'Monsters see a little further.', bundle: { modifiers: [{ stat: 'sight', op: 'add', value: 1 }] } },
    { reward: 0.25, text: 'Monsters see much further.', bundle: { modifiers: [{ stat: 'sight', op: 'add', value: 3 }] } },
    { reward: 0.5, text: 'Monsters see everything.', flags: ['omen.test_gloom'] },
  ],
});
const THIRST = defineOmen({
  id: 'omen.test_thirst',
  name: 'Test Thirst',
  description: 'The wells run dry.',
  hint: 'Something about wells.',
  tags: [],
  ranks: [{ reward: 0.2, text: 'No fountains.', flags: ['omen.dry_wells'] }],
});
const UNLOCK_GLOOM = defineUpgrade({
  id: 'upgrade.test_unlock_gloom',
  name: 'Test Gloom Writ',
  description: 'Unlocks Test Gloom.',
  tags: [],
  building: 'building.guild_hall',
  tier: 30,
  column: 0,
  cost: { renown: 1 },
  requires: [],
  grants: [{ kind: 'unlock', id: GLOOM.id }],
});

const own = (profile: Profile, ...ids: string[]): Profile => ({ ...profile, upgrades: { ...profile.upgrades, owned: [...profile.upgrades.owned, ...ids] } });
const withGloom = (): Profile => own(newProfile(), UNLOCK_GLOOM.id);
const choose = (ranks: Record<string, number>): RunChoices => ({ ...defaultRunChoices(), omens: { ranks } });

describe('Omen content', () => {
  it('passes validation, including the unlock node pointing at an Omen that exists', () => {
    expect(checkGame()).toEqual([]);
  });

  it('refuses a rank without an effect, rewards that do not rise, and too many ranks', () => {
    const base = { id: 'omen.test_bad', name: 'Bad', description: 'Bad.', tags: [] };
    const flag = { text: 'x', flags: ['f'] };
    const problems = (ranks: unknown[]) => {
      const r = OMEN_KIND.schema.safeParse({ ...base, ranks });
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(problems([{ reward: 0.1, text: 'x' }]).join()).toContain('bundle or flags');
    expect(problems([{ ...flag, reward: 0.2 }, { ...flag, reward: 0.2 }]).join()).toContain('above the previous rank');
    expect(problems([{ ...flag, reward: 0.1 }])).toEqual([]);
    expect(problems(Array.from({ length: 6 }, (_, i) => ({ ...flag, reward: 0.1 * (i + 1) }))).join()).toContain('at most');
    expect(problems([])).not.toEqual([]);
    expect(problems([{ ...flag, reward: 0 }])).not.toEqual([]);
  });
});

describe('unlocking and choosing Omens', () => {
  it('starts locked: no Omen is available, and a choice for one changes nothing', () => {
    expect(availableOmens(newProfile())).toEqual([]);
    const config = buildRunConfig(newProfile(), choose({ [GLOOM.id]: 2 }), 3);
    expect(config.omens).toBeUndefined();
    expect(config.runModifiers).toBeUndefined();
  });

  it('an Omen no node unlocks stays locked', () => {
    expect(availableOmens(withGloom()).map((d) => d.id)).toEqual([GLOOM.id]);
    expect(THIRST.ranks).toHaveLength(1);
  });

  it('owning the node turns nothing on: rank 0 is off', () => {
    const config = buildRunConfig(withGloom(), defaultRunChoices(), 3);
    expect(config.omens).toBeUndefined();
    expect(config).toEqual(buildRunConfig(newProfile(), defaultRunChoices(), 3));
    expect(buildRunConfig(withGloom(), choose({ [GLOOM.id]: 0 }), 3).omens).toBeUndefined();
  });

  it('puts a chosen rank in the config, ignoring ranks the Omen does not have', () => {
    expect(buildRunConfig(withGloom(), choose({ [GLOOM.id]: 2 }), 3).omens).toEqual([{ id: GLOOM.id, rank: 2 }]);
    expect(activeOmens(withGloom(), { ranks: { [GLOOM.id]: 4 } })).toEqual([]);
    expect(activeOmens(withGloom(), { ranks: { [GLOOM.id]: -1 } })).toEqual([]);
  });

  it('prices the choice: 1 plus the sum of the chosen ranks, itemized', () => {
    expect(omenMultiplier([])).toBe(1);
    const active = [
      { id: GLOOM.id, rank: 2 },
      { id: THIRST.id, rank: 1 },
    ];
    expect(omenBreakdown(active).map((l) => [l.name, l.rank, l.bonus])).toEqual([
      ['Test Gloom', 2, 0.25],
      ['Test Thirst', 1, 0.2],
    ]);
    expect(omenMultiplier(active)).toBeCloseTo(1.45);
    expect(multiplierText(1.45)).toBe('×1.45');
    expect(multiplierText(1)).toBe('×1.00');
  });

  it('is remembered in a save, falls back when damaged, and old choices without it load as off', () => {
    const profile: Profile = { ...withGloom(), prepare: { choices: choose({ [GLOOM.id]: 3 }) } };
    expect(decodeSave(encodeSave(profile, 1))).toMatchObject({ ok: true, profile: { prepare: { choices: { omens: { ranks: { [GLOOM.id]: 3 } } } } } });
    const damaged = JSON.parse(encodeSave(profile, 1)) as { slices: { prepare: { data: { choices: Record<string, unknown> } } } };
    damaged.slices.prepare.data.choices.omens = 'nope';
    expect(decodeSave(JSON.stringify(damaged))).toMatchObject({ ok: true, profile: { prepare: { choices: { omens: { ranks: {} } } } } });
    delete damaged.slices.prepare.data.choices.omens;
    expect(decodeSave(JSON.stringify(damaged))).toMatchObject({ ok: true, profile: { prepare: { choices: { omens: { ranks: {} } } } } });
    expect(completeRunChoices({}).omens).toEqual({ ranks: {} });
  });

  it('rejects a config naming an Omen or rank that does not exist', () => {
    const config = buildRunConfig(withGloom(), defaultRunChoices(), 3);
    const run = (omens: RunConfig['omens']) => () => createRun({ ...BASE, omens }, 3);
    expect(run([{ id: GLOOM.id, rank: 2 }])).not.toThrow();
    expect(run([{ id: 'omen.nobody', rank: 1 }])).toThrow(/unknown Omen/);
    expect(run([{ id: GLOOM.id, rank: 4 }])).toThrow(/which it does not have/);
    expect(run([{ id: GLOOM.id, rank: 1 }, { id: GLOOM.id, rank: 2 }])).toThrow(/twice/);
    expect(checkRunConfig({ ...config, omens: [{ id: GLOOM.id, rank: 0 }] }).join()).toContain('rank 0');
  });
});

const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['#######', '#<...>#', '#######'];
const D3 = ['#####', '#<..#', '#####'];
const BASE: RunConfig = { party: [{ name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' }], depth: 3, floorTexts: [D1, D2, D3], monsters: false };

function steps(state: ReturnType<typeof createRun>, n: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n && state.domains.run.end === null; i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

describe('an Omen in a run', () => {
  it('becomes a run modifier credited by rank, announced in the log at the start, and discovered', () => {
    const state = createRun({ ...BASE, omens: [{ id: GLOOM.id, rank: 2 }] }, 1);
    const [mod] = state.domains.stats.runModifiers;
    expect(mod).toMatchObject({ key: GLOOM.id, scope: 'monsters', rewardBonus: 0.25, source: { id: GLOOM.id, label: 'Test Gloom (Omen, rank 2)' } });
    expect(snapshot(state).domains.stats.runModifiers[0]?.text).toBe('Monsters: Sight +3. Rewards +25%.');
    const events = steps(state, 1);
    expect(events.find((e) => e.type === 'runModifierAdded')).toMatchObject({ atStart: true, source: { label: 'Test Gloom (Omen, rank 2)' }, rewardBonus: 0.25 });
  });

  it('a flag-only rank sets its flag and no stats', () => {
    const state = createRun({ ...BASE, omens: [{ id: GLOOM.id, rank: 3 }] }, 1);
    expect(state.domains.stats.runModifiers[0]).toMatchObject({ flags: ['omen.test_gloom'], rewardBonus: 0.5 });
    expect(state.domains.stats.runModifiers[0]?.bundle).toBeUndefined();
  });

  it('pays one multiplier across Omens, applied to what the run earns and before the wipe loss', () => {
    const plain = createRun(BASE, 1);
    const on = createRun({ ...BASE, omens: [{ id: GLOOM.id, rank: 2 }, { id: THIRST.id, rank: 1 }] }, 1);
    expect(rewardMultiplier(on)).toBeCloseTo(1.45);
    for (const s of [plain, on]) for (let i = 0; i < 300 && s.domains.floors.deepest < 3; i++) step(s, []);
    const base = plain.domains.run.rewards.atRisk.renown as number;
    expect(base).toBeGreaterThan(0);
    expect(on.domains.run.rewards.atRisk.renown).toBe(Math.floor(base * 1.45 + 1e-9));
    const hero = getEntity(on, on.party[0] as EntityId) as ActorEntity;
    hero.actor.hp = 0;
    step(on, []);
    const result = runResult(on);
    const multiplied = result.atRisk.renown as number;
    expect(result.lost).toEqual({ renown: multiplied - Math.floor(multiplied * 0.75) });
    expect(result.extras['run.omens']).toEqual({ omens: [{ id: GLOOM.id, rank: 2 }, { id: THIRST.id, rank: 1 }], multiplier: rewardMultiplier(on) });
    expect(applyRunResult(newProfile(), result).history.recent[0]?.omens).toEqual({
      omens: [{ id: GLOOM.id, rank: 2 }, { id: THIRST.id, rank: 1 }],
      multiplier: rewardMultiplier(on),
    });
  });

  it('records nothing when no Omen was on, so a plain run is unchanged', () => {
    const state = createRun(BASE, 1);
    for (let i = 0; i < 300 && state.domains.floors.deepest < 3; i++) step(state, []);
    (getEntity(state, state.party[0] as EntityId) as ActorEntity).actor.hp = 0;
    step(state, []);
    expect(Object.hasOwn(runResult(state).extras, 'run.omens')).toBe(false);
    expect(state.domains.stats.runModifiers).toEqual([]);
    expect(applyRunResult(newProfile(), runResult(state)).history.recent[0]).not.toHaveProperty('omens');
  });

  it('applies a rank bundle to monsters only, through the stat tooltip source', () => {
    const state = createRun({ ...BASE, monsters: true, omens: [{ id: GLOOM.id, rank: 1 }] }, 1);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    expect(getStat(state, hero, 'sight').parts.some((p) => p.source.id === GLOOM.id)).toBe(false);
  });

  it('replays identically: the same config and seed give the same run', () => {
    const config = buildRunConfig(withGloom(), choose({ [GLOOM.id]: 2 }), 7);
    const a = createRun(config, 7);
    const b = createRun(config, 7);
    steps(a, 40);
    steps(b, 40);
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('the Rematch and auto-restart path keeps the Omens: startRun builds from the saved choices', () => {
    const profile: Profile = { ...withGloom(), prepare: { choices: choose({ [GLOOM.id]: 3 }) } };
    const first = startRun(profile, profile.prepare.choices, 11);
    const again = startRun(first.profile, first.profile.prepare.choices, 12, first.config);
    expect(first.config.omens).toEqual([{ id: GLOOM.id, rank: 3 }]);
    expect(again.config.omens).toEqual(first.config.omens);
  });
});
