/**
 * The floors domain's rule conditions and rule actions (docs/ARCHITECTURE.md §4): leaving a
 * finished floor by the stairs down, gathering the party there first, the per-floor turn cap and
 * the bottom of the dungeon. The baseline rules (`BASELINE_RULES` in `ai/engine.ts`) use them,
 * and the Library can hand each one to the player's own rules.
 */
import type { Pos } from '../../core';
import { aiPathGrid, followMap, nameOf } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, ParamParser, Resolved, RuleActionDef } from '../ai/types';
import { actorAt } from '../entities';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { getMemory } from '../perception';
import type { ActorEntity, FloorId, RunState } from '../state';
import { dungeonDepth, floorNode, isBottomFloor, stairsTarget } from './dungeon';
import type { StairsDir } from './dungeon';

/**
 * How close (in tiles, diagonals counting as one) a party member must be to the stairs, or to
 * another member who is gathered, to count as gathered there. Chaining through members lets a
 * queue in a corridor count as gathered.
 */
export const GATHER_RADIUS = 2;

/**
 * Game turns the party may spend on one floor, counted from its first arrival, before the
 * baseline heads for the stairs down without exploring further or waiting for stragglers. A
 * safety net: a lone adventurer explores a floor in about 200–300 turns.
 */
export const FLOOR_TURN_CAP = 1000;

/** The per-floor turn cap for this run: `RunConfig.floorTurnCap`, else `FLOOR_TURN_CAP`. */
export function floorTurnCap(state: RunState): number {
  return state.config.floorTurnCap ?? FLOOR_TURN_CAP;
}

/** Game turns since the party first arrived on `floorId` (0 if it hasn't). */
export function turnsOnFloor(state: RunState, floorId: FloorId): number {
  const arrived = state.domains.floors.arrived[floorId];
  return arrived === undefined ? 0 : state.turn - arrived;
}

/**
 * Where the party remembers stairs going `dir` on `floorId`, or `null` if nobody has seen any.
 * The lowest tile index wins if there are several.
 */
export function knownStairs(state: RunState, floorId: FloorId, dir: StairsDir): Pos | null {
  const memory = getMemory(state, floorId);
  const { width } = memory.terrain;
  let best: number | null = null;
  for (const key of Object.keys(memory.features)) {
    const i = Number(key);
    const f = memory.features[i]?.feature;
    if (f?.kind === 'stairs' && f.dir === dir && (best === null || i < best)) best = i;
  }
  return best === null ? null : { x: best % width, y: Math.floor(best / width) };
}

/** The living party members on `floorId`, in party order. */
export function partyOnFloor(state: RunState, floorId: FloorId): ActorEntity[] {
  return state.party.flatMap((id) => {
    const e = state.entities[id];
    return e?.actor !== undefined && e.actor.hp > 0 && e.floor === floorId ? [e as ActorEntity] : [];
  });
}

/** Who is gathered at a place, and who isn't yet. */
export interface Gathering {
  gathered: ActorEntity[];
  missing: ActorEntity[];
}

const near = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= GATHER_RADIUS;

/**
 * Which living party members on `floorId` are gathered at `pos`: those within `GATHER_RADIUS`
 * of it, and then anyone within `GATHER_RADIUS` of someone gathered, so a line of members
 * waiting in a corridor counts. Members on other floors are not considered: whoever is ahead
 * waits below, and whoever is behind follows on their own.
 */
export function gatheringAt(state: RunState, floorId: FloorId, pos: Pos): Gathering {
  const missing = partyOnFloor(state, floorId);
  const gathered: ActorEntity[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < missing.length; i++) {
      const m = missing[i] as ActorEntity;
      if (near(m.pos, pos) || gathered.some((g) => near(m.pos, g.pos))) {
        gathered.push(m);
        missing.splice(i, 1);
        i--;
        grew = true;
      }
    }
  }
  return { gathered, missing };
}

