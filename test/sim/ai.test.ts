import { describe, expect, it } from 'vitest';
import type { Pos } from '../../src/core';
import {
  addEntity,
  BASELINE_RULES,
  buildGoalMap,
  checkInvariants,
  CONDITIONS,
  createRun,
  defineCondition,
  defineRuleAction,
  deserialize,
  DROP_TURNS,
  explored,
  floorPathGrid,
  getEntity,
  getFloor,
  getMemory,
  isStep,
  newAiPart,
  newStatsPart,
  noParams,
  OPEN_DOOR_COST,
  RULE_ACTIONS,
  serialize,
  step,
  STUCK_TURNS,
  UNREACHABLE,
} from '../../src/sim';
import type { ActorEntity, EntityId, Rule, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };

/** Party turns a lone adventurer gets to explore a generated floor. The worst of 100 seeds takes about 280. */
const EXPLORE_TURN_CAP = 600;

/** Where the first baseline rule with this action sits, so tests survive rules added before it. */
const baselineIndex = (action: string) => BASELINE_RULES.findIndex((r) => r.action.id === action);

/** A run with one adventurer. `depth` 1 makes the floor the bottom one, with no stairs down to take. */
function setup(floorText?: string[], seed = 1, depth?: number): { state: RunState; hero: ActorEntity } {
  // No monsters: these tests are about exploring and the engine (combat has its own tests).
  const config = { party: [HERO], monsters: false, ...(floorText === undefined ? {} : { floorText }), ...(depth === undefined ? {} : { depth }) };
  const state = createRun(config, seed);
  return { state, hero: getEntity(state, state.party[0] as EntityId) as ActorEntity };
}

type RuleFired = Extract<SimEvent, { type: 'ruleFired' }>;
type Stuck = Extract<SimEvent, { type: 'stuck' }>;

const fired = (events: SimEvent[]): RuleFired[] => events.filter((e): e is RuleFired => e.type === 'ruleFired');

/**
 * Steps until the hero's baseline settles on waiting with nothing else to do, and returns the
 * party turns that took and every event, or `null` turns if it never settles within `cap`.
 */
function exploreUntilIdle(state: RunState, cap = EXPLORE_TURN_CAP): { turns: number | null; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (let turns = 1; turns <= cap; turns++) {
    const now = step(state, []);
    events.push(...now);
    if (fired(now).some((e) => e.action === 'act.wait' || e.action === 'act.retreat_run')) return { turns, events };
  }
  return { turns: null, events };
}

/** The floor tiles the hero could reach from `from` if it knew the whole floor, opening doors. */
function reachable(state: RunState, from: Pos): Pos[] {
  const paths = floorPathGrid(state, 'd1', { closedDoorCost: OPEN_DOOR_COST });
  const map = buildGoalMap(paths, [from]);
  const tiles: Pos[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) if (map.get(x, y) !== UNREACHABLE) tiles.push({ x, y });
  }
  return tiles;
}

// Test-only definitions, to drive the engine with rules of every kind.
CONDITIONS.register(
  defineCondition({
    id: 'cond.test_never',
    name: 'Never',
    description: 'Never true.',
    parse: noParams,
    evaluate: () => ({ ok: false, detail: '' }),
    describe: () => 'never',
  }),
);
CONDITIONS.register(
  defineCondition({
    id: 'cond.test_odd_x',
    name: 'Odd column',
    description: 'True while the actor stands on an odd column.',
    parse: noParams,
    evaluate: ({ actor }) => ({ ok: actor.pos.x % 2 === 1, detail: '' }),
    describe: () => 'on an odd column',
  }),
);
RULE_ACTIONS.register(
  defineRuleAction<Pos>({
    id: 'act.test_step',
    name: 'Test step',
    description: 'Step in the direction given as params.',
    parse: (raw) => (isStep(raw) ? { x: raw.x, y: raw.y } : 'Not a step'),
    resolve: (_ctx, dir) => ({ request: { id: 'move', dir }, detail: `stepping (${dir.x}, ${dir.y})` }),
    describe: (dir) => `step (${dir.x}, ${dir.y})`,
  }),
);
RULE_ACTIONS.register(
  defineRuleAction({
    id: 'act.test_nothing',
    name: 'Nothing',
    description: 'Never resolves.',
    parse: noParams,
    resolve: () => null,
    describe: () => 'nothing',
  }),
);
RULE_ACTIONS.register(
  defineRuleAction<{ reason: string }>({
    id: 'act.test_skip',
    name: 'Test skip',
    description: 'Skips with a trace reason.',
    parse: (raw) =>
      typeof raw === 'object' && raw !== null && 'reason' in raw && typeof (raw as { reason: unknown }).reason === 'string'
        ? { reason: (raw as { reason: string }).reason }
        : 'Need a skip reason',
    resolve: (_ctx, { reason }) => ({ skipped: reason }),
    describe: ({ reason }) => `skip (${reason})`,
  }),
);

