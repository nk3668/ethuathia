/**
 * Shared conditions (ETH-121): run-scope conditions, the data `Requirement`, its wording, its
 * validation, `track.requirements` and the `metInRun` milestone. Fixed seeds, hand-built floors.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILDING_KIND, BUILDINGS, checkKinds, describeMilestone, requirementKey, requirementSchema } from '../../src/content';
import type { BuildingDef, ContentKind, Requirement } from '../../src/content';
import { Registry } from '../../src/core';
import { applyRunResult, buildRunConfig, defaultRunChoices, isMilestoneOpen, milestoneRequirements, newProfile } from '../../src/meta';
import {
  checkInvariants,
  checkRequirement,
  CONDITION_TARGET,
  CONDITIONS,
  createRun,
  describeRequirement,
  deserialize,
  getEntity,
  metRequirements,
  requirementProblems,
  requirementScope,
  runResult,
  serialize,
  step,
} from '../../src/sim';
import type { AiActor, AiCtx, RunConfig, RunState } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['##########', '#<......>#', '##########'];
const D3 = ['##########', '#<.......#', '##########'];
const CONFIG: RunConfig = { party: [HERO], depth: 3, floorTexts: [D1, D2, D3], monsters: false };

const AT_3: Requirement = { cond: 'cond.at_depth', params: { depth: 3 } };

function aiCtx(state: RunState): AiCtx {
  return { state, actor: getEntity(state, state.party[0] as number) as AiActor };
}

/** Steps until `done` holds or the run ends, checking invariants. */
function stepUntil(state: RunState, done: () => boolean, cap = 400): void {
  for (let i = 0; i < cap && state.domains.run.end === null && !done(); i++) {
    step(state, []);
    expect(checkInvariants(state)).toEqual([]);
  }
}

describe('condition scopes', () => {
  it('mark the run-level conditions run and leave the rest actor', () => {
    for (const id of ['cond.always', 'cond.heading_out', 'cond.bottom_floor', 'cond.contracts_complete', 'cond.at_depth']) {
      expect(CONDITIONS.get(id).scope, id).toBe('run');
    }
    expect(CONDITIONS.get('cond.hp_below').scope).toBe('actor');
    expect(CONDITIONS.get('cond.stuck').scope).toBe('actor');
  });

  it('give a run-scope condition the same answer in a rule and in a requirement', () => {
    const state = createRun(CONFIG, 1);
    const check = () => {
      for (const id of ['cond.bottom_floor', 'cond.heading_out', 'cond.always']) {
        const inRule = CONDITIONS.get(id).evaluate(aiCtx(state), undefined);
        expect(checkRequirement({ state }, { cond: id })).toEqual(inRule);
      }
    };
    check();
    stepUntil(state, () => getEntity(state, state.party[0] as number).floor === 'd3');
    expect(checkRequirement({ state }, { cond: 'cond.bottom_floor' }).ok).toBe(true);
    check();
    stepUntil(state, () => state.domains.run.leaving !== null);
    expect(checkRequirement({ state }, { cond: 'cond.heading_out' }).ok).toBe(true);
    check();
  });

  it('never let an actor condition hold without an actor', () => {
    const state = createRun(CONFIG, 1);
    expect(checkRequirement({ state }, { cond: 'cond.hp_below', params: { percent: 99 } })).toEqual({
      ok: false,
      detail: 'needs an adventurer to check',
    });
  });
});

