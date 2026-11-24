/**
 * Persistent adventurer records (ETH-119): the `adventurers` slice, its read API, `startRun`,
 * and the id's trip through a real run.
 */
import { describe, expect, it } from 'vitest';
import {
  activeRecords,
  addTrait,
  applyRunResult,
  checkProfile,
  decodeSave,
  defaultRunChoices,
  encodeSave,
  fallenRecords,
  FALLEN_RECORD_CAP,
  newProfile,
  newRecord,
  recordOf,
  retiredRecords,
  setStatus,
  startRun,
} from '../../src/meta';
import type { AdventurerRecord, Adventurers, Profile, RunChoices } from '../../src/meta';
import { checkInvariants, createRun, emptyRunResult, runResult, step } from '../../src/sim';
import type { RunConfig, RunResult } from '../../src/sim';
import { SAVE_FORMAT } from '../../src/meta';

const choices: RunChoices = { ...defaultRunChoices(), party: { slots: [{ classId: 'class.vanguard', raceId: 'race.human' }] } };

function fallenOf(actor: number, how = 'was slain by a slate hound', turn = 40) {
  return { actor, name: 'x', depth: 3, turn, killer: { kind: 'monster', id: 99, def: 'monster.slate_hound', name: 'Slate hound' }, how };
}

/** A finished run's result for party members `[actor, recordId?]`, with levels, kills and who fell. */
function run(
  party: readonly { actor: number; name: string; recordId?: string }[],
  opts: { outcome?: RunResult['outcome']; levels?: Record<number, number>; kills?: Record<number, number>; fell?: number[]; deepest?: number; turns?: number } = {},
): RunResult {
  return {
    ...emptyRunResult(opts.outcome ?? 'retreat'),
    turns: opts.turns ?? 500,
    deepestDepth: opts.deepest ?? 4,
    extras: {
      'run.party': party.map((m) => ({ ...m, classId: 'class.vanguard', raceId: 'race.human' })),
      'track.xp': {
        byActor: Object.fromEntries(party.map((m) => [m.actor, { classId: 'class.vanguard', xp: 0, level: opts.levels?.[m.actor] ?? 1 }])),
        byClass: {},
      },
      'track.kills': { kills: 0, trophies: 0, byMonster: {}, byActor: opts.kills ?? {} },
      'track.deaths': { fallen: (opts.fell ?? []).map((a) => fallenOf(a)) },
    },
  };
}

/** Starts a run for `profile` and banks `result(config)` into the returned profile. */
function startAndBank(profile: Profile, seed: number, result: (config: RunConfig) => RunResult): { profile: Profile; config: RunConfig } {
  const started = startRun(profile, choices, seed);
  return { profile: applyRunResult(started.profile, result(started.config)), config: started.config };
}

const two = (config: RunConfig) =>
  config.party.map((m, i) => ({ actor: i + 1, name: m.name, ...(m.recordId === undefined ? {} : { recordId: m.recordId }) }));