const rule = (condition: string, action: string, params?: unknown, enabled = true): Rule => ({
  condition: { id: condition },
  action: params === undefined ? { id: action } : { id: action, params },
  enabled,
});

describe('decision engine', () => {
  const ROOM = ['#####', '#@..#', '#...#', '#####'];

  it('takes the first enabled rule whose condition holds and whose action resolves to something valid', () => {
    const { state, hero } = setup(ROOM);
    hero.ai = newAiPart([
      rule('cond.always', 'act.test_step', { x: 1, y: 0 }, false), // disabled
      rule('cond.test_never', 'act.test_step', { x: 1, y: 0 }), // condition false
      rule('cond.always', 'act.test_nothing'), // action doesn't resolve
      rule('cond.always', 'act.test_step', { x: 0, y: -1 }), // into a wall: not valid
      rule('cond.unknown', 'act.test_step', { x: 1, y: 0 }), // unknown condition
      rule('cond.always', 'act.unknown'), // unknown action
      rule('cond.always', 'act.test_step', { x: 5, y: 0 }), // malformed params
      rule('cond.always', 'act.test_step', { x: 0, y: 1 }), // this one
      rule('cond.always', 'act.test_step', { x: 1, y: 1 }),
    ]);
    const events = step(state, []).filter((e) => e.type !== 'runStarted');
    expect(events).toEqual([
      {
        type: 'ruleFired',
        actor: hero.id,
        rule: { set: 'own', index: 7 },
        condition: 'cond.always',
        action: 'act.test_step',
        detail: 'Test step: stepping (0, 1)',
        turn: 1,
      },
      { type: 'moved', actor: hero.id, from: { x: 1, y: 1 }, to: { x: 1, y: 2 }, turn: 1 },
    ]);
    expect(hero.ai.memory.intent).toEqual({
      rule: { set: 'own', index: 7 },
      action: 'act.test_step',
      detail: 'Test step: stepping (0, 1)',
    });
    expect(Object.hasOwn(hero.ai.memory.intent ?? {}, 'goal')).toBe(false);
  });

  it('falls back on the baseline rules after the actor’s own', () => {
    const { state, hero } = setup(ROOM);
    hero.ai = newAiPart([rule('cond.test_never', 'act.test_step', { x: 1, y: 0 })]);
    // The room is all in view, so there is nothing to explore: the baseline waits.
    expect(fired(step(state, []))).toMatchObject([
      { rule: { set: 'baseline', index: BASELINE_RULES.length - 1 }, action: 'act.wait', detail: 'Wait: nothing else to do' },
    ]);
    expect(hero.ai.memory.intent?.goal).toBeUndefined();
  });

  it('appends skip reasons from earlier rules whose condition held to the fired trace (ETH-094)', () => {
    const { state, hero } = setup(ROOM);
    hero.ai = newAiPart([
      rule('cond.test_never', 'act.test_skip', { reason: 'should not appear' }),
      rule('cond.always', 'act.test_skip', { reason: 'skipped bad fountain' }),
      rule('cond.always', 'act.test_skip', { reason: 'skipped bad fountain' }), // duplicate note ignored
      rule('cond.always', 'act.test_skip', { reason: '' }), // empty note ignored
      rule('cond.always', 'act.test_step', { x: 0, y: 1 }),
    ]);
    expect(fired(step(state, []))).toMatchObject([
      {
        rule: { set: 'own', index: 4 },
        action: 'act.test_step',
        detail: 'Test step: stepping (0, 1); skipped bad fountain',
        skipped: ['skipped bad fountain'],
      },
    ]);
    expect(hero.ai.memory.intent?.detail).toBe('Test step: stepping (0, 1); skipped bad fountain');
  });

  it('lets actors without an AI part wait, with no trace', () => {
    const { state, hero } = setup(ROOM);
    const monster = addEntity(state, {
      def: 'monster.test',
      floor: 'd1',
      pos: { x: 3, y: 2 },
      actor: { energy: 0, hp: 5, mp: 0, faction: 'monster' },
      stats: newStatsPart({ hp: 5, speed: 100 }),
    });
    step(state, []);
    const events = step(state, []);
    expect(events.filter((e) => 'actor' in e && e.actor === monster.id).map((e) => e.type)).toEqual(['waited']);
    expect(fired(events).map((e) => e.actor)).toEqual([hero.id]);
  });

  it('registers the baseline behaviors as ordinary conditions and rule actions with Codex text', () => {
    for (const { condition, action } of BASELINE_RULES) {
      expect(CONDITIONS.get(condition.id).check(condition.params)).toBeNull();
      expect(RULE_ACTIONS.get(action.id).check(action.params)).toBeNull();
    }
    for (const def of [...CONDITIONS.all(), ...RULE_ACTIONS.all()]) {
      expect(def.name).not.toBe('');
      expect(def.description).not.toBe('');
      expect(def.describe(undefined)).not.toBe('');
    }
    expect(CONDITIONS.all().every((d) => d.id.startsWith('cond.'))).toBe(true);
    expect(RULE_ACTIONS.all().every((d) => d.id.startsWith('act.'))).toBe(true);
    // The baseline is a plain rule list: an adventurer could be given the same rules as its own.
    const { state, hero } = setup(['#####', '#@..#', '#...#', '#####']);
    hero.ai = newAiPart(BASELINE_RULES.map((r) => structuredClone(r)));
    expect(fired(step(state, []))[0]?.rule).toEqual({ set: 'own', index: BASELINE_RULES.length - 1 });
  });
});

