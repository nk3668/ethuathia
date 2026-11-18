import { describe, expect, it } from 'vitest';
import { defineDungeon, defineUpgrade } from '../../src/content';
import {
  availableDungeons,
  buildRunConfig,
  checkRunConfig,
  completeRunChoices,
  decodeSave,
  defaultRunChoices,
  encodeSave,
  newProfile,
  partySize,
  upgradePartyBundles,
} from '../../src/meta';
import type { Profile, RunChoices } from '../../src/meta';
import { createRun, getStat, InlineHost } from '../../src/sim';

// A test-only variant that an upgrade unlocks, and the node that unlocks it.
defineDungeon({
  id: 'dungeon.test_pit',
  name: 'Test Pit',
  description: 'A shallow test pit.',
  tags: [],
  depth: 3,
  floorType: 'floor.halls',
});
defineUpgrade({
  id: 'upgrade.test_survey',
  name: 'Test Survey',
  description: 'Maps the test pit.',
  tags: [],
  building: 'building.guild_hall',
  tier: 9,
  column: 0,
  cost: { renown: 1 },
  requires: [],
  grants: [{ kind: 'unlock', id: 'dungeon.test_pit' }],
});

const own = (profile: Profile, ...ids: string[]): Profile => ({ ...profile, upgrades: { owned: [...profile.upgrades.owned, ...ids] } });

describe('buildRunConfig', () => {
  it('fills the party with seeded random recruits from the available classes and races', () => {
    const profile = newProfile();
    const config = buildRunConfig(profile, defaultRunChoices(), 42);
    expect(config.party).toHaveLength(1);
    expect(config.party[0]).toMatchObject({ classId: 'class.vanguard', raceId: 'race.human' });
    expect(config.depth).toBe(10);
    expect(checkRunConfig(config)).toEqual([]);
    // The same seed gives the same party; another seed may name them differently.
    expect(buildRunConfig(profile, defaultRunChoices(), 42)).toEqual(config);
    const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => buildRunConfig(profile, defaultRunChoices(), seed).party[0]?.name));
    expect(names.size).toBeGreaterThan(1);
  });

  it('takes as many adventurers as the Guild Hall allows, with distinct names', () => {
    const profile = own(newProfile(), 'upgrade.second_berth', 'upgrade.roster_ledger', 'upgrade.third_berth', 'upgrade.fourth_berth');
    expect(partySize(profile)).toBe(4);
    const config = buildRunConfig(profile, defaultRunChoices(), 9);
    expect(config.party).toHaveLength(4);
    expect(new Set(config.party.map((m) => m.name)).size).toBe(4);
  });

  it('keeps the picks the profile allows and replaces the others with random recruits', () => {
    const choices: RunChoices = completeRunChoices({
      party: { slots: [{ classId: 'class.vanguard', raceId: 'race.human' }] },
      dungeon: { dungeonId: 'dungeon.test_pit' },
    });
    // The test pit is locked until its upgrade is owned: the first open dungeon goes instead.
    expect(buildRunConfig(newProfile(), choices, 1).depth).toBe(10);
    expect(availableDungeons(newProfile()).map((d) => d.id)).not.toContain('dungeon.test_pit');
    const surveyed = own(newProfile(), 'upgrade.test_survey');
    expect(buildRunConfig(surveyed, choices, 1).depth).toBe(3);

    const unknown = completeRunChoices({ party: { slots: [{ classId: 'class.nobody', raceId: null }] } });
    expect(buildRunConfig(newProfile(), unknown, 1).party[0]?.classId).toBe('class.vanguard');
  });

  it('gives every adventurer the party bundles of owned upgrades, credited to the upgrade', () => {
    const profile = own(newProfile(), 'upgrade.second_berth', 'upgrade.hardy_recruits');
    expect(upgradePartyBundles(profile)).toEqual(['upgrade.hardy_recruits']);
    const config = buildRunConfig(profile, defaultRunChoices(), 3);
    expect(config.partyBundles).toEqual(['upgrade.hardy_recruits']);

    const plain = createRun(buildRunConfig(newProfile(), defaultRunChoices(), 3), 3);
    const hardy = createRun(config, 3);
    const hp = (state: typeof plain) => getStat(state, state.entities[state.party[0] as number] as never, 'hp');
    expect(hp(hardy).value).toBe(hp(plain).value + 2);
    expect(hp(hardy).parts).toContainEqual({ op: 'add', value: 2, source: { id: 'upgrade.hardy_recruits', label: 'Hardy Recruits' } });
  });

  it('starts a run the sim accepts', () => {
    const host = new InlineHost();
    host.start(buildRunConfig(newProfile(), defaultRunChoices(), 5), 5);
    expect(host.run(20)).toBe(20);
    host.dispose();
  });
});

describe('checkRunConfig', () => {
  it('reports an empty party, unknown ids and a bad depth', () => {
    expect(checkRunConfig({ party: [] })).toContain('the party is empty');
    const problems = checkRunConfig({
      party: [{ name: ' ', classId: 'class.x', raceId: 'race.y' }],
      partyBundles: ['bundle.nothing'],
      depth: 0,
    });
    expect(problems.join('\n')).toMatch(/no name/);
    expect(problems.join('\n')).toMatch(/unknown class "class.x"/);
    expect(problems.join('\n')).toMatch(/unknown race "race.y"/);
    expect(problems.join('\n')).toMatch(/unknown party bundle/);
    expect(problems.join('\n')).toMatch(/depth/);
  });
});

describe('the prepare slice', () => {
  it('remembers the choices through a save', () => {
    const choices = completeRunChoices({ party: { slots: [{ classId: 'class.vanguard', raceId: null }] } });
    const profile: Profile = { ...newProfile(), prepare: { choices } };
    const decoded = decodeSave(encodeSave(profile, 1));
    expect(decoded.ok && decoded.profile.prepare.choices).toEqual(choices);
  });

  it('starts a missing or invalid section at its default', () => {
    const text = encodeSave(newProfile(), 1);
    const envelope = JSON.parse(text) as { slices: Record<string, { version: number; data: unknown }> };
    envelope.slices.prepare = { version: 1, data: { choices: { party: { slots: 'lots' } } } };
    const decoded = decodeSave(JSON.stringify(envelope));
    expect(decoded.ok && decoded.profile.prepare.choices).toEqual(defaultRunChoices());
  });
});