describe('the adventurers slice', () => {
  it('starts empty and passes its checks', () => {
    expect(newProfile().adventurers).toEqual({ nextId: 1, records: {} });
    expect(checkProfile(newProfile())).toEqual([]);
  });

  it('creates a record per member of a run, whether or not startRun issued an id', () => {
    const bare = applyRunResult(newProfile(), run([{ actor: 1, name: 'Mira' }, { actor: 2, name: 'Bram' }], { levels: { 1: 3, 2: 2 }, kills: { 1: 5 } }));
    const records = activeRecords(bare);
    expect(records.map((r) => [r.id, r.name, r.peakLevel, r.born, r.history.runs, r.history.kills])).toEqual([
      ['adv.1', 'Mira', 3, 1, 1, 5],
      ['adv.2', 'Bram', 2, 1, 1, 0],
    ]);
    expect(bare.adventurers.nextId).toBe(3);
    expect(checkProfile(bare)).toEqual([]);
  });

  it('keeps history and traits across runs, starting at level 1, and raises peakLevel only when beaten', () => {
    const first = startAndBank(newProfile(), 1, (c) => run(two(c), { levels: { 1: 4 }, kills: { 1: 3 }, deepest: 5, turns: 300 }));
    const id = first.config.party[0]?.recordId as string;
    const tagged = { ...first.profile, adventurers: addTrait(first.profile.adventurers, id, 'trait.steady') };
    // The same adventurer goes again (a rematch config names the record).
    const second = startRun(tagged, choices, 1, first.config);
    expect(second.config.party[0]?.recordId).toBe(id);
    expect(second.config.party[0]).not.toHaveProperty('growth');
    const again = applyRunResult(second.profile, run(two(second.config), { outcome: 'victory', levels: { 1: 2 }, kills: { 1: 2 }, deepest: 3, turns: 200 }));
    const record = recordOf(again, id) as AdventurerRecord;
    expect(record.peakLevel).toBe(4);
    expect(record.traits).toEqual(['trait.steady']);
    expect(record.history).toEqual({ runs: 2, victories: 1, deepest: 5, kills: 5, turns: 500 });
    const beaten = applyRunResult(again, run(two(second.config), { levels: { 1: 6 } }));
    expect(recordOf(beaten, id)?.peakLevel).toBe(6);
    expect(checkProfile(beaten)).toEqual([]);
  });

  it('marks a wiped party fallen, with causes', () => {
    const party = [{ actor: 1, name: 'Mira' }, { actor: 2, name: 'Bram' }];
    const profile = applyRunResult(newProfile(), run(party, { outcome: 'wipe', fell: [1, 2] }));
    const fallen = fallenRecords(profile);
    expect(fallen.map((r) => r.name).sort()).toEqual(['Bram', 'Mira']);
    for (const r of fallen) {
      expect(r.status).toBe('fallen');
      expect(r.death).toMatchObject({ run: 1, depth: 3, turn: 40, cause: 'was slain by a slate hound', killer: { def: 'monster.slate_hound', name: 'Slate hound' } });
    }
    expect(activeRecords(profile)).toEqual([]);
    expect(checkProfile(profile)).toEqual([]);
  });

  it('counts a victory only for those who survived it', () => {
    const profile = applyRunResult(newProfile(), run([{ actor: 1, name: 'A' }, { actor: 2, name: 'B' }], { outcome: 'victory', fell: [2] }));
    expect(recordOf(profile, 'adv.1')?.history.victories).toBe(1);
    expect(recordOf(profile, 'adv.2')?.history.victories).toBe(0);
    expect(recordOf(profile, 'adv.2')?.status).toBe('fallen');
  });

  it('does not credit an ally outside the party', () => {
    const profile = applyRunResult(newProfile(), run([{ actor: 1, name: 'A' }], { kills: { 1: 2, 77: 9 } }));
    expect(recordOf(profile, 'adv.1')?.history.kills).toBe(2);
    expect(Object.keys(profile.adventurers.records)).toEqual(['adv.1']);
  });

  it('gives an unknown recordId a fresh record', () => {
    const profile = applyRunResult(newProfile(), run([{ actor: 1, name: 'A', recordId: 'adv.40' }]));
    expect(Object.keys(profile.adventurers.records)).toEqual(['adv.1']);
  });

  it('loads an old save without the slice as an empty slice, and round-trips with records', () => {
    const old = JSON.stringify({ format: SAVE_FORMAT, version: 1, savedAt: 1, slices: {} });
    const loaded = decodeSave(old);
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.profile.adventurers).toEqual({ nextId: 1, records: {} });

    const { profile } = startAndBank(newProfile(), 3, (c) => run(two(c), { levels: { 1: 3 }, fell: [1] }));
    const decoded = decodeSave(encodeSave(profile, 5));
    expect(decoded).toEqual({ ok: true, profile, savedAt: 5, notes: [] });
  });
});