function names(actors: readonly ActorEntity[]): string {
  const list = actors.map(nameOf);
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list.at(-1) as string}`;
}

// ---------------------------------------------------------------------------------------------
// Conditions

/** True once the party has spent the per-floor turn cap on this floor. */
export const COND_FLOOR_OVERSTAYED = defineCondition({
  id: 'cond.floor_overstayed',
  name: 'Overstayed the floor',
  description:
    'True once the party has spent too long on this floor, counted from when the first of them arrived. ' +
    'A safety net so a party never lingers on one floor forever.',
  parse: noParams,
  evaluate({ state, actor }) {
    const turns = turnsOnFloor(state, actor.floor);
    const cap = floorTurnCap(state);
    return turns >= cap ? { ok: true, detail: `${turns} turns on this floor, the limit is ${cap}` } : { ok: false, detail: '' };
  },
  describe: () => 'overstayed the floor',
});

/** True on the bottom floor of the dungeon, which has no stairs down. */
export const COND_BOTTOM_FLOOR = defineCondition({
  id: 'cond.bottom_floor',
  name: 'On the bottom floor',
  description: 'True on the deepest floor of the dungeon, where there are no stairs further down.',
  parse: noParams,
  evaluate({ state, actor }) {
    if (!isBottomFloor(state, actor.floor)) return { ok: false, detail: '' };
    const depth = floorNode(state, actor.floor).depth;
    return { ok: true, detail: `on the bottom floor, floor ${depth} of ${dungeonDepth(state)}` };
  },
  describe: () => 'on the bottom floor',
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/** `act.descend`'s params: whether to wait for the party to gather before taking the stairs. */
export interface DescendParams {
  regroup: boolean;
}

const parseDescend: ParamParser<DescendParams> = (raw) => {
  if (raw === undefined || raw === null) return { regroup: true };
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'Params must be an object';
  const { regroup, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (regroup !== undefined && typeof regroup !== 'boolean') return '"regroup" must be true or false';
  return { regroup: regroup ?? true };
};

/**
 * Head for the known stairs down and take them. With `regroup` (the default) the party goes
 * down together: a member at the stairs takes them only once every living member on the floor
 * is gathered there (`gatheringAt`), and a gathered member waits rather than crowd the stairs
 * while someone else is on them; `act.gather` does that waiting.
 */
export const ACT_DESCEND = defineRuleAction({
  id: 'act.descend',
  name: 'Descend',
  description:
    'Walk to the stairs down and take them to the next floor. By default the party goes down together: whoever ' +
    'reaches the stairs first waits there until everyone on the floor has gathered. Can’t be done before the ' +
    'stairs down have been seen, or on the bottom floor.',
  parse: parseDescend,
  resolve(ctx, { regroup }): Resolved | null {
    const { state, actor } = ctx;
    const to = stairsTarget(state, actor.floor, 'down');
    if (to === null) return null;
    const stairs = knownStairs(state, actor.floor, 'down');
    if (stairs === null) return null;
    const depth = floorNode(state, to).depth;
    const onStairs = actor.pos.x === stairs.x && actor.pos.y === stairs.y;

    if (regroup) {
      const { gathered, missing } = gatheringAt(state, actor.floor, stairs);
      if (onStairs) {
        if (missing.length > 0) return null;
        const others = gathered.length > 1 ? 'the party is gathered; ' : '';
        return { request: { id: 'stairs', dir: 'down' }, detail: `${others}taking the stairs down to floor ${depth}` };
      }
      const occupied = actorAt(state, actor.floor, stairs) !== undefined;
      if (occupied && gathered.some((g) => g.id === actor.id)) return null;
    } else if (onStairs) {
      return { request: { id: 'stairs', dir: 'down' }, detail: `taking the stairs down to floor ${depth}` };
    }

    const paths = aiPathGrid(ctx);
    const map = buildGoalMap(paths, [stairs]);
    const cost = map.get(actor.pos.x, actor.pos.y);
    if (cost === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `heading for the stairs down, ${cost} ${cost === 1 ? 'turn' : 'turns'} away`);
  },
  describe: ({ regroup }) => (regroup ? 'go down the stairs with the party' : 'go down the stairs, not waiting for anyone'),
});

/**
 * Wait near the stairs down while the rest of the party gathers, or while another member is on
 * the stairs. Marked `idle`: standing still is the point, so stuck detection leaves it alone.
 */
export const ACT_GATHER = defineRuleAction({
  id: 'act.gather',
  name: 'Gather at the stairs',
  description:
    'Wait at the stairs down until the rest of the party on this floor has caught up, so everyone goes down together.',
  idle: true,
  parse: noParams,
  resolve({ state, actor }: AiCtx): Resolved | null {
    if (stairsTarget(state, actor.floor, 'down') === null) return null;
    const stairs = knownStairs(state, actor.floor, 'down');
    if (stairs === null) return null;
    const { gathered, missing } = gatheringAt(state, actor.floor, stairs);
    if (!gathered.some((g) => g.id === actor.id)) return null;
    const detail = missing.length > 0 ? `waiting at the stairs down for ${names(missing)}` : 'waiting for a turn at the stairs down';
    return { request: { id: 'wait' }, detail };
  },
  describe: () => 'wait at the stairs down for the party',
});

/** The floors domain's conditions, in registration order. */
export const FLOORS_CONDITIONS: readonly ConditionDef[] = [COND_FLOOR_OVERSTAYED, COND_BOTTOM_FLOOR];

/** The floors domain's rule actions, in registration order. */
export const FLOORS_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_DESCEND, ACT_GATHER];