describe('baseline exploration', () => {
  it('explores every reachable tile of 100 generated floors and then stops, within the turn cap', () => {
    for (let seed = 1; seed <= 100; seed++) {
      // A one-floor dungeon, so the hero explores it all and then waits rather than going down.
      const { state, hero } = setup(undefined, seed, 1);
      const start = { ...hero.pos };
      const { turns, events } = exploreUntilIdle(state);
      expect(turns, `seed ${seed} still exploring after ${EXPLORE_TURN_CAP} turns`).not.toBeNull();
      expect(events.filter((e) => e.type === 'actionFailed' || e.type === 'stuck'), `seed ${seed}`).toEqual([]);

      const { cells: seen, width } = getMemory(state, 'd1').terrain;
      const missed = reachable(state, start).filter(({ x, y }) => seen[y * width + x] === 0);
      expect(missed, `seed ${seed}`).toEqual([]);
      expect(explored(state, 'd1').fraction, `seed ${seed}`).toBe(1);

      // Done: on the bottom (only) floor it turns back and walks out, ending the run.
      for (let i = 0; i < EXPLORE_TURN_CAP && state.domains.run.end === null; i++) step(state, []);
      expect(state.domains.run.end?.outcome, `seed ${seed}`).toBe('retreat');
      const at = { ...hero.pos };
      expect(step(state, [])).toEqual([]);
      expect(hero.pos).toEqual(at);
    }
    // Takes about 4 s alone; parallel agents and CI load push it past the 5 s default.
  }, 30_000);

  it('never enters an explored dead end', () => {
    // Digits mark three bent dead ends off a long corridor. Their far ends can't be seen from the
    // corridor, so each has to be walked into once; after that nothing about them is unknown.
    const marked = [
      '##############################',
      '#@...........................#',
      '####1#######2#########3#######',
      '####1#######2#########3#######',
      '####111#####2222######3#######',
      '######1########2######333#####',
      '######1########2########3#####',
      '##############################',
    ];
    const deadEnds = new Map<string, Pos[]>();
    marked.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (/\d/.test(ch)) deadEnds.set(ch, [...(deadEnds.get(ch) ?? []), { x, y }]);
      }),
    );
    const { state, hero } = setup(marked.map((row) => row.replace(/\d/g, '.')));
    const width = (marked[0] as string).length;
    const seen = getMemory(state, 'd1').terrain.cells;
    /** A dead end is explored once its tiles and everything next to them have been seen. */
    const isExplored = (tiles: Pos[]) =>
      tiles.every(({ x, y }) => [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => seen[(y + dy) * width + x + dx] !== 0)));
    const inside = (tiles: Pos[], p: Pos) => tiles.some((t) => t.x === p.x && t.y === p.y);

    const entries = new Map<string, number>();
    let settled = false;
    for (let i = 0; i < 400 && !settled; i++) {
      const before = { ...hero.pos };
      const exploredBefore = new Map([...deadEnds].map(([k, tiles]) => [k, isExplored(tiles)]));
      settled = fired(step(state, [])).some((e) => e.action === 'act.wait');
      for (const [k, tiles] of deadEnds) {
        if (inside(tiles, before) || !inside(tiles, hero.pos)) continue;
        entries.set(k, (entries.get(k) ?? 0) + 1);
        expect(exploredBefore.get(k), `entered explored dead end ${k} at turn ${state.turn}`).toBe(false);
      }
    }
    expect(settled).toBe(true);
    expect(explored(state, 'd1').fraction).toBe(1);
    // Each dead end had to be walked into, exactly once.
    expect(Object.fromEntries(entries)).toEqual({ 1: 1, 2: 1, 3: 1 });
  });

  it('opens doors on the way to unexplored ground', () => {
    // The far room bends out of sight of the door, so it has to be walked through.
    const { state, hero } = setup(['#########', '#@..+...#', '#######.#', '#######.#', '#########']);
    const { turns, events } = exploreUntilIdle(state, 50);
    expect(turns).not.toBeNull();
    const opened = events.findIndex((e) => e.type === 'doorOpened');
    expect(opened).toBeGreaterThan(0);
    expect(events[opened - 1]).toMatchObject({
      type: 'ruleFired',
      action: 'act.explore',
      detail: 'Explore: heading for unexplored ground 2 turns away; opening a door',
    });
    expect(explored(state, 'd1').fraction).toBe(1);
    expect(hero.pos.x).toBeGreaterThan(4);
  });

  it('keeps exploring identically after a save and load', () => {
    const a = setup(undefined, 7).state;
    for (let i = 0; i < 40; i++) step(a, []);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 40; i++) expect(step(b, [])).toEqual(step(a, []));
    expect(serialize(b)).toBe(serialize(a));
  });
});