describe('invariants', () => {
  const base = (): Profile => applyRunResult(newProfile(), run([{ actor: 1, name: 'A' }, { actor: 2, name: 'B' }], { fell: [2] }));
  const withRecord = (patch: Partial<AdventurerRecord>, id = 'adv.1'): Profile => {
    const p = base();
    const records = { ...p.adventurers.records };
    records[id] = { ...(records[id] as AdventurerRecord), ...patch };
    return { ...p, adventurers: { ...p.adventurers, records } };
  };

  it.each([
    ['a record under the wrong key', { ...base(), adventurers: { nextId: 3, records: { 'adv.1': { ...(base().adventurers.records['adv.2'] as AdventurerRecord) } } } }, /stored under/],
    ['an id past nextId', { ...base(), adventurers: { ...base().adventurers, nextId: 2 } }, /has not issued/],
    ['peakLevel 0', withRecord({ peakLevel: 0 }), /peakLevel/],
    ['fallen without a death', withRecord({ status: 'fallen' }), /death exactly when/],
    ['a death while active', withRecord({ death: { run: 1, depth: 1, turn: 1, cause: 'x' } }), /death exactly when/],
    ['more victories than runs', withRecord({ history: { runs: 1, victories: 2, deepest: 1, kills: 0, turns: 0 } }), /more victories/],
    ['a repeated trait', withRecord({ traits: ['a', 'a'] }), /trait twice/],
    ['a kin id never issued', withRecord({ origin: { kind: 'kin', kin: 'adv.9' } }), /never issued/],
  ])('rejects %s', (_name, profile, message) => {
    expect(checkProfile(profile).join('\n')).toMatch(message);
  });

  it('accepts kin that names an issued id even if that record is gone', () => {
    const gone = withRecord({ origin: { kind: 'kin', kin: 'adv.2' } });
    const records = { ...gone.adventurers.records };
    delete (records as Record<string, unknown>)['adv.2'];
    expect(checkProfile({ ...gone, adventurers: { ...gone.adventurers, records } })).toEqual([]);
  });
});

describe('the fallen cap', () => {
  /** A slice holding `n` fallen records and room for more. */
  function crowded(n: number, kinOf?: string): Adventurers {
    let slice: Adventurers = { nextId: 1, records: {} };
    for (let i = 0; i < n; i++) {
      const made = newRecord(slice, { name: `F${i}`, classId: 'class.vanguard', raceId: 'race.human', born: 1 });
      const died: AdventurerRecord = { ...made.record, status: 'fallen', death: { run: i + 1, depth: 1, turn: 1, cause: 'x' } };
      slice = { nextId: made.slice.nextId, records: { ...made.slice.records, [died.id]: died } };
    }
    if (kinOf !== undefined) {
      const heir = newRecord(slice, { name: 'Heir', classId: 'class.vanguard', raceId: 'race.human', born: 1, origin: { kind: 'kin', kin: kinOf } });
      slice = heir.slice;
    }
    return slice;
  }

  /** A profile whose run counter is past the crowd's deaths, so a new death is the newest. */
  const withRuns = (adventurers: Adventurers): Profile => {
    const base = newProfile();
    return { ...base, adventurers, history: { ...base.history, totals: { ...base.history.totals, runs: 500 } } };
  };

  it('trims the oldest fallen past the cap when a run adds more', () => {
    const profile = withRuns(crowded(FALLEN_RECORD_CAP));
    const after = applyRunResult(profile, run([{ actor: 1, name: 'New' }], { fell: [1] }));
    const fallen = fallenRecords(after);
    expect(fallen.length).toBe(FALLEN_RECORD_CAP);
    expect(recordOf(after, 'adv.1')).toBeUndefined();
    expect(recordOf(after, `adv.${FALLEN_RECORD_CAP + 1}`)?.name).toBe('New');
    expect(checkProfile(after)).toEqual([]);
  });

  it('never trims a record another record is kin of', () => {
    const profile = withRuns(crowded(FALLEN_RECORD_CAP, 'adv.1'));
    const after = applyRunResult(profile, run([{ actor: 1, name: 'New' }], { fell: [1] }));
    expect(recordOf(after, 'adv.1')).toBeDefined();
    expect(recordOf(after, 'adv.2')).toBeUndefined();
    expect(fallenRecords(after).length).toBe(FALLEN_RECORD_CAP);
  });
});

