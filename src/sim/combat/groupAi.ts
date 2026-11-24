/**
 * Cohesive monster group AI and corridor patrols (ETH-135):
 * - Room-tethered idle (`act.tether_wander`) so unalerted room encounters stay together until engaged.
 * - Shared group alert (`cond.has_alert` + `act.pursue_alert`) triggered on sight or damage so
 *   supports, casters, and frontline packmates engage as one wave and pursue briefly around corners.
 * - Deterministic multi-room corridor patrols (`act.patrol`) that never linger on stairs tiles.
 *
 * Pure rule conditions and actions never mutate state; state updates happen exclusively in the
 * `combatTurnStart` and `strike` hooks, keeping decisions and save/load deterministic.
 */
import { clonePlain, DIRS_8 } from '../../core';
import type { Pos } from '../../core';
import type { MonsterRule } from '../../content';
import { followMap } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, Resolved, RuleActionDef } from '../ai/types';
import { stepBlocker } from '../coreActions';
import { blockerAt, featureAt, getEntity, getFloor, inFloorBounds } from '../entities';
import type { Rect } from '../gen/types';
import { buildGoalMap, floorPathGrid, OPEN_DOOR_COST, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { Terrain } from '../state';
import type { ActorEntity, FloorId, RunState } from '../state';
import { distance, isHostile, pathGridFor, visibleEnemies, WANDER_LEG } from './rules';

/** Turns an alerted monster remembers and pursues a threat after losing sight. */
export const PURSUIT_MEMORY_TURNS = 8;

/** Extra pathing cost for stairs tiles in patrol pathing so patrols route around stairs when possible. */
const STAIRS_AVOID_COST = 50;

/** Plain-data threat memory on a monster's `MonsterPart`. */
export interface MonsterAlert {
  pos: Pos;
  untilTurn: number;
}

/** Plain-data corridor patrol route on a monster's `MonsterPart`. */
export interface MonsterPatrol {
  waypoints: Pos[];
  next: number;
}

/** Options controlling how `withGroupAiRules` adapts a monster's rule list. */
export interface GroupAiRuleOptions {
  hasHomeRoom: boolean;
  hasPatrol: boolean;
  hasGroup?: boolean;
}

function mix(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

function copyRule(r: MonsterRule): MonsterRule {
  return {
    condition: r.condition.params === undefined ? { id: r.condition.id } : { id: r.condition.id, params: clonePlain(r.condition.params) },
    action: r.action.params === undefined ? { id: r.action.id } : { id: r.action.id, params: clonePlain(r.action.params) },
  };
}

function inRect(pos: Pos, rect: Rect): boolean {
  return pos.x >= rect.x && pos.x < rect.x + rect.w && pos.y >= rect.y && pos.y < rect.y + rect.h;
}

function isStairsAt(state: RunState, floorId: FloorId, pos: Pos): boolean {
  return featureAt(state, floorId, pos)?.feature?.kind === 'stairs';
}

function patrolPathGrid(ctx: AiCtx): PathGrid {
  const paths = pathGridFor(ctx);
  const floor = getFloor(ctx.state, ctx.actor.floor);
  for (const id of floor.entities) {
    const e = ctx.state.entities[id];
    if (e?.feature?.kind !== 'stairs') continue;
    if (e.pos.x === ctx.actor.pos.x && e.pos.y === ctx.actor.pos.y) continue;
    const idx = e.pos.y * paths.width + e.pos.x;
    const cost = paths.cost[idx] as number;
    if (cost !== 0) paths.cost[idx] = Math.min(0xffff, cost + STAIRS_AVOID_COST);
  }
  return paths;
}

function stepOffStairs(state: RunState, actor: ActorEntity): Resolved | null {
  for (const dir of DIRS_8) {
    if (stepBlocker(state, actor.floor, actor.pos, dir) !== null) continue;
    const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
    if (isStairsAt(state, actor.floor, to)) continue;
    if (blockerAt(state, actor, actor.floor, to) !== undefined) continue;
    return { request: { id: 'move', dir: { x: dir.x, y: dir.y } }, detail: 'stepping clear of stairs', goal: to };
  }
  return null;
}

function roomTiles(state: RunState, floorId: FloorId, rect: Rect): Pos[] {
  const floor = getFloor(state, floorId);
  const { width, height, cells } = floor.terrain;
  const preferred: Pos[] = [];
  const fallback: Pos[] = [];
  const y0 = Math.max(0, rect.y);
  const y1 = Math.min(height, rect.y + rect.h);
  const x0 = Math.max(0, rect.x);
  const x1 = Math.min(width, rect.x + rect.w);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (cells[y * width + x] !== Terrain.Floor) continue;
      const pos = { x, y };
      if (isStairsAt(state, floorId, pos)) fallback.push(pos);
      else preferred.push(pos);
    }
  }
  return preferred.length > 0 ? preferred : fallback;
}

