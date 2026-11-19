/** The Prepare screen's contracts section and contracts in the run history (ETH-024). */
import { describe, expect, it } from 'vitest';
import { CONTRACT_RECOVER_RELIC, defineContract, UPGRADE_CONTRACT_BOARD } from '../../src/content';
import { buildRunConfig, checkRunConfig, completeRunChoices, contractSlots, defaultRunChoices, newProfile, runRecord } from '../../src/meta';
import type { Profile } from '../../src/meta';
import { emptyRunResult } from '../../src/sim';

// A second, test-only contract, so two slots can be filled.
const SECOND = defineContract({
  id: 'contract.test_second',
  name: 'Second test',
  description: 'A second test contract.',
  tags: [],
  objective: { kind: 'recover', item: 'item.mending_draught' },
  reward: { trophies: 5 },
});

const RELIC = CONTRACT_RECOVER_RELIC.id;
const own = (profile: Profile, ...ids: string[]): Profile => ({ ...profile, upgrades: { owned: [...profile.upgrades.owned, ...ids] } });

describe('contracts section', () => {
  it('defaults to Recover the relic in the one starting slot', () => {
    const profile = newProfile();
    expect(contractSlots(profile)).toBe(1);
    expect(defaultRunChoices().contracts).toEqual({ contractIds: [RELIC] });
    expect(buildRunConfig(profile, defaultRunChoices(), 1).contracts).toEqual([RELIC]);
  });

  it('takes one contract per slot, never repeats one, and never takes none', () => {
    const profile = newProfile();
    const config = (ids: string[], p = profile) => buildRunConfig(p, completeRunChoices({ contracts: { contractIds: ids } }), 1).contracts;
    expect(config([SECOND.id, RELIC])).toEqual([SECOND.id]);
    expect(config([])).toEqual([RELIC]);
    expect(config(['contract.gone'])).toEqual([RELIC]);
    const board = own(profile, UPGRADE_CONTRACT_BOARD.id);
    expect(contractSlots(board)).toBe(2);
    expect(config([SECOND.id, SECOND.id, RELIC], board)).toEqual([SECOND.id, RELIC]);
  });

  it('flags unknown or repeated contracts in a config', () => {
    const party = [{ name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' }];
    expect(checkRunConfig({ party, contracts: ['contract.nope'] })).toContain('unknown contract "contract.nope"');
    expect(checkRunConfig({ party, contracts: [RELIC, RELIC] })).toContain('a contract is taken twice');
  });
});

describe('run history', () => {
  it('keeps each contract, whether it was done, and its reward', () => {
    const result = {
      ...emptyRunResult('victory'),
      extras: { 'track.contracts': [{ contract: RELIC, reward: { renown: 100 }, complete: true }] },
    };
    expect(runRecord(1, result).contracts).toEqual([{ id: RELIC, complete: true, reward: { renown: 100, trophies: 0, favor: {} } }]);
  });
});