describe('requirements', () => {
  const state = createRun(CONFIG, 1);
  const always: Requirement = { cond: 'cond.always' };
  const never: Requirement = { not: always };

  it('combine with all, any and not', () => {
    expect(checkRequirement({ state }, always).ok).toBe(true);
    expect(checkRequirement({ state }, never).ok).toBe(false);
    expect(checkRequirement({ state }, { all: [always, always] }).ok).toBe(true);
    expect(checkRequirement({ state }, { all: [always, never] }).ok).toBe(false);
    expect(checkRequirement({ state }, { any: [never, always] }).ok).toBe(true);
    expect(checkRequirement({ state }, { any: [never, never] }).ok).toBe(false);
    expect(checkRequirement({ state }, { not: { any: [never] } }).ok).toBe(true);
    expect(checkRequirement({ state }, { cond: 'cond.nope' })).toEqual({ ok: false, detail: 'unknown condition "cond.nope"' });
  });

  it('are worded from each condition', () => {
    const hurt: Requirement = { cond: 'cond.hp_below', params: { percent: 30 } };
    expect(describeRequirement({ all: [hurt, { not: { cond: 'cond.bottom_floor' } }] })).toBe('HP below 30% and not on the bottom floor');
    expect(describeRequirement({ any: [AT_3, { cond: 'cond.heading_out' }, always] })).toBe(
      'on floor 3 or deeper, heading out of the dungeon or always',
    );
    expect(describeRequirement({ all: [{ any: [hurt, AT_3] }, always] })).toBe('(HP below 30% or on floor 3 or deeper) and always');
    expect(describeMilestone({ kind: 'metInRun', requirement: AT_3 }, describeRequirement)).toBe('Achieve in one run: on floor 3 or deeper');
  });

  it('know their scope and report problems for it', () => {
    const hurt: Requirement = { cond: 'cond.hp_below', params: { percent: 30 } };
    expect(requirementScope({ all: [AT_3, always] })).toBe('run');
    expect(requirementScope({ all: [AT_3, hurt] })).toBe('actor');
    expect(requirementProblems({ all: [AT_3, hurt] }, 'actor')).toEqual([]);
    expect(requirementProblems({ all: [AT_3, hurt] }, 'run')).toEqual([
      'requirement.all[1].cond: condition "cond.hp_below" needs an adventurer to check, but this requirement is checked for the whole run',
    ]);
    expect(requirementProblems({ not: { cond: 'cond.at_depth', params: { depth: 0 } } }, 'run')[0]).toMatch(/not\.cond: .*bad params/);
    expect(requirementProblems({ cond: 'cond.nope' }, 'run')).toEqual(['requirement.cond: unknown condition "cond.nope"']);
  });

  it('have a schema and a key that ignores key order', () => {
    expect(requirementSchema.safeParse({ all: [AT_3, { not: { cond: 'cond.always' } }] }).success).toBe(true);
    expect(requirementSchema.safeParse({ all: [] }).success).toBe(false);
    expect(requirementSchema.safeParse({ cond: 'always' }).success).toBe(false);
    expect(requirementSchema.safeParse({ cond: 'cond.always', extra: 1 }).success).toBe(false);
    expect(requirementKey({ params: { depth: 3 }, cond: 'cond.at_depth' } as Requirement)).toBe(requirementKey(AT_3));
  });

  it('are checked by content validation against the conditions', () => {
    expect(CONDITION_TARGET.kind).toBe(CONDITIONS.kind);
    const registry = new Registry<BuildingDef>('building');
    const kind: ContentKind<BuildingDef> = { ...BUILDING_KIND, registry };
    const base = { name: 'Hut', description: 'A hut.', tags: [] };
    const unlock = (requirement: Requirement) => ({ kind: 'metInRun' as const, requirement });
    registry.register({ ...base, id: 'building.ok', unlock: unlock({ all: [AT_3, { cond: 'cond.heading_out' }] }) });
    registry.register({ ...base, id: 'building.unknown', unlock: unlock({ cond: 'cond.nope' }) });
    registry.register({ ...base, id: 'building.actor', unlock: unlock({ any: [AT_3, { cond: 'cond.stuck' }] }) });
    registry.register({ ...base, id: 'building.params', unlock: unlock({ cond: 'cond.at_depth' }) });
    const problems = checkKinds([kind] as ContentKind[], [CONDITION_TARGET]);
    expect(problems.some((p) => p.includes('building.ok'))).toBe(false);
    expect(problems).toContain('building "building.unknown": unlock.requirement.cond refers to unknown rule condition "cond.nope"');
    expect(problems.some((p) => p.includes('building.actor') && p.includes('unlock.requirement.any[1].cond') && p.includes('needs an adventurer'))).toBe(true);
    expect(problems.some((p) => p.includes('building.params') && p.includes('bad params'))).toBe(true);
  });
});

describe('track.requirements and metInRun', () => {
  afterEach(() => vi.restoreAllMocks());

  it('records a watched requirement the run met, once, and survives a save', () => {
    const state = createRun({ ...CONFIG, watchRequirements: [AT_3, { cond: 'cond.heading_out' }] }, 1);
    stepUntil(state, () => getEntity(state, state.party[0] as number).floor === 'd2');
    expect(state.domains.run.trackers['track.requirements']).toEqual({ met: [] });
    stepUntil(state, () => false);
    expect(state.domains.run.end).not.toBeNull();
    const met = metRequirements(runResult(state).extras);
    expect(met).toEqual([requirementKey(AT_3), requirementKey({ cond: 'cond.heading_out' })]);
    expect(deserialize(serialize(state)).domains.run.trackers).toEqual(state.domains.run.trackers);
  });

  it('watches nothing by default', () => {
    const state = createRun(CONFIG, 1);
    stepUntil(state, () => false);
    expect(metRequirements(runResult(state).extras)).toEqual([]);
  });

  it('unlocks a metInRun milestone from a fixed-seed run that reaches floor 3', () => {
    const hall: BuildingDef = {
      id: 'building.deep_hall',
      name: 'Deep Hall',
      description: 'Opens once a party stands on floor 3.',
      tags: [],
      unlock: { kind: 'metInRun', requirement: AT_3 },
    };
    vi.spyOn(BUILDINGS, 'all').mockReturnValue([...BUILDINGS.all(), hall]);
    const profile = newProfile();
    expect(isMilestoneOpen(profile, hall.id)).toBe(false);
    expect(milestoneRequirements(profile)).toEqual([AT_3]);
    expect(buildRunConfig(profile, defaultRunChoices(), 1).watchRequirements).toEqual([AT_3]);

    // A run that stops short of floor 3 opens nothing.
    const shallow = createRun({ ...CONFIG, depth: 2, floorTexts: [D1, D3], watchRequirements: [AT_3] }, 1);
    stepUntil(shallow, () => false);
    const after = applyRunResult(profile, runResult(shallow));
    expect(isMilestoneOpen(after, hall.id)).toBe(false);

    const deep = createRun({ ...CONFIG, watchRequirements: [AT_3] }, 1);
    stepUntil(deep, () => false);
    const opened = applyRunResult(after, runResult(deep));
    expect(isMilestoneOpen(opened, hall.id)).toBe(true);
    expect(opened.milestones.unlocked).toContainEqual({ id: hall.id, run: 2 });
    // Once open, it is no longer watched.
    expect(milestoneRequirements(opened)).toEqual([]);
  });
});