describe('stuck detection', () => {
  // A long corridor with something that never moves standing in it, past which lies unexplored ground.
  const CORRIDOR = ['######################', '#@...................#', '######################'];

  function blocked(): { state: RunState; hero: ActorEntity; blocker: EntityId } {
    const { state, hero } = setup(CORRIDOR);
    const blocker = addEntity(state, {
      def: 'monster.test',
      floor: 'd1',
      pos: { x: 5, y: 1 },
      actor: { energy: 0, hp: 5, mp: 0, faction: 'neutral' },
      stats: newStatsPart({ hp: 5, speed: 0 }),
    }).id;
    return { state, hero, blocker };
  }

  it('drops a goal that makes no progress for N turns, logs it, and picks another', () => {
    const { state, hero, blocker } = blocked();
    const events: SimEvent[] = [];
    for (let i = 0; i < 60; i++) events.push(...step(state, []));
    expect(events.filter((e) => e.type === 'actionFailed')).toEqual([]);

    const stuckAt = events.findIndex((e) => e.type === 'stuck');
    const stuck = events[stuckAt] as Stuck;
    expect(stuck).toEqual({
      type: 'stuck',
      actor: hero.id,
      rule: { set: 'baseline', index: baselineIndex('act.explore') },
      action: 'act.explore',
      turns: STUCK_TURNS,
      detail:
        `No progress in ${STUCK_TURNS} turns (Explore: heading for unexplored ground 16 turns away; ` +
        `waiting for entity ${blocker} to get out of the way). Giving up on Explore for ${DROP_TURNS} turns.`,
      floor: 'd1',
      pos: { x: 4, y: 1 }, // waiting behind the blocker at (5, 1)
      turn: stuck.turn,
    });

    // Before it: exploring up to the blocker, then waiting behind it, position and memory unchanged.
    const before = fired(events.slice(0, stuckAt));
    expect(before.every((e) => e.action === 'act.explore')).toBe(true);
    const waiting = (e: RuleFired) => e.detail.includes('waiting for');
    expect(before.slice(-STUCK_TURNS).every(waiting)).toBe(true);
    expect(waiting(before.at(-STUCK_TURNS - 1) as RuleFired)).toBe(false);

    // After it: a different goal at once (backing off), and exploring only once the drop is over.
    const after = fired(events.slice(stuckAt + 1));
    expect(after[0]).toMatchObject({
      rule: { set: 'baseline', index: baselineIndex('act.back_off') },
      action: 'act.back_off',
      detail: 'Back off: backing away from where I got stuck at (4, 1) (gave up on Explore 0 turns ago)',
    });
    const resumed = after.find((e) => e.action === 'act.explore');
    expect(resumed?.turn).toBe(stuck.turn + DROP_TURNS);
    expect(after.filter((e) => e.turn < stuck.turn + DROP_TURNS).map((e) => e.action)).not.toContain('act.explore');
  });

  it('backs off away from the spot it was stuck at', () => {
    const { state, hero } = blocked();
    let backedOff = false;
    for (let i = 0; i < 30; i++) {
      for (const e of fired(step(state, []))) if (e.action === 'act.back_off') backedOff = true;
    }
    expect(backedOff).toBe(true);
    expect(hero.pos).toEqual({ x: 1, y: 1 });
  });

  it('catches two rules that undo each other, swapping the actor between neighbouring tiles (turn-cap regression)', () => {
    // The real loop (party of 4, seeds 189, 185 and 105): a wounded adventurer flees from an enemy
    // in sight, which takes it out of sight, and then walks back toward what it was after. It
    // changes tile every turn, so an exact-position check never saw it stand still.
    const { state, hero } = setup(CORRIDOR);
    hero.ai = newAiPart([
      rule('cond.test_odd_x', 'act.test_step', { x: -1, y: 0 }),
      rule('cond.always', 'act.test_step', { x: 1, y: 0 }),
    ]);
    const events: SimEvent[] = [];
    for (let i = 0; i < 4 * STUCK_TURNS; i++) events.push(...step(state, []));
    const stuck = events.filter((e): e is Stuck => e.type === 'stuck');
    expect(stuck.length).toBeGreaterThan(0);
    expect(stuck[0]?.turns).toBe(STUCK_TURNS);
    expect(stuck[0]?.detail).toContain('No progress');
    expect(checkInvariants(state)).toEqual([]);
  });

  it('does not count walking along a seen corridor as loitering', () => {
    const { state, hero } = setup(CORRIDOR);
    hero.ai = newAiPart([rule('cond.always', 'act.test_step', { x: 1, y: 0 })]);
    const events: SimEvent[] = [];
    for (let i = 0; i < 18; i++) events.push(...step(state, []));
    expect(events.filter((e) => e.type === 'stuck')).toEqual([]);
  });

  it('never counts waiting with nothing to do as being stuck', () => {
    const { state } = setup(['#####', '#@..#', '#...#', '#####']);
    const events: SimEvent[] = [];
    for (let i = 0; i < 4 * STUCK_TURNS; i++) events.push(...step(state, []));
    expect(events.filter((e) => e.type === 'stuck')).toEqual([]);
  });

  it('stops a stuck act.back_off without overwriting the underlying dropped rule (seed 128 stuck-storm fix)', () => {
    // 24-tile corridor: x=1..24, dropped.pos=(11,1), neutral blocker at (13,1), monster at (16,1).
    // At (11,1) east is open (dist 13 > west dist 10), so act.back_off steps east to (12,1).
    // At (12,1) the blocker at (13,1) is adjacent (blocked), so west's deeper flee gradient
    // (-12 + 10 = -2 < -1) pulls act.back_off back west to (11,1).
    const corridor = [`#${'.'.repeat(4)}@${'.'.repeat(19)}#`];
    const map = ['#'.repeat(26), ...corridor, '#'.repeat(26)];
    const { state, hero } = setup(map, 1, 1);
    const floor = getFloor(state, 'd1').terrain.cells;
    const seen = getMemory(state, 'd1').terrain.cells;
    for (let i = 0; i < floor.length; i++) seen[i] = (floor[i] as number) + 1;

    hero.pos = { x: 11, y: 1 };
    hero.actor.hp = 1;
    addEntity(state, {
      def: 'monster.test',
      floor: 'd1',
      pos: { x: 13, y: 1 },
      actor: { energy: 0, hp: 5, mp: 0, faction: 'neutral' },
      stats: newStatsPart({ hp: 5, speed: 0 }),
    });
    addEntity(state, {
      def: 'monster.cave_rat',
      floor: 'd1',
      pos: { x: 16, y: 1 },
      actor: { energy: 0, hp: 10, mp: 0, faction: 'monster' },
      stats: newStatsPart({ hp: 10, speed: 0 }),
    });
    const fleeRule = { set: 'baseline' as const, index: baselineIndex('act.flee') };
    hero.ai = newAiPart();
    hero.ai.memory.dropped = {
      rule: fleeRule,
      action: 'act.flee',
      floor: 'd1',
      pos: { x: 11, y: 1 },
      since: 0,
      until: DROP_TURNS,
    };

    const firstPhase: SimEvent[] = [];
    for (let i = 0; i <= STUCK_TURNS; i++) firstPhase.push(...step(state, []));
    const stuckEvents = firstPhase.filter((e): e is Stuck => e.type === 'stuck');
    expect(stuckEvents).toHaveLength(1);
    expect(stuckEvents[0]?.action).toBe('act.back_off');
    expect(hero.ai.memory.dropped).toMatchObject({
      rule: fleeRule,
      action: 'act.flee',
      until: DROP_TURNS,
      backedOff: true,
    });
    expect(checkInvariants(state)).toEqual([]);
    const restored = deserialize(serialize(state));
    expect((getEntity(restored, hero.id) as ActorEntity).ai?.memory.dropped?.backedOff).toBe(true);

    // Remaining turns of the drop: neither act.back_off nor act.flee fires, and no second stuck fires.
    const restOfDrop: SimEvent[] = [];
    for (let i = STUCK_TURNS + 1; i < DROP_TURNS - 1; i++) restOfDrop.push(...step(state, []));
    expect(restOfDrop.filter((e) => e.type === 'stuck')).toEqual([]);
    expect(fired(restOfDrop).map((e) => e.action)).not.toContain('act.back_off');
    expect(fired(restOfDrop).map((e) => e.action)).not.toContain('act.flee');
    expect(checkInvariants(state)).toEqual([]);

    // Once the original drop expires at turn DROP_TURNS, dropped clears and act.flee resumes cleanly.
    const expiryEvents = step(state, []);
    expect(hero.ai.memory.dropped).toBeNull();
    expect(fired(expiryEvents).map((e) => e.action)).toContain('act.flee');
    expect(checkInvariants(state)).toEqual([]);
  });
});

