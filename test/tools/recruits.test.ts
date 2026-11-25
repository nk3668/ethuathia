import { describe, expect, it } from 'vitest';
import {
  availableClasses,
  availableRaces,
  buildRunConfig,
  defaultRunChoices,
  newProfile,
  partySize,
  recruitParty,
} from '../../src/meta';
import {
  buildHeadlessConfig,
  buildHeadlessProfile,
  formatReport,
  parseSimArgs,
  partyOptions,
  runSeed,
  summarizeMixed,
  summarizeReport,
} from '../../tools/headless';

describe('--recruits (ETH-178)', () => {
  it('fields the same party for the same seed, and the Prepare screen fill for that seed', () => {
    const options = { recruits: true, partySize: 4 } as const;
    expect(buildHeadlessConfig(options, 7).party).toEqual(buildHeadlessConfig(options, 7).party);
    const names = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(buildHeadlessConfig(options, seed).party)));
    expect(names.size).toBeGreaterThan(1);

    // The same code path as the game: a party of the profile's size is buildRunConfig's party.
    const profile = buildHeadlessProfile('progressed');
    expect(partySize(profile)).toBe(2);
    const viaPrepare = buildRunConfig(profile, defaultRunChoices(), 11).party;
    expect(recruitParty(profile, 11)).toEqual(viaPrepare);
    expect(buildHeadlessConfig({ recruits: true, preset: 'progressed' }, 11).party).toEqual(viaPrepare);
    expect(recruitParty(newProfile(), 11, 1)).toHaveLength(1);
  });

  it('uses only available classes and races, and a mix over many seeds', () => {
    // Classes and races are sold in the town (ETH-036): a fresh profile has only the Vanguard and Human.
    const upgrades = ['upgrade.outrider_training', 'upgrade.fenling_recruitment'];
    const profile = buildHeadlessProfile('fresh', upgrades);
    const classes = availableClasses(profile).map((d) => d.id);
    const races = availableRaces(profile).map((d) => d.id);
    const seen = { classes: new Set<string>(), races: new Set<string>() };
    for (let seed = 1; seed <= 40; seed++) {
      const party = buildHeadlessConfig({ recruits: true, partySize: 4, upgrades }, seed).party;
      expect(party).toHaveLength(4);
      for (const m of party) {
        expect(classes).toContain(m.classId);
        expect(races).toContain(m.raceId);
        seen.classes.add(m.classId);
        seen.races.add(m.raceId);
      }
    }
    expect(seen.classes.size).toBeGreaterThan(1);
    expect(seen.races.size).toBeGreaterThan(1);
  });

  it('reads the flag, and refuses it with --class or --race or an explicit party', () => {
    expect(parseSimArgs(['--recruits', '--party', '3'])).toMatchObject({ recruits: true, party: 3 });
    expect(parseSimArgs([]).recruits).toBe(false);
    expect(() => parseSimArgs(['--recruits', '--class', 'outrider'])).toThrow('--recruits');
    expect(() => parseSimArgs(['--recruits', '--race', 'fenling'])).toThrow('--class or --race');
    expect(() => buildHeadlessConfig({ recruits: true, party: [{ name: 'A', classId: 'class.vanguard', raceId: 'race.human' }] })).toThrow(
      'recruits',
    );
    expect(partyOptions(2, { recruits: true })).toEqual({ recruits: true, partySize: 2 });
    expect(partyOptions(2, {}).party).toHaveLength(2);
  });

  it('reports who was fielded, who died and the Mastery XP, only for a mixed party', () => {
    const mixed = runSeed(3, { recruits: true, partySize: 3, cap: 300 });
    expect(mixed.members).toHaveLength(3);
    expect(runSeed(3, { recruits: true, partySize: 3, cap: 300 })).toEqual(mixed);
    const summary = summarizeMixed([mixed]);
    expect(summary?.classes.reduce((n, r) => n + r.fielded, 0)).toBe(3);
    expect(summary?.races.reduce((n, r) => n + r.fielded, 0)).toBe(3);
    expect(summary?.classes.reduce((n, r) => n + r.deaths, 0)).toBe(mixed.deaths);
    expect(formatReport([mixed], 300)).toContain('Mixed party breakdown');
    expect(summarizeReport([mixed]).mixed).toBeDefined();

    const uniform = runSeed(3, { cap: 300 });
    expect(uniform.members).toBeUndefined();
    expect(summarizeReport([uniform])).not.toHaveProperty('mixed');
    expect(formatReport([uniform], 300)).not.toContain('Mixed party');
  });
});