function deterministicWander(state: RunState, actor: ActorEntity, filter?: (to: Pos) => boolean): Resolved | null {
  const start = mix(state.seed, actor.id, Math.floor(state.turn / WANDER_LEG)) % DIRS_8.length;
  for (let i = 0; i < DIRS_8.length; i++) {
    const dir = DIRS_8[(start + i) % DIRS_8.length] as Pos;
    if (stepBlocker(state, actor.floor, actor.pos, dir) !== null) continue;
    const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
    if (filter !== undefined && !filter(to)) continue;
    if (blockerAt(state, actor, actor.floor, to) !== undefined) continue;
    return { request: { id: 'move', dir: { x: dir.x, y: dir.y } }, detail: 'wandering', goal: to };
  }
  return null;
}

/**
 * Adapts a monster's base rule list for group alert pursuit, room tethering, or patrolling:
 * - When none of `hasHomeRoom`, `hasPatrol`, or `hasGroup` is set, returns a plain copy of
 *   `baseRules` unchanged so ungrouped `spawnMonster` calls preserve exact compatibility.
 * - Otherwise inserts `cond.has_alert → act.pursue_alert` right before the trailing idle rule and
 *   switches the trailing idle action to `act.patrol` (`hasPatrol`) or `act.tether_wander`
 *   (`hasHomeRoom`), or keeps `act.wander` when only `hasGroup` is set.
 */
export function withGroupAiRules(baseRules: readonly MonsterRule[], options: GroupAiRuleOptions): MonsterRule[] {
  const copied = baseRules.map(copyRule);
  if (!options.hasHomeRoom && !options.hasPatrol && options.hasGroup !== true) return copied;

  const idleActionId = options.hasPatrol ? 'act.patrol' : options.hasHomeRoom ? 'act.tether_wander' : 'act.wander';
  const alertRule: MonsterRule = { condition: { id: 'cond.has_alert' }, action: { id: 'act.pursue_alert' } };

  const last = copied.at(-1);
  if (last !== undefined && last.condition.id === 'cond.always' && last.action.id === 'act.wander') {
    const prefix = copied.slice(0, -1);
    return [...prefix, alertRule, { condition: { id: 'cond.always' }, action: { id: idleActionId } }];
  }
  return [...copied, alertRule, { condition: { id: 'cond.always' }, action: { id: idleActionId } }];
}

// ---------------------------------------------------------------------------------------------
// Conditions & rule actions (pure, never mutate state)

/** True while the actor carries an active, non-expired alert. */
export const COND_HAS_ALERT = defineCondition({
  id: 'cond.has_alert',
  name: 'Has alert',
  description: 'True while this creature remembers a recent threat sighting or attack.',
  parse: noParams,
  evaluate({ state, actor }) {
    const alert = actor.monster?.alert;
    if (alert === undefined || state.turn > alert.untilTurn) return { ok: false, detail: '' };
    return { ok: true, detail: `alerted toward (${alert.pos.x}, ${alert.pos.y})` };
  },
  describe: () => 'has a recent alert',
});

/** Walk toward `monster.alert.pos`, opening closed doors on the way. */
export const ACT_PURSUE_ALERT = defineRuleAction({
  id: 'act.pursue_alert',
  name: 'Pursue alert',
  description: 'Head toward the last known position of a spotted or attacking enemy, opening closed doors.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const alert = actor.monster?.alert;
    if (alert === undefined || state.turn > alert.untilTurn) return null;
    if (actor.pos.x === alert.pos.x && actor.pos.y === alert.pos.y) return null;
    const paths = pathGridFor(ctx);
    const map = buildGoalMap(paths, [alert.pos]);
    if (map.get(actor.pos.x, actor.pos.y) === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `investigating threat near (${alert.pos.x}, ${alert.pos.y})`);
  },
  describe: () => 'pursue the last known threat position',
});

