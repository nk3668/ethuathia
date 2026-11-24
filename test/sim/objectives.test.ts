/**
 * The objective engine (ETH-114): objective kinds, tracked objectives with an owner, event
 * counters that survive a save, `avoid` objectives kept to the end, the run result's
 * `quests.objectives` and the `objectiveDone` milestone. Fixed seeds, hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_RECOVER_RELIC,
  describeMilestone,
  describeMilestoneMet,
  milestoneMet,
  milestoneRefs,
  milestoneSchema,
  objectiveRefs,
  objectiveSchema,
} from '../../src/content';
import type { Objective } from '../../src/content';
import {
  checkInvariants,
  completedObjectives,
  createRun,
  describeObjective,
  deserialize,
  findObjective,
  measureObjective,
  OBJECTIVE_KINDS,
  objectiveRecords,
  runResult,
  serialize,
  stateHash,
  step,
  trackObjective,
} from '../../src/sim';
import type { ObjectiveRecord, RunConfig, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['##########', '#<......>#', '##########'];
const D3 = ['##########', '#<.......#', '##########'];
const CONFIG: RunConfig = { party: [HERO], depth: 3, floorTexts: [D1, D2, D3], monsters: false };

const BOUNTY = { kind: 'bounty', id: 'bounty.test' } as const;
const CONDUCT = { kind: 'conduct', id: 'conduct.test' } as const;

/** Steps until `done` holds or the run ends (at most `cap` steps), checking invariants; returns every event. */
function stepUntil(state: RunState, done: () => boolean = () => false, cap = 600): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < cap && state.domains.run.end === null && !done(); i++) {
    events.push(...step(state, []));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

const deepest = (state: RunState) => state.domains.floors.deepest;

describe('objective kinds', () => {
  it('have one entry per content kind, each named for itself', () => {
    expect(Object.keys(OBJECTIVE_KINDS).sort()).toEqual(['avoid', 'condition', 'count', 'reach', 'recover']);
    for (const [name, kind] of Object.entries(OBJECTIVE_KINDS)) expect(kind.kind).toBe(name);
  });

  it('word each kind', () => {
    expect(describeObjective(CONTRACT_RECOVER_RELIC.objective)).toBe('Find the Ember Reliquary on the bottom floor and carry it out');
    expect(describeObjective({ kind: 'reach', depth: 3 })).toBe('Reach floor 3');
    expect(describeObjective({ kind: 'count', event: 'drankFountain', count: 2 })).toBe('Make "drankFountain" happen 2 times');
    expect(describeObjective({ kind: 'count', event: 'killed', match: { victimDef: 'monster.nope', byParty: true }, count: 1 })).toBe(
      'Make "killed" happen once where victimDef is monster.nope and byParty is true',
    );
    expect(describeObjective({ kind: 'condition', requirement: { cond: 'cond.at_depth', params: { depth: 3 } } })).toMatch(/^Bring about: /);
    expect(describeObjective({ kind: 'avoid', event: 'fell' })).toBe('Never let "fell" happen');
  });

  it('check their data: schema and refs', () => {
    expect(objectiveSchema.safeParse({ kind: 'count', event: 'killed', count: 0 }).success).toBe(false);
    expect(objectiveSchema.safeParse({ kind: 'count', event: 'killed', match: {}, count: 1 }).success).toBe(false);
    expect(objectiveSchema.safeParse({ kind: 'avoid', event: 'Not an event' }).success).toBe(false);
    expect(objectiveSchema.safeParse({ kind: 'reach', depth: 2 }).success).toBe(true);
    const count: Objective = { kind: 'count', event: 'killed', match: { victimDef: 'monster.slate_hound', byParty: true, floor: 'd1' }, count: 2 };
    expect(objectiveRefs('objective', count)).toEqual([{ path: 'objective.match.victimDef', kind: 'monster', id: 'monster.slate_hound' }]);
    expect(objectiveRefs('o', { kind: 'condition', requirement: { cond: 'cond.at_depth', params: { depth: 2 } } })).toEqual([
      { path: 'o.requirement.cond', kind: 'rule condition', id: 'cond.at_depth', use: { params: { depth: 2 }, scope: 'run' } },
    ]);
  });
});

describe('tracked objectives', () => {
  it('start with the contracts, owned by them, and survive a save', () => {
    const state = createRun({ ...CONFIG, contracts: [CONTRACT_RECOVER_RELIC.id] }, 1);
    expect(state.domains.quests.objectives).toEqual([
      {
        key: 'contract:contract.recover_relic',
        owner: { kind: 'contract', id: 'contract.recover_relic' },
        spec: { kind: 'recover', item: 'item.ember_reliquary' },
        current: 0,
        target: 1,
        status: 'active',
      },
    ]);
    expect(deserialize(serialize(state)).domains.quests).toEqual(state.domains.quests);
    expect(() => trackObjective(state, { kind: 'contract', id: CONTRACT_RECOVER_RELIC.id }, { kind: 'reach', depth: 2 })).toThrow(/already tracked/);
  });

  it('complete a reach objective once the party gets there', () => {
    const state = createRun(CONFIG, 1);
    const reach = trackObjective(state, BOUNTY, { kind: 'reach', depth: 2 });
    step(state, []);
    expect(reach).toMatchObject({ current: 1, target: 2, status: 'active' });
    stepUntil(state, () => deepest(state) >= 2);
    expect(reach).toMatchObject({ current: 2, target: 2, status: 'complete' });
  });

  it('hold a condition objective at 0 or 1 by its requirement', () => {
    const state = createRun(CONFIG, 1);
    const at3 = trackObjective(state, { kind: 'quest', id: 'quest.test' }, { kind: 'condition', requirement: { cond: 'cond.at_depth', params: { depth: 3 } } });
    stepUntil(state, () => deepest(state) >= 2);
    expect(at3).toMatchObject({ current: 0, target: 1, status: 'active' });
    stepUntil(state, () => deepest(state) >= 3);
    expect(at3).toMatchObject({ current: 1, target: 1, status: 'complete' });
  });

  it('count matching events from when they are tracked, not before', () => {
    const state = createRun(CONFIG, 1);
    stepUntil(state, () => deepest(state) >= 2);
    // Floor 2 was entered before this was tracked: only floor 3 counts.
    const floors = trackObjective(state, BOUNTY, { kind: 'count', event: 'floorEntered', match: { firstVisit: true }, count: 2 });
    const moves = trackObjective(state, BOUNTY, { kind: 'count', event: 'moved', count: 1000 }, 'bounty:moves');
    expect(floors).toMatchObject({ counter: 0, current: 0, target: 2 });
    step(state, []);
    // Counted within the step, at the turn hooks.
    expect(moves.counter).toBeGreaterThan(0);
    stepUntil(state, () => deepest(state) >= 3);
    expect(floors).toMatchObject({ counter: 1, current: 1, status: 'active' });
    expect(measureObjective(state, floors.spec, floors.counter)).toMatchObject({ current: 1, target: 2 });
  });

  it('fold the events after the last turn of a step too (a run end)', () => {
    const state = createRun(CONFIG, 1);
    const ended = trackObjective(state, BOUNTY, { kind: 'count', event: 'runEnded', count: 1 });
    stepUntil(state);
    expect(state.domains.run.end).not.toBeNull();
    expect(ended).toMatchObject({ counter: 1, current: 1, status: 'complete' });
  });

  it('fail an avoid objective the first time it happens, and keep an unbroken one to the end', () => {
    const state = createRun(CONFIG, 1);
    const broken = trackObjective(state, CONDUCT, { kind: 'avoid', event: 'floorEntered', match: { depth: 2 } });
    const kept = trackObjective(state, { kind: 'taboo', id: 'taboo.test' }, { kind: 'avoid', event: 'killed' });
    expect(broken).toMatchObject({ counter: 0, current: 0, target: 0, status: 'active' });
    stepUntil(state, () => deepest(state) >= 2);
    expect(broken).toMatchObject({ current: 1, target: 0, status: 'failed' });
    expect(kept.status).toBe('active');
    stepUntil(state);
    expect(state.domains.run.end).not.toBeNull();
    expect(broken.status).toBe('failed');
    expect(kept).toMatchObject({ current: 0, status: 'complete' });
    expect(checkInvariants(state)).toEqual([]);

    const records = runResult(state).extras['quests.objectives'] as ObjectiveRecord[];
    expect(records).toEqual([
      { key: 'conduct:conduct.test', owner: CONDUCT, status: 'failed' },
      { key: 'taboo:taboo.test', owner: { kind: 'taboo', id: 'taboo.test' }, status: 'complete' },
    ]);
    expect(objectiveRecords(runResult(state).extras)).toEqual(records);
    expect(completedObjectives(runResult(state).extras)).toEqual(['taboo:taboo.test']);
    expect(completedObjectives({})).toEqual([]);
  });

  it('keep event counters through a save and load mid-run', () => {
    const track = (state: RunState) => {
      trackObjective(state, BOUNTY, { kind: 'count', event: 'moved', count: 10_000 });
      trackObjective(state, CONDUCT, { kind: 'avoid', event: 'floorEntered', match: { depth: 3 } });
    };
    const straight = createRun(CONFIG, 7);
    track(straight);
    const saved = createRun(CONFIG, 7);
    track(saved);
    for (let i = 0; i < 15; i++) {
      step(straight, []);
      step(saved, []);
    }
    const counter = findObjective(saved, 'bounty:bounty.test')?.counter ?? 0;
    expect(counter).toBeGreaterThan(0);
    const loaded = deserialize(serialize(saved));
    expect(loaded.domains.quests).toEqual(saved.domains.quests);
    for (let i = 0; i < 40; i++) {
      step(straight, []);
      step(loaded, []);
    }
    expect(findObjective(loaded, 'bounty:bounty.test')?.counter).toBeGreaterThan(counter);
    expect(loaded.domains.quests).toEqual(straight.domains.quests);
    expect(stateHash(loaded)).toBe(stateHash(straight));
  });

  it('report a corrupted objective through the invariant', () => {
    const state = createRun(CONFIG, 1);
    const reach = trackObjective(state, BOUNTY, { kind: 'reach', depth: 2 });
    reach.status = 'complete';
    expect(checkInvariants(state).join('\n')).toMatch(/objective "bounty:bounty.test" is complete at 0\/2, expected active/);
  });
});

describe('the objectiveDone milestone', () => {
  const milestone = { kind: 'objectiveDone', owner: { kind: 'quest', id: 'quest.smithy' } } as const;
  const progress = { deepestDepth: 1, runs: 1, victories: 0, metInRun: [], objectivesDone: [] as string[], objectivesExited: [] as string[] };

  it('is met by a run that ended with that owner complete', () => {
    expect(milestoneSchema.safeParse(milestone).success).toBe(true);
    expect(milestoneMet(milestone, progress)).toBe(false);
    expect(milestoneMet(milestone, { ...progress, objectivesDone: ['quest:quest.smithy'] })).toBe(true);
  });

  it('words its owner and checks contract owners exist', () => {
    expect(describeMilestone(milestone)).toBe('Complete the quest quest.smithy');
    expect(describeMilestoneMet(milestone, undefined, () => 'the Smithy quest')).toBe('you completed the quest the Smithy quest');
    expect(milestoneRefs('unlock', milestone)).toEqual([]);
    expect(milestoneRefs('unlock', { kind: 'objectiveDone', owner: { kind: 'contract', id: 'contract.recover_relic' } })).toEqual([
      { path: 'unlock.owner.id', kind: 'contract', id: 'contract.recover_relic' },
    ]);
  });
});
