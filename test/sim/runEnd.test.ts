/**
 * The run domain (ETH-062): runs end as a victory, a retreat or a wipe; the tracker framework
 * turns events into at-risk rewards and `RunResult.extras`; the baseline and the `retreat`
 * command head out; the hosts report the end. Fixed seeds and hand-built floors.
 */
import { describe, expect, it } from 'vitest';
import {
  checkInvariants,
  createRun,
  DEATHS_TRACKER,
  DEPTH_TRACKER,
  deserialize,
  getEntity,
  InlineHost,
  RENOWN_PER_FLOOR,
  RUN_TRACKERS,
  runResult,
  serialize,
  SimSession,
  stateHash,
  step,
  TROPHIES,
  TURNS_PER_RENOWN,
  TURNS_TRACKER,
  VICTORY_CHECKS,
  waitDecide,
} from '../../src/sim';
import type { ActorEntity, Command, EntityId, RunConfig, RunReport, RunState, SimEvent, VictoryCheck } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const MIRA = { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' };

const D1 = ['##########', '#<@.....>#', '##########'];
const D2 = ['#######', '#<...>#', '#######'];
const D3 = ['#####', '#<..#', '#####'];

const CONFIG: RunConfig = { party: [HERO], depth: 3, floorTexts: [D1, D2, D3] };

function setup(config: Partial<RunConfig> = {}): { state: RunState; hero: ActorEntity } {
  const state = createRun({ ...CONFIG, ...config }, 1);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

/** Steps until the run ends (at most `cap` steps), checking invariants; returns every event. */
function runToEnd(state: RunState, cap = 300, commands: (i: number) => Command[] = () => []): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < cap && state.domains.run.end === null; i++) {
    events.push(...step(state, commands(i)));
    expect(checkInvariants(state)).toEqual([]);
  }
  return events;
}

const types = (events: SimEvent[]) => events.map((e) => e.type);