/** Follow `monster.patrol.waypoints[next]` without idling on stairs tiles. */
export const ACT_PATROL = defineRuleAction({
  id: 'act.patrol',
  name: 'Patrol',
  description: 'Follow a deterministic loop of corridor and room waypoints, never lingering on stairs.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const patrol = actor.monster?.patrol;
    if (patrol === undefined || patrol.waypoints.length === 0) return null;
    const target = patrol.waypoints[patrol.next];
    if (target === undefined) return null;
    const onStairs = isStairsAt(state, actor.floor, actor.pos);
    const paths = patrolPathGrid(ctx);
    const map = buildGoalMap(paths, [target]);
    if (map.get(actor.pos.x, actor.pos.y) !== UNREACHABLE) {
      const step = followMap(ctx, paths, map, `patrolling toward (${target.x}, ${target.y})`);
      if (step !== null && (!onStairs || step.request.id !== 'wait')) return step;
    }
    return onStairs ? stepOffStairs(state, actor) : null;
  },
  describe: () => 'patrol waypoints',
});

/** Roam deterministically inside `homeRoom`, walk back if outside, or fall back to `act.wander`. */
export const ACT_TETHER_WANDER = defineRuleAction({
  id: 'act.tether_wander',
  name: 'Roam home room',
  description: 'Roam within a home room while unalerted, returning if pulled outside, or wander freely if untethered.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const room = actor.monster?.homeRoom;
    if (room === undefined) {
      return deterministicWander(state, actor);
    }
    if (!inRect(actor.pos, room)) {
      const goals = roomTiles(state, actor.floor, room);
      if (goals.length > 0) {
        const paths = patrolPathGrid(ctx);
        const map = buildGoalMap(paths, goals);
        if (map.get(actor.pos.x, actor.pos.y) !== UNREACHABLE) {
          const back = followMap(ctx, paths, map, 'returning to home room');
          if (back !== null) return back;
        }
      }
      return isStairsAt(state, actor.floor, actor.pos) ? stepOffStairs(state, actor) : null;
    }
    const onStairs = isStairsAt(state, actor.floor, actor.pos);
    const step = deterministicWander(state, actor, (to) => inRect(to, room) && !isStairsAt(state, actor.floor, to));
    if (step !== null) return step;
    if (onStairs) return stepOffStairs(state, actor);
    return null;
  },
  describe: () => 'roam near home room',
});

/** Group AI conditions registered in `COMBAT_DOMAIN`. */
export const GROUP_CONDITIONS: readonly ConditionDef[] = [COND_HAS_ALERT];

/** Group AI rule actions registered in `COMBAT_DOMAIN`. */
export const GROUP_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_PURSUE_ALERT, ACT_PATROL, ACT_TETHER_WANDER];

// ---------------------------------------------------------------------------------------------
// Hook-driven state updates (`combatTurnStart` & `strike`)

/**
 * Sets `alert` on `source` (if alive) and broadcasts a fresh copy to every living same-floor
 * packmate sharing `source.monster.groupId`.
 */
export function broadcastAlert(state: RunState, source: ActorEntity, targetPos: Pos): void {
  const m = source.monster;
  if (m === undefined) return;
  const untilTurn = state.turn + PURSUIT_MEMORY_TURNS;
  if (source.actor.hp > 0) {
    m.alert = { pos: { x: targetPos.x, y: targetPos.y }, untilTurn };
  }
  const groupId = m.groupId;
  if (groupId === undefined) return;
  for (const id of getFloor(state, source.floor).entities) {
    if (id === source.id) continue;
    const mate = state.entities[id];
    if (mate?.monster === undefined || mate.actor === undefined || mate.actor.hp <= 0) continue;
    if (mate.monster.groupId !== groupId) continue;
    mate.monster.alert = { pos: { x: targetPos.x, y: targetPos.y }, untilTurn };
  }
}

/**
 * Updates group alert state and patrol waypoint progression at the start of a monster's turn:
 * - Sees a hostile: sets/refreshes `alert` and broadcasts to same-floor packmates with `groupId`.
 * - No visible hostile: clears `alert` when expired or already standing at `alert.pos`.
 * - Patrol: advances `patrol.next` when within Chebyshev 1 of the current waypoint.
 */
export function updateMonsterTurnState(state: RunState, actor: ActorEntity): void {
  const m = actor.monster;
  if (m === undefined || actor.actor.hp <= 0) return;

  const seen = visibleEnemies(state, actor);
  if (seen.length > 0) {
    const nearest = seen[0] as ActorEntity;
    broadcastAlert(state, actor, nearest.pos);
  } else if (m.alert !== undefined) {
    if (state.turn > m.alert.untilTurn || (actor.pos.x === m.alert.pos.x && actor.pos.y === m.alert.pos.y)) {
      delete m.alert;
    }
  }

  const patrol = m.patrol;
  if (patrol !== undefined && patrol.waypoints.length > 0) {
    let steps = 0;
    while (steps < patrol.waypoints.length) {
      const wp = patrol.waypoints[patrol.next];
      if (wp === undefined || distance(actor.pos, wp) > 1) break;
      patrol.next = (patrol.next + 1) % patrol.waypoints.length;
      steps++;
    }
  }
}