describe('intent goal (ETH-019)', () => {
  it('records goal tiles for pathing and combat actions, and checks them in core.aiMemory', () => {
    // Exploring down a corridor records the frontier goal tile.
    const { state, hero } = setup(['#########', '#@..+...#', '#########']);
    step(state, []);
    expect(hero.ai?.memory.intent?.action).toBe('act.explore');
    expect(hero.ai?.memory.intent?.goal).toEqual({ x: 4, y: 1 });
    expect(checkInvariants(state)).toEqual([]);

    // Melee combat targets the adjacent enemy's tile.
    const duel = setup(['#####', '#@..#', '#...#', '#####']);
    const rat = addEntity(duel.state, {
      def: 'monster.cave_rat',
      floor: 'd1',
      pos: { x: 2, y: 1 },
      actor: { energy: 0, hp: 10, mp: 0, faction: 'monster' },
      stats: newStatsPart({ hp: 10, speed: 0 }),
    });
    step(duel.state, []);
    expect(duel.hero.ai?.memory.intent?.action).toBe('act.attack_adjacent');
    expect(duel.hero.ai?.memory.intent?.goal).toEqual(rat.pos);
    expect(checkInvariants(duel.state)).toEqual([]);

    // Hurt hero fleeing records the flee path's end tile.
    const retreat = setup(['#########', '#....@..#', '#########']);
    addEntity(retreat.state, {
      def: 'monster.cave_rat',
      floor: 'd1',
      pos: { x: 6, y: 1 },
      actor: { energy: 0, hp: 10, mp: 0, faction: 'monster' },
      stats: newStatsPart({ hp: 10, speed: 0 }),
    });
    retreat.hero.actor.hp = 1;
    step(retreat.state, []);
    expect(retreat.hero.ai?.memory.intent?.action).toBe('act.flee');
    expect(retreat.hero.ai?.memory.intent?.goal).toEqual({ x: 1, y: 1 });
    expect(checkInvariants(retreat.state)).toEqual([]);

    // Invalid intent.goal fails the core.aiMemory invariant.
    if (hero.ai?.memory.intent) hero.ai.memory.intent.goal = { x: -1, y: 2 };
    expect(checkInvariants(state).join('\n')).toMatch(/core\.aiMemory.*invalid intent goal/);
    if (hero.ai?.memory.intent) hero.ai.memory.intent.goal = { x: 1.5, y: 2 };
    expect(checkInvariants(state).join('\n')).toMatch(/core\.aiMemory.*invalid intent goal/);
  });
});
