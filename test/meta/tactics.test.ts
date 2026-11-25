/**
 * Tactics picks on the roster (ETH-162): a record stores its own picks, a run starts the
 * adventurer with them, picks that can no longer be played are ignored, and old saves (records
 * without picks) still load.
 */
import { describe, expect, it } from 'vitest';
import { applyRunResult, checkProfile, decodeSave, defaultRunChoices, encodeSave, newProfile, recordOf, setRecordTactics, startRun } from '../../src/meta';
import { adventurersSlice } from '../../src/meta/slices/adventurers';
import type { Profile, RunChoices } from '../../src/meta';
import { createRun, getEntity } from '../../src/sim';
import type { AiActor } from '../../src/sim';
import { emptyRunResult } from '../../src/sim';

const choices: RunChoices = { ...defaultRunChoices(), party: { slots: [{ classId: 'class.vanguard', raceId: 'race.human' }] } };
const PICKS = { role: 'tactic.healer', range: 'tactic.back_line', focus: 'tactic.strongest', habits: ['tactic.treasure_hunter'] };

/** A profile whose first adventurer (adv.1) exists after one banked run. */
function withRecord(): { profile: Profile; id: string } {
  const started = startRun(newProfile(), choices, 5);
  const member = started.config.party[0];
  const result = {
    ...emptyRunResult('retreat'),
    extras: { 'run.party': [{ actor: 1, name: member?.name, classId: 'class.vanguard', raceId: 'race.human', recordId: member?.recordId }] },
  };
  return { profile: applyRunResult(started.profile, result), id: member?.recordId as string };
}

describe('a record\'s tactics picks', () => {
  it('start unset, so the class default build applies', () => {
    const { profile, id } = withRecord();
    expect(recordOf(profile, id)?.tactics).toBeUndefined();
    const config = startRun(profile, choices, 5).config;
    expect(config.party[0]?.tactics).toBeUndefined();
  });

  it('are stored with setRecordTactics, validated, and cleared with null', () => {
    const { profile, id } = withRecord();
    const set = setRecordTactics(profile.adventurers, id, PICKS);
    expect(set.records[id]?.tactics).toEqual(PICKS);
    expect(checkProfile({ ...profile, adventurers: set })).toEqual([]);
    expect(setRecordTactics(set, id, null).records[id]).not.toHaveProperty('tactics');
    expect(() => setRecordTactics(profile.adventurers, id, { ...PICKS, role: 'tactic.weakest' })).toThrow(/Invalid tactics/);
    expect(() => setRecordTactics(profile.adventurers, 'adv.99', PICKS)).toThrow(/No adventurer record/);
  });

  it('reach the run: a rematch starts the adventurer with their stored picks', () => {
    const { profile, id } = withRecord();
    const stored = { ...profile, adventurers: setRecordTactics(profile.adventurers, id, PICKS) };
    const first = startRun(stored, choices, 5);
    const previous = { ...first.config, party: first.config.party.map((m) => ({ ...m, recordId: id })) };
    const second = startRun(stored, choices, 5, previous);
    expect(second.config.party[0]?.tactics).toEqual(PICKS);
    const state = createRun({ ...second.config, floorText: ['####', '#@.#', '####'], depth: 1 }, 5);
    const hero = getEntity(state, state.party[0] as number) as AiActor;
    expect(hero.ai.tactics).toMatchObject({ role: 'tactic.healer', focus: 'tactic.strongest', habits: ['tactic.treasure_hunter'] });
    expect(hero.ai.rules.map((r) => r.option)).toEqual(['tactic.treasure_hunter', 'tactic.healer', 'tactic.healer', 'tactic.healer']);
  });

  it('are ignored when the content no longer has the option', () => {
    const { profile, id } = withRecord();
    const record = recordOf(profile, id);
    const stale = { ...profile, adventurers: { ...profile.adventurers, records: { ...profile.adventurers.records, [id]: { ...record, tactics: { ...PICKS, role: 'tactic.gone' } } } } } as Profile;
    const previous = { ...startRun(stale, choices, 5).config, party: [{ name: record?.name as string, classId: 'class.vanguard', raceId: 'race.human', recordId: id }] };
    expect(startRun(stale, choices, 5, previous).config.party[0]?.tactics).toBeUndefined();
  });
});

describe('the adventurers slice, version 2', () => {
  it('upgrades version 1 data unchanged, and saves round-trip with picks', () => {
    const v1 = { nextId: 1, records: {} };
    expect(adventurersSlice.version).toBe(2);
    expect(adventurersSlice.migrations?.[2]?.(v1)).toEqual(v1);

    const { profile, id } = withRecord();
    const stored = { ...profile, adventurers: setRecordTactics(profile.adventurers, id, PICKS) };
    const decoded = decodeSave(encodeSave(stored, 1));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(recordOf(decoded.profile, id)?.tactics).toEqual(PICKS);
  });
});