describe('run end', () => {
  it('starts with runStarted, which carries the party and first floor type for the log and the Codex', () => {
    const { state, hero } = setup();
    const events = step(state, []);
    expect(events[0]).toEqual({
      type: 'runStarted',
      party: [{ actor: hero.id, name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' }],
      depth: 3,
      floorType: null,
      turn: 0,
    });
    expect(types(step(state, []))).not.toContain('runStarted');

    const gen = createRun({ party: [HERO], depth: 2 }, 1);
    const genEvents = step(gen, []);
    expect(genEvents[0]).toMatchObject({ type: 'runStarted', depth: 2, floorType: 'floor.halls', turn: 0 });
    expect(gen.domains.run.trackers['track.codex']).toMatchObject({ 'floor.halls': ['seen'] });
  });

  it('goes to the bottom, turns back, climbs out and ends as a retreat when nothing makes it a victory', () => {
    const { state, hero } = setup();
    const events = runToEnd(state);
    const end = state.domains.run.end;
    expect(end).toMatchObject({ outcome: 'retreat', depth: 3, turn: state.turn });
    expect(end?.cause).toBe('The party reached the bottom of the dungeon (floor 3), turned back and walked out of the dungeon.');
    const stairs = events.filter((e) => e.type === 'tookStairs').map((e) => [e.from, e.to]);
    expect(stairs).toEqual([
      ['d1', 'd2'],
      ['d2', 'd3'],
      ['d3', 'd2'],
      ['d2', 'd1'],
    ]);
    // The order of the last events: turned back on the bottom floor, left, ended.
    const turned = events.findIndex((e) => e.type === 'turnedBack');
    expect(events[turned]).toMatchObject({ actor: hero.id, reason: 'rule' });
    expect(types(events).slice(-2)).toEqual(['leftDungeon', 'runEnded']);
    expect(events.at(-1)).toMatchObject({ type: 'runEnded', outcome: 'retreat', depth: 3 });
    expect(events.filter((e) => e.type === 'stuck')).toEqual([]);

    // A finished run stays as it ended.
    const hash = stateHash(state);
    expect(step(state, [{ type: 'retreat' }])).toEqual([]);
    expect(stateHash(state)).toBe(hash);
  });

  it('builds the RunResult from the trackers: renown for depth and turns, extras by tracker id', () => {
    const { state } = setup();
    runToEnd(state);
    const result = runResult(state);
    const renown = RENOWN_PER_FLOOR * 2 + Math.floor(state.turn / TURNS_PER_RENOWN);
    expect(result).toMatchObject({ outcome: 'retreat', atRisk: { renown }, lost: {}, turns: state.turn, deepestDepth: 3 });
    expect(result.atRisk[TROPHIES]).toBeUndefined();
    expect(Object.keys(result.extras)).toEqual([...RUN_TRACKERS.map((t) => t.id), 'run.end', 'run.party']);
    expect(result.extras['track.depth']).toEqual({ deepest: 3 });
    expect(result.extras['track.deaths']).toEqual({ fallen: [] });
    expect(result.extras['track.codex']).toMatchObject({ 'class.vanguard': ['seen'], 'race.human': ['seen'] });
    expect(result.extras['run.end']).toEqual(state.domains.run.end);
    // Who set out, for the run summary and the run history (ETH-048).
    expect(result.extras['run.party']).toEqual(
      state.party.map((id) => ({ actor: id, name: state.entities[id]?.adventurer?.name, classId: 'class.vanguard', raceId: 'race.human' })),
    );
    // A copy: changing it changes nothing in the state.
    (result.extras['track.depth'] as { deepest: number }).deepest = 99;
    expect(checkInvariants(state)).toEqual([]);
    expect(() => runResult(createRun(CONFIG, 1))).toThrow('has not ended');
  });

  it('ends as a wipe when nobody in the party is left alive', () => {
    const { state, hero } = setup();
    step(state, []);
    hero.actor.hp = 0;
    const events = step(state, []);
    expect(types(events)).toEqual(['fell', 'runEnded']);
    expect(events[0]).toMatchObject({ actor: hero.id, name: 'Brannoc', floor: 'd1', depth: 1 });
    expect(state.domains.run.end).toMatchObject({ outcome: 'wipe', cause: 'Brannoc fell on floor 1.' });
    expect(runResult(state)).toMatchObject({
      outcome: 'wipe',
      extras: { 'track.deaths': { fallen: [{ actor: hero.id, name: 'Brannoc', depth: 1, turn: 1 }] } },
    });
    expect(checkInvariants(state)).toEqual([]);
  });

  it('goes on when only part of the party falls, and names the last to fall in a wipe', () => {
    const { state } = setup({ party: [HERO, MIRA] });
    const [a, b] = state.party as [EntityId, EntityId];
    step(state, []);
    (getEntity(state, a).actor as { hp: number }).hp = 0;
    expect(types(step(state, [], { decide: waitDecide }))).toEqual(['fell', 'waited']);
    expect(types(step(state, [], { decide: waitDecide }))).toEqual(['waited']);
    expect(state.domains.run.end).toBeNull();
    (getEntity(state, b).actor as { hp: number }).hp = 0;
    step(state, []);
    expect(state.domains.run.end?.cause).toBe('Mira fell on floor 1, the last of the party standing.');
  });

  it('heads out on a retreat command and waits for the whole party at the exit', () => {
    const { state } = setup({ party: [HERO, MIRA] });
    // Order the retreat once the party is on floor 2.
    let ordered = -1;
    const events = runToEnd(state, 300, (i) => {
      if (ordered < 0 && state.party.every((id) => getEntity(state, id).floor === 'd2')) {
        ordered = i;
        return [{ type: 'retreat' }];
      }
      return [];
    });
    expect(ordered).toBeGreaterThan(0);
    expect(events.find((e) => e.type === 'turnedBack')).toMatchObject({ actor: null, reason: 'ordered' });
    expect(state.domains.run.end).toMatchObject({ outcome: 'retreat', depth: 2 });
    expect(state.domains.run.end?.cause).toBe('The party reached floor 2 of 3, was ordered to retreat and walked out of the dungeon.');
    // Nobody went further down after the order.
    expect(events.filter((e) => e.type === 'floorEntered' && e.depth === 3)).toEqual([]);
    expect(events.find((e) => e.type === 'leftDungeon')).toMatchObject({ party: state.party });
    expect(state.domains.run.leaving?.reason).toBe('ordered');
  });

  it('refuses a second retreat order', () => {
    const { state } = setup();
    step(state, [{ type: 'retreat' }]);
    expect(step(state, [{ type: 'retreat' }]).find((e) => e.type === 'commandRejected')).toMatchObject({
      reason: 'The party is already heading out',
    });
  });

  it('is a victory when the victory checks that apply are all met, else a retreat', () => {
    const add = (check: VictoryCheck) => {
      VICTORY_CHECKS.push(check);
      return () => VICTORY_CHECKS.splice(VICTORY_CHECKS.indexOf(check), 1);
    };
    const met = add({ id: 'victory.test_met', check: () => ({ applies: true, met: true, detail: 'The test is done.' }) });
    const skip = add({ id: 'victory.test_skip', check: () => ({ applies: false, met: false, detail: 'n/a' }) });
    try {
      const { state } = setup();
      runToEnd(state);
      expect(state.domains.run.end?.outcome).toBe('victory');
      expect(state.domains.run.end?.cause).toMatch(/^The test is done\. The party reached the bottom/);
    } finally {
      met();
    }
    const unmet = add({ id: 'victory.test_unmet', check: () => ({ applies: true, met: false, detail: 'The relic is still below.' }) });
    try {
      const { state } = setup();
      runToEnd(state);
      expect(state.domains.run.end?.outcome).toBe('retreat');
      expect(state.domains.run.end?.cause).toMatch(/Not everything was done: The relic is still below\.$/);
    } finally {
      unmet();
      skip();
    }
  });

  it('carries on identically after a save and load on the way out', () => {
    const { state } = setup({ party: [HERO, MIRA] });
    for (let i = 0; i < 300 && state.domains.run.leaving === null; i++) step(state, []);
    expect(state.domains.run.leaving).not.toBeNull();
    const copy = deserialize(serialize(state));
    const a = runToEnd(state);
    const b = runToEnd(copy);
    expect(b).toEqual(a);
    expect(stateHash(copy)).toBe(stateHash(state));
  });
});

describe('run trackers', () => {
  const e = (body: object, turn = 5) => ({ ...body, turn }) as SimEvent;

  it('reduce events purely into their state and rewards', () => {
    const start = DEPTH_TRACKER.init();
    const deeper = DEPTH_TRACKER.reduce(start, e({ type: 'floorEntered', actor: 1, floor: 'd3', depth: 3, firstVisit: true, floorType: null }));
    expect(start).toEqual({ deepest: 1 });
    expect(deeper).toEqual({ deepest: 3 });
    expect(DEPTH_TRACKER.reduce(deeper, e({ type: 'floorEntered', actor: 1, floor: 'd2', depth: 2, firstVisit: false, floorType: null }))).toBe(deeper);
    expect(DEPTH_TRACKER.rewards?.(deeper)).toEqual({ renown: 2 * RENOWN_PER_FLOOR });

    const turns = TURNS_TRACKER.reduce(TURNS_TRACKER.init(), e({ type: 'waited', actor: 1 }, 3 * TURNS_PER_RENOWN + 1));
    expect(turns).toEqual({ turns: 3 * TURNS_PER_RENOWN + 1 });
    expect(TURNS_TRACKER.rewards?.(turns)).toEqual({ renown: 3 });

    const hound = { kind: 'monster', id: 7, def: 'monster.slate_hound', name: 'Slate hound' } as const;
    const fell = DEATHS_TRACKER.reduce(
      DEATHS_TRACKER.init(),
      e({ type: 'fell', actor: 2, name: 'Mira', floor: 'd2', pos: { x: 1, y: 1 }, depth: 2, killer: hound }),
    );
    expect(fell).toEqual({ fallen: [{ actor: 2, name: 'Mira', depth: 2, turn: 5, killer: hound, how: 'was slain by a slate hound' }] });
  });

  it('keep rewards.atRisk the sum of every tracker’s rewards after each step', () => {
    const { state } = setup();
    for (let i = 0; i < 40; i++) step(state, []);
    expect(state.domains.floors.deepest).toBeGreaterThan(1);
    // `track.turns` counts the last event's turn, which is this step's.
    const renown = RENOWN_PER_FLOOR * (state.domains.floors.deepest - 1) + Math.floor(state.turn / TURNS_PER_RENOWN);
    expect(state.domains.run.rewards.atRisk.renown).toBe(renown);
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('hosts report the end', () => {
  it('SimSession reports the end once; InlineHost calls onRunEnded once, after the last batch', () => {
    const session = new SimSession(CONFIG, 1);
    let ended: RunReport | null = null;
    let steps = 0;
    while (ended === null && steps++ < 300) ended = session.step().ended;
    expect(ended?.end.outcome).toBe('retreat');
    expect(ended?.result.outcome).toBe('retreat');
    expect(session.over).toBe(true);
    expect(session.step()).toEqual({ events: [], progressed: false, ended: null });
    expect(session.report()).toEqual(ended);

    const host = new InlineHost();
    const order: string[] = [];
    host.onEvents((batch) => order.push(batch.at(-1)?.type ?? '?'));
    host.onRunEnded((report) => order.push(`ended:${report.end.outcome}`));
    host.start(CONFIG, 1);
    expect(host.run(1000)).toBeLessThan(1000);
    expect(order).toEqual(['runEnded', 'ended:retreat']);
    host.run(10);
    expect(order).toEqual(['runEnded', 'ended:retreat']);
  });
});
