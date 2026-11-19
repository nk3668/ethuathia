/**
 * Contracts and Recover the relic (ETH-024): the relic is placed on the bottom floor, picking it
 * up completes the contract and pays its reward into the at-risk total, and walking out with every
 * contract complete is a victory. Fixed seeds and hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { CONTRACT_RECOVER_RELIC, ITEM_EMBER_RELIQUARY } from '../../src/content';
import {
  checkInvariants,
  createRun,
  deserialize,
  floorItems,
  inventoryOf,
  planFloor,
  RENOWN,
  runResult,
  serialize,
  stateHash,
  step,
} from '../../src/sim';
import type { ContractRecord, RunConfig, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['##########', '#<.......#', '##########'];

const RELIC = CONTRACT_RECOVER_RELIC.id;
const CONFIG: RunConfig = { party: [HERO], depth: 2, floorTexts: [D1, D2], monsters: false, contracts: [RELIC] };

function run(config: Partial<RunConfig> = {}, seed = 1): RunState {
  return createRun({ ...CONFIG, ...config }, seed);
}

/** Steps until `done` holds or the run ends (at most `cap` steps), checking invariants; returns every event. */
function stepUntil(state: RunState, done: (events: SimEvent[]) => boolean = () => false, cap = 400): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < cap && state.domains.run.end === null && !done(events); i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

const types = (events: SimEvent[]) => events.map((e) => e.type);
const contractsExtra = (state: RunState) => runResult(state).extras['track.contracts'] as ContractRecord[];

describe('contracts', () => {
  it('start with the selected contracts, nothing done, and survive a save', () => {
    const state = run();
    expect(state.domains.quests.contracts).toEqual([{ contract: RELIC, progress: { current: 0, target: 1 }, complete: false }]);
    expect(deserialize(serialize(state)).domains.quests).toEqual(state.domains.quests);
    expect(run({ contracts: undefined }).domains.quests.contracts).toEqual([]);
  });

  it('refuse an unknown or repeated contract', () => {
    expect(() => run({ contracts: ['contract.nope'] })).toThrow(/Unknown contract/);
    expect(() => run({ contracts: [RELIC, RELIC] })).toThrow(/twice/);
  });

  it('are announced on the first turn with their rewards', () => {
    const state = run();
    const events = step(state, []);
    expect(events.find((e) => e.type === 'contractsTaken')).toMatchObject({ contracts: [{ contract: RELIC, reward: { renown: 100 } }] });
    expect(types(step(state, []))).not.toContain('contractsTaken');
    expect(types(step(run({ contracts: undefined }), []))).not.toContain('contractsTaken');
  });
});

describe('Recover the relic', () => {
  it('places the relic on the bottom floor only, far from the stairs up, the same for a seed', () => {
    const state = run();
    expect(planFloor(state, 'd1').items ?? []).toEqual([]);
    const items = planFloor(state, 'd2').items ?? [];
    expect(items).toHaveLength(1);
    const relic = items[0];
    expect(relic?.item).toEqual({ def: ITEM_EMBER_RELIQUARY.id, qty: 1 });
    // The corridor runs from the stairs up at x=1 to x=8: the far quarter is x=6..8.
    expect(relic?.pos.y).toBe(1);
    expect(relic?.pos.x).toBeGreaterThanOrEqual(6);
    expect(planFloor(run(), 'd2').items).toEqual(items);
    // No contract, no relic.
    expect(planFloor(run({ contracts: undefined }), 'd2').items ?? []).toEqual([]);
  });

  it('is complete once picked up, which pays the reward into the at-risk total', () => {
    const state = run();
    const events = stepUntil(state, (es) => types(es).includes('contractCompleted'));
    const done = events.find((e) => e.type === 'contractCompleted');
    expect(done).toMatchObject({ contract: RELIC, actor: state.party[0], reward: { renown: 100 }, floor: 'd2' });
    // Picked up, then completed, by the baseline's fetch rule.
    const picked = events.findIndex((e) => e.type === 'pickedUp' && e.item === ITEM_EMBER_RELIQUARY.id);
    expect(picked).toBeGreaterThanOrEqual(0);
    expect(picked).toBeLessThan(events.indexOf(done as SimEvent));
    expect(state.domains.quests.contracts[0]).toMatchObject({ complete: true, progress: { current: 1, target: 1 } });
    // Depth 2 is worth 10 Renown; the contract adds its 100.
    expect(state.domains.run.rewards.atRisk[RENOWN]).toBeGreaterThanOrEqual(110);
  });

  it('wins the run when the party walks out with it', () => {
    const state = run();
    const events = stepUntil(state);
    const end = state.domains.run.end;
    expect(end?.outcome).toBe('victory');
    expect(end?.cause).toMatch(/^The contract was done: Recover the relic\. The party reached the bottom/);
    // The baseline heads up as soon as the contract is complete.
    expect(events.filter((e) => e.type === 'turnedBack')).toHaveLength(1);
    expect(events.at(-1)?.type).toBe('runEnded');
    expect(contractsExtra(state)).toEqual([{ contract: RELIC, reward: { renown: 100 }, complete: true }]);
    expect(runResult(state).atRisk[RENOWN]).toBeGreaterThanOrEqual(110);
  });

  it('is a retreat, paying nothing for the contract, when the party walks out without it', () => {
    const state = run();
    // Turned back before ever reaching the bottom floor.
    step(state, [{ type: 'retreat' }]);
    stepUntil(state);
    expect(state.domains.run.end?.outcome).toBe('retreat');
    expect(state.domains.run.end?.cause).toMatch(/Not everything was done: Recover the relic was left undone\.$/);
    expect(contractsExtra(state)).toEqual([{ contract: RELIC, reward: { renown: 100 }, complete: false }]);
    expect(runResult(state).atRisk[RENOWN] ?? 0).toBeLessThan(100);
  });

  it('is undone, and its reward taken back, when the bearer falls', () => {
    const state = run({ party: [HERO, MIRA] });
    stepUntil(state, (es) => types(es).includes('contractCompleted'));
    const bearer = state.party.map((id) => state.entities[id]).find((e) => e !== undefined && inventoryOf(e).length > 0);
    if (bearer?.actor === undefined) throw new Error('nobody carries the relic');
    bearer.actor.hp = 0;
    const events = step(state, []);
    expect(types(events)).toContain('contractLost');
    expect(types(events)).toContain('fell');
    expect(state.domains.quests.contracts[0]?.complete).toBe(false);
    expect(state.domains.run.rewards.atRisk[RENOWN] ?? 0).toBeLessThan(100);
    expect(checkInvariants(state)).toEqual([]);
  });

  it('carries on the same after a save and load mid-run', () => {
    const state = run({ party: [HERO, MIRA] }, 3);
    stepUntil(state, (es) => types(es).includes('floorEntered'));
    const copy = deserialize(serialize(state));
    stepUntil(state);
    stepUntil(copy);
    expect(stateHash(copy)).toBe(stateHash(state));
    expect(copy.domains.run.end?.outcome).toBe('victory');
  });

  it('has exactly one relic once the bottom floor is built', () => {
    const state = run();
    stepUntil(state, (es) => types(es).includes('floorEntered'));
    expect(floorItems(state, 'd2').filter((e) => e.item.def === ITEM_EMBER_RELIQUARY.id)).toHaveLength(1);
  });
});
