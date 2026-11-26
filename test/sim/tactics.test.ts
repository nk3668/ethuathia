/**
 * The tactics engine (ETH-162): option content and its validation, building an adventurer's rule
 * list from picks, option-driven behavior on hand-built maps, swapping mid-run with `setTactics`,
 * the tag fallback in the trace, and the neutral defaults that leave the baseline untouched.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  FOCUS_STRONGEST,
  FORMATION_LOOSE,
  HABIT_QUICK_TO_QUAFF,
  picksProblems,
  RANGE_BACK_LINE,
  ROLE_HEALER,
  STANCE_FALL_BACK,
  TACTIC_KIND,
  TACTICS,
  tacticParamProblems,
} from '../../src/content';
import type { TacticDef } from '../../src/content';
import { buildTacticRules, checkGame, createRun, defaultPicks, getEntity, startingPicks } from '../../src/sim';
import type { AdventurerConfig, AiActor, EntityId, RunState, TacticPicks } from '../../src/sim';

const HERO: AdventurerConfig = { name: 'Brannoc', classId: 'class.reaver', raceId: 'race.human' };
const WALL = '#'.repeat(40);
const HALL = [WALL, '#<@' + '.'.repeat(36) + '#', '#' + '.'.repeat(38) + '#', WALL];

function hall(party = [HERO], seed = 3): { state: RunState; hero: AiActor } {
  const state = createRun({ party, floorText: HALL, depth: 1, monsters: false }, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as AiActor };
}
const picks = (over: Partial<TacticPicks> = {}): TacticPicks => ({ ...defaultPicks('class.reaver'), ...over });

describe('tactic content', () => {
  it('passes the game checks, including every row accepting its params', () => {
    expect(checkGame()).toEqual([]);
  });

  it('has a neutral default on every axis and every class has a valid default build', () => {
    for (const axis of ['stance', 'formation', 'role', 'range', 'focus'] as const) {
      expect(TACTICS.all().some((t) => t.axis === axis && t.tags.includes('default')), axis).toBe(true);
    }
    for (const c of CLASSES.all()) expect(picksProblems(c.tactics ?? defaultPicks(c.id)), c.id).toEqual([]);
  });

  const base: TacticDef = { id: 'tactic.test_x', name: 'X', description: 'x', hint: 'x', tags: [], axis: 'role' };
  const ok = (patch: Record<string, unknown>) => TACTIC_KIND.schema.safeParse({ ...base, ...patch }).success;

  it('keeps rows on stance, role and habit options and params on formation, range and focus options', () => {
    const row = { condition: { id: 'cond.always' }, action: { id: 'act.wait' } };
    expect(ok({ rows: [row] })).toBe(true);
    expect(ok({ axis: 'focus', rows: [row], params: { prefer: 'weakest' } })).toBe(false);
    expect(ok({ axis: 'focus', params: { prefer: 'weakest' } })).toBe(true);
    expect(ok({ axis: 'focus' })).toBe(false);
    expect(ok({ params: { prefer: 'weakest' } })).toBe(false);
    expect(ok({ axis: 'range', params: { engage: 0 } })).toBe(false);
    expect(ok({ axis: 'formation', params: { leash: 3, close: 5 } })).toBe(false);
    expect(tacticParamProblems('focus', { prefer: 'sideways' })).not.toEqual([]);
  });

  it('allows exclusiveWith on habits only, never on itself, and requires and favors to name classes', () => {
    expect(ok({ axis: 'habit', exclusiveWith: ['tactic.other'] })).toBe(true);
    expect(ok({ exclusiveWith: ['tactic.other'] })).toBe(false);
    expect(ok({ axis: 'habit', exclusiveWith: ['tactic.test_x'] })).toBe(false);
    expect(ok({ requires: { classes: ['class.vanguard'] }, favors: { classes: ['class.reaver'] } })).toBe(true);
    expect(ok({ requires: { classes: ['vanguard'] } })).toBe(false);
  });

  it('checks the axis and exclusivity of picks', () => {
    expect(picksProblems(defaultPicks('class.vanguard'))).toEqual([]);
    expect(picksProblems({ ...picks(), role: 'tactic.weakest' })[0]).toContain('is a focus tactic, not a role tactic');
    expect(picksProblems({ ...picks(), role: 'tactic.nope' })[0]).toContain('unknown role tactic');
    expect(picksProblems({ ...picks(), habits: ['tactic.quick_to_quaff', 'tactic.quick_to_quaff'] })[0]).toContain('twice');
    expect(picksProblems({ ...picks(), habits: ['a', 'b', 'c', 'd'].map(() => 'tactic.quick_to_quaff') }).join()).toContain('at most 3');
    // Exclusive pairs, against options of the test's own.
    const a: TacticDef = { ...base, id: 'tactic.hab_a', axis: 'habit', exclusiveWith: ['tactic.hab_b'] };
    const b: TacticDef = { ...base, id: 'tactic.hab_b', axis: 'habit', exclusiveWith: ['tactic.hab_a'] };
    const lookup = (id: string) => ({ 'tactic.hab_a': a, 'tactic.hab_b': b })[id] ?? TACTICS.get(id);
    expect(picksProblems({ ...picks(), habits: [a.id, b.id] }, lookup).join()).toContain("can't be taken with");
    expect(picksProblems({ ...picks(), habits: [a.id] }, lookup)).toEqual([]);
  });
});

describe('building rules from picks', () => {
  it('is empty for the neutral picks', () => {
    expect(buildTacticRules(picks())).toEqual([]);
  });

  it('orders stance, then habits in pick order, then role, and tags each row with its option', () => {
    const rules = buildTacticRules(picks({ stance: STANCE_FALL_BACK.id, habits: [HABIT_QUICK_TO_QUAFF.id], role: ROLE_HEALER.id }));
    expect(rules.map((r) => [r.option, r.action.id])).toEqual([
      [STANCE_FALL_BACK.id, 'act.retreat_run'],
      [HABIT_QUICK_TO_QUAFF.id, 'act.use_ability'],
      [ROLE_HEALER.id, 'act.use_ability'],
      [ROLE_HEALER.id, 'act.tend_ally'],
      [ROLE_HEALER.id, 'act.hang_back'],
    ]);
    expect(rules.every((r) => r.enabled)).toBe(true);
  });

  it('is pure: the same picks build equal lists that share no objects with the content', () => {
    const p = picks({ role: ROLE_HEALER.id });
    const a = buildTacticRules(p);
    const b = buildTacticRules(p);
    expect(a).toEqual(b);
    expect(a[0]?.action).not.toBe(ROLE_HEALER.rows?.[0]?.action);
  });

  it('adds no rows for range, focus and formation options', () => {
    expect(buildTacticRules(picks({ range: RANGE_BACK_LINE.id, focus: FOCUS_STRONGEST.id, formation: FORMATION_LOOSE.id }))).toEqual([]);
  });

  it('starts a recruit on the class build, with their own picks over it and the party axes from the config', () => {
    const own = startingPicks('class.reaver', { stance: STANCE_FALL_BACK.id }, { role: ROLE_HEALER.id });
    expect(own).toMatchObject({ stance: STANCE_FALL_BACK.id, role: ROLE_HEALER.id, focus: defaultPicks('class.reaver').focus });
    const { hero } = hall();
    expect(hero.ai.tactics).toEqual(defaultPicks('class.reaver'));
    expect(hero.ai.rules).toEqual([]);
  });

  it('refuses to start a run with picks that cannot be played', () => {
    expect(() => createRun({ party: [{ ...HERO, tactics: { role: 'tactic.weakest' } }], floorText: HALL, depth: 1 }, 1)).toThrow(/invalid tactics/);
    expect(() => createRun({ party: [HERO], tactics: { stance: 'tactic.healer' }, floorText: HALL, depth: 1 }, 1)).toThrow(/invalid tactics/);
  });
});


describe('the neutral defaults', () => {
  const defs = TACTICS.all();
  it('have exactly one default per axis but habits, with no rows and baseline parameters', () => {
    expect(TACTIC_KIND.check?.(defs)).toEqual([]);
  });

  it('are reported when broken', () => {
    const broken = defs.map((d) =>
      d.id === 'tactic.stick_together' ? { ...d, params: { leash: 9, close: 3 } } : d.id === 'tactic.steady' ? { ...d, rows: STANCE_FALL_BACK.rows } : d,
    );
    const problems = (TACTIC_KIND.check?.(broken) ?? []).join('\n');
    expect(problems).toContain('default formation must have leash');
    expect(problems).toContain('default option must have no rows');
    const two = defs.map((d) => (d.id === 'tactic.fall_back' ? { ...d, tags: ['default'] } : d));
    expect((TACTIC_KIND.check?.(two) ?? []).join()).toContain('exactly one default option');
  });
});