describe('the read and mutation API', () => {
  const profile = (): Profile => applyRunResult(newProfile(), run([{ actor: 1, name: 'A' }, { actor: 2, name: 'B' }, { actor: 3, name: 'C' }], { fell: [3] }));

  it('lists active in creation order, fallen newest first, and retired', () => {
    const p = profile();
    expect(activeRecords(p).map((r) => r.id)).toEqual(['adv.1', 'adv.2']);
    const retired = { ...p, adventurers: setStatus(p.adventurers, 'adv.2', 'retired') };
    expect(activeRecords(retired).map((r) => r.id)).toEqual(['adv.1']);
    expect(retiredRecords(retired).map((r) => r.id)).toEqual(['adv.2']);
    expect(fallenRecords(retired).map((r) => r.id)).toEqual(['adv.3']);
    expect(checkProfile(retired)).toEqual([]);
  });

  it('addTrait is idempotent and mutations leave the input alone', () => {
    const p = profile();
    const once = addTrait(p.adventurers, 'adv.1', 'trait.keen');
    expect(addTrait(once, 'adv.1', 'trait.keen')).toBe(once);
    expect(p.adventurers.records['adv.1']?.traits).toEqual([]);
    expect(once.records['adv.1']?.traits).toEqual(['trait.keen']);
  });

  it('refuses to change an unknown or fallen record', () => {
    const p = profile();
    expect(() => addTrait(p.adventurers, 'adv.9', 'x')).toThrow(RangeError);
    expect(() => setStatus(p.adventurers, 'adv.3', 'retired')).toThrow(RangeError);
  });
});

describe('startRun', () => {
  it('leaves buildRunConfig pure: the input profile is unchanged and configs carry ids', () => {
    const profile = newProfile();
    const before = JSON.stringify(profile);
    const started = startRun(profile, choices, 7);
    expect(JSON.stringify(profile)).toBe(before);
    expect(started.config.party.map((m) => m.recordId)).toEqual(['adv.1']);
    expect(started.profile.adventurers.nextId).toBe(2);
    expect(recordOf(started.profile, 'adv.1')).toMatchObject({ name: started.config.party[0]?.name, status: 'active', born: 1, peakLevel: 1 });
    expect(checkProfile(started.profile)).toEqual([]);
  });

  it('a rematch keeps the previous run\'s adventurers, a fresh seed recruits new ones', () => {
    const first = startRun(newProfile(), choices, 7);
    const rematch = startRun(first.profile, choices, 7, first.config);
    expect(rematch.config).toEqual(first.config);
    expect(rematch.profile.adventurers).toEqual(first.profile.adventurers);
    const next = startRun(first.profile, choices, 8);
    expect(next.config.party[0]?.recordId).toBe('adv.2');
  });
});

describe('the id through a real run', () => {
  it('reaches the entity, run.party and the profile, and every member starts at level 1', () => {
    const started = startRun(newProfile(), choices, 11);
    const config: RunConfig = { ...started.config, floorText: ['#####', '#<@.#', '#####'], depth: 1 };
    const state = createRun(config, 11);
    expect(state.entities[state.party[0] as number]?.adventurer?.recordId).toBe('adv.1');
    for (let i = 0; i < 50 && state.domains.run.end === null; i++) {
      step(state, i === 0 ? [{ type: 'retreat' }] : []);
      expect(checkInvariants(state)).toEqual([]);
    }
    expect(state.domains.run.end).not.toBeNull();
    const result = runResult(state);
    expect(result.extras['run.party']).toMatchObject([{ recordId: 'adv.1' }]);
    const banked = applyRunResult(started.profile, result);
    expect(recordOf(banked, 'adv.1')?.history.runs).toBe(1);
    expect(recordOf(banked, 'adv.1')?.peakLevel).toBe(1);
  });
});