/**
 * Immediately alerts a hit monster (if it survived) and all living same-floor packmates sharing
 * `groupId` with the hostile attacker's position.
 */
export function alertMonsterOnDamage(state: RunState, victim: ActorEntity, attacker: ActorEntity): void {
  if (victim.monster === undefined || !isHostile(attacker, victim)) return;
  broadcastAlert(state, victim, attacker.pos);
}

// ---------------------------------------------------------------------------------------------
// Invariants (`combat.groups` and `combat.patrols`)

/** Validates `groupId`, `homeRoom`, and `alert` fields on every monster entity. */
export function groupInvariantProblems(state: RunState): string[] {
  const problems: string[] = [];
  for (const e of Object.values(state.entities)) {
    const m = e.monster;
    if (m === undefined) continue;
    const floor = state.floors[e.floor];
    if (floor === undefined) continue;
    const { width, height } = floor.terrain;

    if (m.groupId !== undefined && (!Number.isSafeInteger(m.groupId) || m.groupId < 1)) {
      problems.push(`monster ${e.id} has invalid groupId ${String(m.groupId)}`);
    }
    if (m.homeRoom !== undefined) {
      const r = m.homeRoom;
      if (
        !Number.isSafeInteger(r.x) ||
        !Number.isSafeInteger(r.y) ||
        !Number.isSafeInteger(r.w) ||
        !Number.isSafeInteger(r.h) ||
        r.w < 1 ||
        r.h < 1 ||
        r.x < 0 ||
        r.y < 0 ||
        r.x + r.w > width ||
        r.y + r.h > height
      ) {
        problems.push(`monster ${e.id} has invalid homeRoom (${r.x},${r.y},${r.w}x${r.h}) on "${e.floor}"`);
      }
    }
    if (m.alert !== undefined) {
      const { pos, untilTurn } = m.alert;
      if (!inFloorBounds(floor, pos)) {
        problems.push(`monster ${e.id} has out-of-bounds alert pos (${pos.x}, ${pos.y}) on "${e.floor}"`);
      }
      if (!Number.isSafeInteger(untilTurn) || untilTurn < 0) {
        problems.push(`monster ${e.id} has invalid alert untilTurn ${String(untilTurn)}`);
      }
    }
  }
  return problems;
}

/** Validates `patrol` loops on every patrolling monster (floor terrain, non-stairs waypoints, valid `next`). */
export function patrolInvariantProblems(state: RunState): string[] {
  const problems: string[] = [];
  for (const e of Object.values(state.entities)) {
    const patrol = e.monster?.patrol;
    if (patrol === undefined) continue;
    const floor = state.floors[e.floor];
    if (floor === undefined) continue;

    if (!Array.isArray(patrol.waypoints) || patrol.waypoints.length === 0) {
      problems.push(`monster ${e.id} has an empty patrol waypoint list`);
      continue;
    }
    if (!Number.isSafeInteger(patrol.next) || patrol.next < 0 || patrol.next >= patrol.waypoints.length) {
      problems.push(`monster ${e.id} has patrol.next ${String(patrol.next)} outside 0..${patrol.waypoints.length - 1}`);
    }
    const { width, cells } = floor.terrain;
    for (let i = 0; i < patrol.waypoints.length; i++) {
      const wp = patrol.waypoints[i] as Pos;
      if (!inFloorBounds(floor, wp)) {
        problems.push(`monster ${e.id} patrol waypoint[${i}] (${wp.x}, ${wp.y}) is outside floor "${e.floor}"`);
        continue;
      }
      if (cells[wp.y * width + wp.x] !== Terrain.Floor) {
        problems.push(`monster ${e.id} patrol waypoint[${i}] (${wp.x}, ${wp.y}) is not floor terrain`);
      }
      if (isStairsAt(state, e.floor, wp)) {
        problems.push(`monster ${e.id} patrol waypoint[${i}] (${wp.x}, ${wp.y}) lies on stairs`);
      }
    }
  }
  return problems;
}

/** Convenience export of `floorPathGrid` for patrol route checks in `encounters.ts`. */
export function floorOpenPathGrid(state: RunState, floorId: FloorId): PathGrid {
  return floorPathGrid(state, floorId, { closedDoorCost: OPEN_DOOR_COST });
}

export { getEntity };
