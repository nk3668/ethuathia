/**
 * Habit slots (ETH-194): one to start, one more from the Guild Hall's Habit Tutor, carried into
 * the run config, and what a stored build keeps when it holds more habits than the slots.
 */
import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../../src/content';
import { BASE_HABIT_SLOTS, buildRunConfig, capacity, defaultRunChoices, fitHabits, habitSlotsOf, newProfile, startRun } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { createRun } from '../../src/sim';

const own = (profile: Profile, ids: readonly string[]): Profile => ({ ...profile, upgrades: { owned: [...profile.upgrades.owned, ...ids], ranks: profile.upgrades.ranks } });
const choices = { ...defaultRunChoices(), party: { slots: [{ classId: 'class.vanguard', raceId: 'race.human' }] } };

describe('habit slots', () => {
  it('start at one and grow with the Habit Tutor, and the capacity key is habitSlots', () => {
    expect(habitSlotsOf(newProfile())).toBe(BASE_HABIT_SLOTS);
    const tutor = UPGRADES.get('upgrade.rule_clerk');
    expect(tutor.name).toBe('Habit Tutor');
    expect(tutor.grants).toEqual([{ kind: 'capacity', key: 'habitSlots', amount: 1 }]);
    const p = own(newProfile(), ['upgrade.rule_clerk']);
    expect(capacity(p, 'habitSlots', 1)).toBe(2);
    expect(habitSlotsOf(p)).toBe(2);
  });

  it('go into the run config, and the sim refuses more habits than that', () => {
    const p = own(newProfile(), ['upgrade.rule_clerk']);
    const config = buildRunConfig(p, choices, 5);
    expect(config.habitSlots).toBe(2);
    expect(() => createRun({ ...config, floorText: ['####', '#@.#', '####'], depth: 1, party: [{ ...(config.party[0] as object), tactics: { habits: ['tactic.treasure_hunter', 'tactic.finisher', 'tactic.curious'] } } as never] }, 5)).toThrow(/only 2 habit slots/);
  });
});

describe('fitHabits', () => {
  it('keeps the first habits and lists the ones dropped', () => {
    const picks = { role: 'tactic.damage', habits: ['a', 'b', 'c'] };
    expect(fitHabits(picks, 2)).toEqual({ picks: { role: 'tactic.damage', habits: ['a', 'b'] }, dropped: ['c'] });
    expect(fitHabits(picks, 3)).toEqual({ picks, dropped: [] });
  });

  it('cuts a stored build to the slots when a run starts, so it never fails to start', () => {
    const first = startRun(newProfile(), choices, 5);
    const id = first.config.party[0]?.recordId as string;
    const stored = {
      ...first.profile,
      adventurers: {
        ...first.profile.adventurers,
        records: { ...first.profile.adventurers.records, [id]: { ...(first.profile.adventurers.records[id] as object), tactics: { role: 'tactic.damage', range: 'tactic.front_line', focus: 'tactic.weakest', habits: ['tactic.treasure_hunter', 'tactic.finisher'] } } },
      },
    } as Profile;
    const again = startRun(stored, choices, 5, first.config);
    expect(again.config.habitSlots).toBe(1);
    expect(again.config.party[0]?.tactics?.habits).toEqual(['tactic.treasure_hunter']);
  });
});
