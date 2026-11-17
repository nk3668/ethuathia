/**
 * Party members getting past each other in narrow passages (ETH-017): a member that wants an
 * ally's tile swaps places with them when the ally is waiting on it or has nowhere to be, and
 * monsters are never swapped with.
 */
import { describe, expect, it } from 'vitest';
import type { Pos } from '../../src/core';
import {
  addEntity,
  buildGoalMap,
  createRun,
  defineRuleAction,
  deserialize,
  followMap,
  aiPathGrid,
  getEntity,
  isStep,
  RULE_ACTIONS,
  serialize,
  step,
  validateAction,
  willingToSwap,
} from '../../src/sim';
import type { ActorEntity, AiActor, EntityId, RunState, SimEvent } from '../../src/sim';

const HERO = { name: 'Brannoc', classId: 'class.vanguard', raceId: 'race.human' };
const ALLY = { name: 'Isolde', classId: 'class.vanguard', raceId: 'race.human' };

// A goal-walking rule action, standing in for any goal other than exploring (retreating,
// regrouping, a contract target): it follows a goal map to the tile given as params, the same
// way exploring does.
RULE_ACTIONS.register(
  defineRuleAction<Pos>({
    id: 'act.test_walk_to',
    name: 'Walk to',
    description: 'Walk to the tile given as params.',
    parse: (raw) => {
      const p = raw as Partial<Pos> | undefined;
      return typeof p?.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : 'Not a tile';
    },
    resolve: (ctx, goal) => {
      const paths = aiPathGrid(ctx);
      return followMap(ctx, paths, buildGoalMap(paths, [goal]), `walking to (${goal.x}, ${goal.y})`);
    },
    describe: (goal) => `walk to (${goal.x}, ${goal.y})`,
  }),
);

/**
 * A one-tile corridor that bends out of sight at its east end, so the explorer at its west end
 * heads east for unexplored ground. The ally starts further along it.
 */
const BENT_CORRIDOR = [
  '###################',
  '#@..........@....##',
  '################.##',
  '################..#',
  '#################.#',
  '#################.#',
  '###################',
];

function setup(floorText: string[]): { state: RunState; hero: AiActor; ally: AiActor } {
  const state = createRun({ party: [HERO, ALLY], floorText }, 1);
  const [heroId, allyId] = state.party as [EntityId, EntityId];
  return { state, hero: getEntity(state, heroId) as AiActor, ally: getEntity(state, allyId) as AiActor };
}

function run(state: RunState, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) events.push(...step(state, []));
  return events;
}

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

describe('party members in narrow passages', () => {
  it('lets two members heading toward each other in a one-tile corridor get past each other without getting stuck', () => {
    const { state, hero, ally } = setup(BENT_CORRIDOR);
    // The explorer heads east along the corridor; the ally walks west to its far end.
    ally.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.test_walk_to', params: { x: 1, y: 1 } }, enabled: true }];

    let passed = false;
    const events: SimEvent[] = [];
    for (let i = 0; i < 40; i++) {
      events.push(...step(state, []));
      if (hero.pos.y === 1 && ally.pos.y === 1 && hero.pos.x > ally.pos.x) passed = true;
    }

    expect(ofType(events, 'stuck')).toEqual([]);
    expect(ofType(events, 'actionFailed')).toEqual([]);
    expect(passed).toBe(true);
    const swaps = ofType(events, 'swapped');
    expect(swaps).toHaveLength(1);
    expect([swaps[0]?.actor, swaps[0]?.other].sort()).toEqual([hero.id, ally.id].sort());
    // Each got where it was going: the ally to the west end, the explorer round the bend.
    expect(ally.pos).toEqual({ x: 1, y: 1 });
    expect(hero.pos.y).toBeGreaterThan(1);
    // The one who swapped says so in its trace.
    const swapper = swaps[0]?.actor;
    expect(ofType(events, 'ruleFired').some((e) => e.actor === swapper && e.detail.includes('squeezing past'))).toBe(true);
  });

  it('squeezes past a member standing idle in the way', () => {
    const { state, hero, ally } = setup(BENT_CORRIDOR);
    ally.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.wait' }, enabled: true }];
    const events = run(state, 40);
    expect(ofType(events, 'stuck')).toEqual([]);
    expect(ofType(events, 'swapped')).toMatchObject([{ actor: hero.id, other: ally.id }]);
    expect(hero.pos.y).toBeGreaterThan(1);
    expect(ally.pos).toEqual({ x: 11, y: 1 });
  });

  it('never swaps with a monster: it waits, then gives up on the goal', () => {
    const state = createRun({ party: [HERO], floorText: BENT_CORRIDOR }, 1);
    const hero = getEntity(state, state.party[0] as EntityId) as ActorEntity;
    const monster = addEntity(state, {
      def: 'monster.test',
      floor: 'd1',
      pos: { x: 5, y: 1 },
      actor: { energy: 0, speed: 0, hp: 5, maxHp: 5, mp: 0, maxMp: 0, faction: 'monster' },
    });
    const events = run(state, 30);
    expect(ofType(events, 'swapped')).toEqual([]);
    expect(ofType(events, 'stuck')).toHaveLength(1);
    expect(monster.pos).toEqual({ x: 5, y: 1 });
    expect(hero.pos.x).toBeLessThan(5);
    expect(validateAction(state, hero, { id: 'swap', dir: { x: 1, y: 0 } })).not.toBeNull();
  });

  it('validates the swap action: party members only, and only where both could step', () => {
    const { state, hero, ally } = setup(['#####', '#@@.#', '#####']);
    const east = { x: 1, y: 0 };
    expect(isStep(east)).toBe(true);
    expect(validateAction(state, hero, { id: 'swap', dir: east })).toBeNull();
    expect(validateAction(state, ally, { id: 'swap', dir: east })).toBe('There is nobody there to swap places with');
    expect(validateAction(state, hero, { id: 'swap', dir: { x: 0, y: 1 } })).toBe('A wall is in the way');

    ally.actor.faction = 'neutral';
    expect(validateAction(state, hero, { id: 'swap', dir: east })).toMatch(/not in the party/);
  });

  it('leaves alone a member busy heading somewhere else', () => {
    const { state, hero, ally } = setup(['#####', '#@@.#', '#####']);
    const ctx = { state, actor: hero };
    expect(willingToSwap(ctx, ally)).toBe(true); // no decision yet
    ally.ai.memory.intent = { rule: { set: 'baseline', index: 1 }, action: 'act.explore', detail: 'Explore' };
    expect(willingToSwap(ctx, ally)).toBe(false);
    ally.ai.memory.waitingFor = hero.id;
    expect(willingToSwap(ctx, ally)).toBe(true);
    ally.ai.memory.waitingFor = null;
    ally.ai.memory.intent = { rule: { set: 'baseline', index: 2 }, action: 'act.wait', detail: 'Wait' };
    expect(willingToSwap(ctx, ally)).toBe(true);
  });

  it('carries on identically after a save and load mid-passage', () => {
    const { state, ally } = setup(BENT_CORRIDOR);
    ally.ai.rules = [{ condition: { id: 'cond.always' }, action: { id: 'act.test_walk_to', params: { x: 1, y: 1 } }, enabled: true }];
    run(state, 4);
    const copy = deserialize(serialize(state));
    expect(run(copy, 30)).toEqual(run(state, 30));
  });
});
