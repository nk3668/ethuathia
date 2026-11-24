/**
 * A recover objective at a set depth and the Smithy's building quest in the sim (ETH-093): the
 * item lies on the floor the objective names, the contract is done once it is carried, and the run
 * result says so for the milestone that opens the building. Fixed seeds and hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import { CONTRACT_COLD_ANVIL, CONTRACT_RECOVER_RELIC, ITEM_EMBER_RELIQUARY, ITEM_GUILD_ANVIL } from '../../src/content';
import { checkInvariants, completedObjectives, createRun, describeObjective, planFloor, runResult, step } from '../../src/sim';
import type { RunConfig, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const FLOORS = [
  ['##########', '#<@.....>#', '##########'],
  ['##########', '#<.....>.#', '##########'],
  ['##########', '#<.......#', '##########'],
];
const ANVIL = CONTRACT_COLD_ANVIL.id;
const RELIC = CONTRACT_RECOVER_RELIC.id;

function run(config: Partial<RunConfig> = {}, depth = 3): RunState {
  return createRun({ party: [HERO], depth, floorTexts: FLOORS.slice(0, depth), monsters: false, contracts: [ANVIL], ...config }, 1);
}

function stepAll(state: RunState, cap = 600): void {
  for (let i = 0; i < cap && state.domains.run.end === null; i++) {
    step(state, []);
    expect(checkInvariants(state)).toEqual([]);
  }
}

describe('recover at a set depth', () => {
  it('places the item on that floor only, and not on the bottom floor', () => {
    const state = run({ floorTexts: [...FLOORS, ['##########', '#<.......#', '##########']] }, 4);
    expect(planFloor(state, 'd3').items?.map((i) => i.item.def)).toEqual([ITEM_GUILD_ANVIL.id]);
    for (const floor of ['d1', 'd2', 'd4']) expect(planFloor(state, floor).items ?? []).toEqual([]);
  });

  it('puts a relic with no depth on the bottom floor, as before', () => {
    const state = run({ contracts: [RELIC] }, 3);
    expect(planFloor(state, 'd3').items?.map((i) => i.item.def)).toEqual([ITEM_EMBER_RELIQUARY.id]);
    expect(planFloor(state, 'd2').items ?? []).toEqual([]);
  });

  it('places both a mid-dungeon quest item and the relic', () => {
    const state = run({ contracts: [ANVIL, RELIC] }, 4);
    expect(planFloor(state, 'd3').items?.map((i) => i.item.def)).toEqual([ITEM_GUILD_ANVIL.id]);
    expect(planFloor(state, 'd4').items?.map((i) => i.item.def)).toContain(ITEM_EMBER_RELIQUARY.id);
  });

  it('falls back to the bottom floor when the dungeon is shallower than the depth', () => {
    const state = run({}, 2);
    expect(planFloor(state, 'd2').items?.map((i) => i.item.def)).toEqual([ITEM_GUILD_ANVIL.id]);
  });

  it('words the objective with its floor', () => {
    expect(describeObjective(CONTRACT_COLD_ANVIL.objective)).toBe('Find the Guild anvil on floor 3 and carry it out');
    expect(describeObjective(CONTRACT_RECOVER_RELIC.objective)).toMatch(/on the bottom floor/);
  });
});

describe('The Cold Anvil in a run', () => {
  it('is done by a retreat that carries the anvil out, and the result lists it as complete', () => {
    const state = run();
    stepAll(state);
    const { end } = state.domains.run;
    // The baseline turns back as soon as the contract is complete, from floor 3, so the run is a victory walk-out.
    expect(end?.outcome).toBe('victory');
    expect(completedObjectives(runResult(state).extras)).toContain(`contract:${ANVIL}`);
    expect(runResult(state).atRisk.trophies).toBeGreaterThanOrEqual(100);
  });

  it('is not complete if the party turns back without it', () => {
    const state = run();
    for (let i = 0; i < 3; i++) step(state, [{ type: 'retreat' }]);
    stepAll(state);
    expect(state.domains.run.end?.outcome).toBe('retreat');
    expect(completedObjectives(runResult(state).extras)).not.toContain(`contract:${ANVIL}`);
  });
});
