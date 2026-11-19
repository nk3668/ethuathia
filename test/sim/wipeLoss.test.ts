/**
 * At-risk run currency and the wipe loss (ETH-023): a victory or a retreat banks every at-risk
 * currency, a wipe banks 75% of each (rounded down) and records the rest as lost. Fixed seed,
 * hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { applyRunResult, newProfile } from '../../src/meta';
import type { Profile } from '../../src/meta';
import {
  checkInvariants,
  createRun,
  deserialize,
  favorKey,
  getEntity,
  keptAfterWipe,
  runResult,
  serialize,
  step,
  VICTORY_CHECKS,
  WIPE_LOSS_SHARE,
  wipeLoss,
} from '../../src/sim';
import type { ActorEntity, EntityId, RunConfig, RunState, SimEvent, VictoryCheck } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['#######', '#<...>#', '#######'];
const D3 = ['#####', '#<..#', '#####'];
const CONFIG: RunConfig = { party: [HERO], depth: 3, floorTexts: [D1, D2, D3] };
const DAWN = favorKey('deity.dawn');

function setup(): { state: RunState; hero: ActorEntity } {
  const state = createRun(CONFIG, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

function runToEnd(state: RunState, cap = 300): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < cap && state.domains.run.end === null; i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

/** Steps until the party has earned some Renown on floor 2 or deeper, still alive. */
function earnSome(state: RunState): void {
  for (let i = 0; i < 300 && state.domains.floors.deepest < 3; i++) step(state, []);
  expect(state.domains.run.end).toBeNull();
  expect(state.domains.run.rewards.atRisk.renown).toBeGreaterThan(0);
}

describe('wipeLoss', () => {
  it('is a quarter, kept as one constant', () => {
    expect(WIPE_LOSS_SHARE).toBe(0.25);
  });

  it('keeps 75% of each currency, rounded down, so the loss rounds up', () => {
    expect([0, 1, 2, 3, 4, 10, 99, 100, 1001].map(keptAfterWipe)).toEqual([0, 0, 1, 2, 3, 7, 74, 75, 750]);
    expect(wipeLoss({ renown: 10, trophies: 3, [DAWN]: 1 }, 'wipe')).toEqual({ renown: 3, trophies: 1, [DAWN]: 1 });
    expect(wipeLoss({ renown: 100, trophies: 0 }, 'wipe')).toEqual({ renown: 25 });
  });

  it('takes nothing on a victory or a retreat', () => {
    expect(wipeLoss({ renown: 10, trophies: 3 }, 'victory')).toEqual({});
    expect(wipeLoss({ renown: 10, trophies: 3 }, 'retreat')).toEqual({});
  });

  it('never takes more than was at risk', () => {
    for (let n = 0; n <= 500; n++) {
      const lost = wipeLoss({ renown: n }, 'wipe').renown ?? 0;
      expect(lost).toBeGreaterThanOrEqual(0);
      expect(lost).toBeLessThanOrEqual(n);
      expect(n - lost).toBe(Math.floor((n * 3) / 4));
    }
  });
});

describe('at-risk currency in a run', () => {
  it('survives a serialize round-trip', () => {
    const { state } = setup();
    earnSome(state);
    const copy = deserialize(serialize(state));
    expect(copy.domains.run.rewards.atRisk).toEqual(state.domains.run.rewards.atRisk);
    expect(copy.domains.run.rewards.atRisk).not.toBe(state.domains.run.rewards.atRisk);
  });

  it('a wipe loses 25% of the at-risk total, logs it just before runEnded and puts it in the RunResult', () => {
    const { state, hero } = setup();
    earnSome(state);
    hero.actor.hp = 0;
    const events = step(state, []);
    expect(checkInvariants(state)).toEqual([]);
    expect(events.map((e) => e.type).slice(-3)).toEqual(['fell', 'earningsLost', 'runEnded']);

    const result = runResult(state);
    const renown = result.atRisk.renown as number;
    expect(result.outcome).toBe('wipe');
    expect(result.lost).toEqual({ renown: renown - Math.floor(renown * 0.75) });
    // The event's projection agrees with the totals the trackers settled on.
    const lostEvent = events.find((e) => e.type === 'earningsLost');
    expect(lostEvent).toMatchObject({ lost: result.lost, atRisk: result.atRisk, share: WIPE_LOSS_SHARE });

    // Meta banks the rest.
    const before: Profile = { ...newProfile(), currencies: { renown: 500, trophies: 40, favor: {} } };
    const after = applyRunResult(before, result);
    expect(after.currencies.renown).toBe(500 + Math.floor(renown * 0.75));
    expect(after.currencies.trophies).toBe(40);
  });

  it('a wipe with nothing earned loses nothing and logs no loss', () => {
    const { state, hero } = setup();
    step(state, []);
    hero.actor.hp = 0;
    expect(step(state, []).map((e) => e.type)).toEqual(['fell', 'runEnded']);
    expect(runResult(state).lost).toEqual({});
  });

  it('a retreat banks everything', () => {
    const { state } = setup();
    const events = runToEnd(state);
    const result = runResult(state);
    expect(result.outcome).toBe('retreat');
    expect(result.lost).toEqual({});
    expect(events.some((e) => e.type === 'earningsLost')).toBe(false);
    const after = applyRunResult(newProfile(), result);
    expect(after.currencies.renown).toBe(result.atRisk.renown);
  });

  it('a victory banks everything', () => {
    const check: VictoryCheck = { id: 'victory.test_wipe_loss', check: () => ({ applies: true, met: true, detail: 'Done.' }) };
    VICTORY_CHECKS.push(check);
    try {
      const { state } = setup();
      runToEnd(state);
      const result = runResult(state);
      expect(result.outcome).toBe('victory');
      expect(result.lost).toEqual({});
      expect(applyRunResult(newProfile(), result).currencies.renown).toBe(result.atRisk.renown);
    } finally {
      VICTORY_CHECKS.splice(VICTORY_CHECKS.indexOf(check), 1);
    }
  });

  it('never lowers the banked totals, whatever the outcome', () => {
    const banked = { renown: 1000, trophies: 200, favor: { 'deity.dawn': 9 } };
    for (const outcome of ['victory', 'retreat', 'wipe'] as const) {
      const atRisk = { renown: 37, trophies: 5, [DAWN]: 3 };
      const after = applyRunResult({ ...newProfile(), currencies: banked }, { outcome, atRisk, lost: wipeLoss(atRisk, outcome), turns: 10, deepestDepth: 2, extras: {} });
      expect(after.currencies.renown).toBeGreaterThanOrEqual(banked.renown);
      expect(after.currencies.trophies).toBeGreaterThanOrEqual(banked.trophies);
      expect(after.currencies.favor['deity.dawn']).toBeGreaterThanOrEqual(9);
      const kept = outcome === 'wipe' ? { renown: 27, trophies: 3, favor: 2 } : { renown: 37, trophies: 5, favor: 3 };
      expect(after.currencies).toEqual({ renown: 1000 + kept.renown, trophies: 200 + kept.trophies, favor: { 'deity.dawn': 9 + kept.favor } });
    }
  });
});
