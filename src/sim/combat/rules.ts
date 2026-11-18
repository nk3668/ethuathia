/**
 * The combat domain's rule conditions and rule actions (docs/ARCHITECTURE.md §4): seeing and
 * fighting enemies, fleeing, and wandering. Adventurers' baseline rules use some of them
 * (`BASELINE_RULES`: flee at very low HP, attack an adjacent enemy); monsters' rule sets in
 * content use them all. The Library can hand each one to the player's own rules.
 */
import type { Pos } from '../../core';
import { MONSTERS } from '../../content';
import { aiPathGrid, followMap, nameOf } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, ParamParser, Resolved, RuleActionDef } from '../ai/types';
import { stepBlocker } from '../coreActions';
import { blockerAt, featureAt, getEntity, getFloor, mayShareTile } from '../entities';
import { buildFleeMap, buildGoalMap, floorPathGrid, OPEN_DOOR_COST, stepToward, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { fieldOfView, sightRadius } from '../perception';
import type { ActorEntity, Entity, RunState } from '../state';
import { statValue } from '../stats/getStat';
import { DIRS_8 } from '../../core';

/** True if `a` and `b` are actors on opposing sides: the party against monsters. Neutrals fight nobody. */
export function isHostile(a: Entity, b: Entity): boolean {
  const fa = a.actor?.faction;
  const fb = b.actor?.faction;
  if (fa === undefined || fb === undefined || fa === 'neutral' || fb === 'neutral') return false;
  return fa !== fb;
}

/** Tiles between two positions, diagonals counting as one. */
export function distance(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Living hostile actors on `actor`'s floor, in id order. */
function hostilesOnFloor(state: RunState, actor: ActorEntity): ActorEntity[] {
  const out: ActorEntity[] = [];
  for (const id of getFloor(state, actor.floor).entities) {
    const e = getEntity(state, id);
    if (e.actor !== undefined && e.actor.hp > 0 && isHostile(actor, e)) out.push(e as ActorEntity);
  }
  return out.sort((a, b) => a.id - b.id);
}

/** Living enemies next to `actor` (diagonals included), in id order. */
export function adjacentEnemies(state: RunState, actor: ActorEntity): ActorEntity[] {
  return hostilesOnFloor(state, actor).filter((e) => distance(e.pos, actor.pos) === 1);
}

/**
 * Living enemies `actor` can see right now, nearest first (ties by id). Its field of view is
 * only worked out when an enemy is within sight range, so idle monsters far from the party stay
 * cheap.
 */
export function visibleEnemies(state: RunState, actor: ActorEntity): ActorEntity[] {
  const radius = sightRadius(state, actor);
  const near = hostilesOnFloor(state, actor).filter((e) => distance(e.pos, actor.pos) <= radius);
  if (near.length === 0) return [];
  const { width } = getFloor(state, actor.floor).terrain;
  const seen = new Set(fieldOfView(state, actor).map((p) => p.y * width + p.x));
  return near
    .filter((e) => seen.has(e.pos.y * width + e.pos.x))
    .sort((a, b) => distance(a.pos, actor.pos) - distance(b.pos, actor.pos) || a.id - b.id);
}

/** `actor`'s HP as a percentage of its maximum. */
export function hpPercent(state: RunState, actor: ActorEntity): number {
  return (actor.actor.hp / Math.max(1, statValue(state, actor, 'hp'))) * 100;
}

/**
 * The grid an actor plans on: adventurers on the party's memory (`aiPathGrid`), monsters on the
 * real floor, which they know. Either way closed doors cost the turn to open them, and others
 * standing nearby cost extra (monsters ignore those they can share a tile with).
 */
export function pathGridFor(ctx: AiCtx): PathGrid {
  const { state, actor } = ctx;
  if (actor.actor.faction === 'party') return aiPathGrid(ctx);
  const paths = floorPathGrid(state, actor.floor, { closedDoorCost: OPEN_DOOR_COST });
  for (const id of getFloor(state, actor.floor).entities) {
    if (id === actor.id) continue;
    const other = getEntity(state, id);
    if (other.actor === undefined || distance(other.pos, actor.pos) > 2 || mayShareTile(actor, other)) continue;
    const i = other.pos.y * paths.width + other.pos.x;
    const cost = paths.cost[i] as number;
    if (cost !== 0) paths.cost[i] = Math.min(0xffff, cost + 8);
  }
  return paths;
}

function listNames(actors: readonly Entity[]): string {
  const names = actors.map(nameOf);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1) as string}`;
}

// ---------------------------------------------------------------------------------------------
// Conditions

/** True when an enemy stands next to the actor. */
export const COND_ENEMY_ADJACENT = defineCondition({
  id: 'cond.enemy_adjacent',
  name: 'Enemy adjacent',
  description: 'True when an enemy stands on a tile next to this one, diagonals included.',
  parse: noParams,
  evaluate({ state, actor }) {
    const enemies = adjacentEnemies(state, actor);
    return enemies.length === 0 ? { ok: false, detail: '' } : { ok: true, detail: `${listNames(enemies)} next to me` };
  },
  describe: () => 'an enemy is next to me',
});

/** True when the actor can see an enemy. */
export const COND_ENEMY_VISIBLE = defineCondition({
  id: 'cond.enemy_visible',
  name: 'Enemy in sight',
  description: 'True when an enemy is in this creature’s own field of view.',
  parse: noParams,
  evaluate({ state, actor }) {
    const enemies = visibleEnemies(state, actor);
    const first = enemies[0];
    return first === undefined ? { ok: false, detail: '' } : { ok: true, detail: `${nameOf(first)} in sight` };
  },
  describe: () => 'an enemy is in sight',
});

/** `cond.hp_below`'s params: the HP threshold as a percentage of the maximum. */
export interface HpBelowParams {
  percent: number;
}

const parseHpBelow: ParamParser<HpBelowParams> = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'Params must be an object with "percent"';
  const { percent, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 1 || percent > 99) {
    return '"percent" must be a whole number from 1 to 99';
  }
  return { percent };
};

/** True while the actor's HP is below a share of its maximum. */
export const COND_HP_BELOW = defineCondition({
  id: 'cond.hp_below',
  name: 'HP below',
  description: 'True while current HP is below the given percentage of maximum HP.',
  parse: parseHpBelow,
  evaluate({ state, actor }, { percent }) {
    const now = hpPercent(state, actor);
    return now < percent ? { ok: true, detail: `HP ${Math.round(now)}% < ${percent}%` } : { ok: false, detail: '' };
  },
  describe: ({ percent }) => `HP below ${percent}%`,
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/** Attack the weakest enemy next to the actor (lowest HP, then lowest id). */
export const ACT_ATTACK_ADJACENT = defineRuleAction({
  id: 'act.attack_adjacent',
  name: 'Attack',
  description:
    'Strike an enemy on a neighboring tile, picking the one with the least HP left. Standing to fight counts as ' +
    'progress, so stuck detection leaves it alone.',
  // Fighting in place is the point: stuck detection must not drop it.
  idle: true,
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const enemies = adjacentEnemies(state, actor);
    if (enemies.length === 0) return null;
    const target = [...enemies].sort((a, b) => a.actor.hp - b.actor.hp || a.id - b.id)[0] as ActorEntity;
    const dir = { x: target.pos.x - actor.pos.x, y: target.pos.y - actor.pos.y };
    return { request: { id: 'attack', dir }, detail: `attacking ${nameOf(target)}` };
  },
  describe: () => 'attack the weakest adjacent enemy',
});

/** Walk toward the nearest enemy in sight. */
export const ACT_APPROACH_ENEMY = defineRuleAction({
  id: 'act.approach_enemy',
  name: 'Close in',
  description: 'Walk toward the nearest enemy in sight, opening doors on the way.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const target = visibleEnemies(ctx.state, ctx.actor)[0];
    if (target === undefined) return null;
    const paths = pathGridFor(ctx);
    const map = buildGoalMap(paths, [target.pos]);
    const cost = map.get(ctx.actor.pos.x, ctx.actor.pos.y);
    if (cost === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `closing in on ${nameOf(target)}`);
  },
  describe: () => 'close in on the nearest enemy in sight',
});

/**
 * Run from the enemies in sight along a flee map (away from them, toward open ground). Can't be
 * done without an escape route: a free step that ends out of every enemy's reach.
 */
export const ACT_FLEE = defineRuleAction({
  id: 'act.flee',
  name: 'Flee',
  description:
    'Run from the enemies in sight, toward open ground rather than into a corner. Only possible when there is an ' +
    'escape route: a free step that leaves no enemy next to you. Cornered, the creature does something else.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const enemies = visibleEnemies(state, actor);
    if (enemies.length === 0) return null;
    // Enemy tiles stay enterable here, so the distance map spreads from them; the step taken
    // never leads onto one, since it is the highest ground on the flee map.
    const paths = pathGridFor(ctx);
    const flee = buildFleeMap(paths, buildGoalMap(paths, enemies.map((e) => e.pos)));
    const dir = stepToward(paths, flee, actor.pos);
    if (dir === null) return null;
    const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
    const near = Math.min(...enemies.map((e) => distance(e.pos, to)));
    if (near <= 1 || blockerAt(state, actor, actor.floor, to) !== undefined) return null;
    const door = featureAt(state, actor.floor, to)?.feature;
    if (door?.kind === 'door' && !door.open) return { request: { id: 'openDoor', dir }, detail: `escaping ${listNames(enemies)}; opening a door` };
    return { request: { id: 'move', dir }, detail: `running from ${listNames(enemies)}` };
  },
  describe: () => 'flee from the enemies in sight',
});

/** How many turns a wandering creature keeps to one heading before it picks another. */
export const WANDER_LEG = 6;

/** A small deterministic hash of three whole numbers, for choices that must not draw randomness. */
function mix(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

/**
 * Roam: keep to a heading for `WANDER_LEG` turns, turning to the next open direction when the
 * way is blocked. The heading comes from a hash of the seed, the creature and the time, so it is
 * deterministic and draws nothing from the RNG streams (a rule action changes nothing).
 */
export const ACT_WANDER = defineRuleAction({
  id: 'act.wander',
  name: 'Wander',
  description: 'Roam the floor aimlessly, changing direction every few turns or when something is in the way.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const start = mix(state.seed, actor.id, Math.floor(state.turn / WANDER_LEG)) % DIRS_8.length;
    for (let i = 0; i < DIRS_8.length; i++) {
      const dir = DIRS_8[(start + i) % DIRS_8.length] as Pos;
      if (stepBlocker(state, actor.floor, actor.pos, dir) !== null) continue;
      const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
      if (blockerAt(state, actor, actor.floor, to) !== undefined) continue;
      return { request: { id: 'move', dir: { x: dir.x, y: dir.y } }, detail: 'wandering' };
    }
    return null;
  },
  describe: () => 'wander',
});

/** The combat domain's conditions, in registration order. */
export const COMBAT_CONDITIONS: readonly ConditionDef[] = [COND_ENEMY_ADJACENT, COND_ENEMY_VISIBLE, COND_HP_BELOW];

/** The combat domain's rule actions, in registration order. */
export const COMBAT_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_ATTACK_ADJACENT, ACT_APPROACH_ENEMY, ACT_FLEE, ACT_WANDER];

/** The display name of a monster def, or the id. */
export function monsterName(defId: string): string {
  return MONSTERS.has(defId) ? MONSTERS.get(defId).name : defId;
}
