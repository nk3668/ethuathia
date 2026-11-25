/**
 * The combat domain's rule conditions and rule actions (docs/ARCHITECTURE.md §4): seeing and
 * fighting enemies, fleeing, and wandering. Adventurers' baseline rules use some of them
 * (`BASELINE_RULES`: flee at very low HP, attack an adjacent enemy); monsters' rule sets in
 * content use them all. The Library can hand each one to the player's own rules.
 */
import type { Pos } from '../../core';
import { aiPathGrid, followMap, nameOf } from '../ai/navigate';
import { engageDistance } from '../ai/tactics';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { AiCtx, ConditionDef, ParamParser, ResolveResult, Resolved, RuleActionDef } from '../ai/types';
import { stepBlocker } from '../coreActions';
import { blockerAt, featureAt, getEntity, getFloor, mayShareTile } from '../entities';
import { buildFleeMap, buildGoalMap, floorPathGrid, OPEN_DOOR_COST, pathAlong, stepToward, UNREACHABLE } from '../goalMap';
import type { PathGrid } from '../goalMap';
import { fieldOfView, sightRadius } from '../perception';
import type { ActorEntity, Entity, RunState } from '../state';
import { statValue } from '../stats/getStat';
import { BASELINE_FLEE_PERCENT, FLEE_CALM_TURNS, FLEE_RELEASE_PERCENT } from './fleeConfig';
import { chooseTarget } from './focus';
import { freshThreats, visibleThreats } from './threat';
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
 * True while an adventurer is, or is about to be, running by the baseline's flee rule (HP below
 * `BASELINE_FLEE_PERCENT`, or still fleeing). Tactic rows that stand their ground (a Tank stepping
 * up, a Healer hanging back) leave the actor to the baseline's flee while this holds.
 */
export function fleeingNow(state: RunState, actor: ActorEntity): boolean {
  return hpPercent(state, actor) < BASELINE_FLEE_PERCENT || actor.ai?.memory.fleeing != null;
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

/**
 * True when the baseline's flee applies (ETH-148): HP is below `BASELINE_FLEE_PERCENT`, or the
 * adventurer started fleeing earlier and has neither recovered to `FLEE_RELEASE_PERCENT` nor gone
 * `FLEE_CALM_TURNS` without seeing a threat. Starting needs a threat in sight (`updateThreatMemory`).
 */
export const COND_FLEEING = defineCondition({
  id: 'cond.fleeing',
  name: 'Fleeing',
  description:
    `True while HP is below ${BASELINE_FLEE_PERCENT}%, and then for as long as the adventurer keeps running: until HP is back to ` +
    `${FLEE_RELEASE_PERCENT}% or no threat has been seen for ${FLEE_CALM_TURNS} turns, so it doesn't turn round and walk back ` +
    'into the fight the moment it gains a point. Only enemies that will come and hurt the party count as threats.',
  parse: noParams,
  evaluate({ state, actor }) {
    const now = hpPercent(state, actor);
    if (now < BASELINE_FLEE_PERCENT) return { ok: true, detail: `HP ${Math.round(now)}% < ${BASELINE_FLEE_PERCENT}%` };
    if (actor.ai.memory.fleeing === null) return { ok: false, detail: '' };
    return { ok: true, detail: `still fleeing, HP ${Math.round(now)}% (until ${FLEE_RELEASE_PERCENT}% or ${FLEE_CALM_TURNS} calm turns)` };
  },
  describe: () => 'fleeing (HP low, and until recovered)',
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/** Attack the weakest enemy next to the actor (lowest HP, then lowest id). */
export const ACT_ATTACK_ADJACENT = defineRuleAction({
  id: 'act.attack_adjacent',
  name: 'Attack',
  description:
    'Strike an enemy on a neighboring tile, picking the one with the least HP left (or the most, with the Strongest focus). Standing to fight counts as ' +
    'progress, so stuck detection leaves it alone.',
  // Fighting in place is the point: stuck detection must not drop it.
  idle: true,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    // The focus tactic (ETH-162, ETH-193) picks whom to strike; the default, Weakest, is the old choice.
    const chosen = chooseTarget(ctx, adjacentEnemies(state, actor), 'strike');
    if (chosen === null) return null;
    const { target, note } = chosen;
    const dir = { x: target.pos.x - actor.pos.x, y: target.pos.y - actor.pos.y };
    return {
      request: { id: 'attack', dir },
      detail: `attacking ${nameOf(target)}`,
      goal: { x: target.pos.x, y: target.pos.y },
      ...(note === undefined ? {} : { skipped: note }),
    };
  },
  describe: () => 'attack the adjacent enemy the focus picks (the weakest, by default)',
});

/** Walk toward the nearest enemy in sight. */
export const ACT_APPROACH_ENEMY = defineRuleAction({
  id: 'act.approach_enemy',
  name: 'Close in',
  description: 'Walk toward the nearest enemy in sight, opening doors on the way.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const visible = visibleEnemies(ctx.state, ctx.actor);
    // Adventurers choose by their focus and stop at their range (ETH-193); monsters close in on the nearest.
    const party = ctx.actor.actor.faction === 'party';
    const chosen = party ? chooseTarget(ctx, visible, 'approach') : null;
    const target = chosen?.target ?? visible[0];
    if (target === undefined) return null;
    if (party && distance(target.pos, ctx.actor.pos) <= engageDistance(ctx)) return null;
    const paths = pathGridFor(ctx);
    const map = buildGoalMap(paths, [target.pos]);
    const cost = map.get(ctx.actor.pos.x, ctx.actor.pos.y);
    if (cost === UNREACHABLE) return null;
    const step = followMap(ctx, paths, map, `closing in on ${nameOf(target)}`);
    return step === null || chosen?.note === undefined ? step : { ...step, skipped: chosen.note };
  },
  describe: () => 'close in on an enemy in sight (the nearest, or the one the focus picks)',
});

/**
 * Run from the enemies in sight along a flee map (away from them, toward open ground). Can't be
 * done without an escape route: a free step that ends out of every enemy's reach.
 */
export const ACT_FLEE = defineRuleAction({
  id: 'act.flee',
  name: 'Flee',
  description:
    'Run from the enemies in sight that will come and hurt you (harmless ones, like a moss tender that only mends its ' +
    'kin, are ignored), toward open ground rather than into a corner. An adventurer that is already fleeing keeps ' +
    'running from where it last saw them until it has recovered or the coast has been clear for a while. Only possible ' +
    'when there is an escape route: a free step that leaves no enemy next to you. Cornered, the creature does something ' +
    'else. Breaking away from an enemy next to you takes a Flee check (Finesse); failing it loses the turn.',
  parse: noParams,
  resolve(ctx): ResolveResult {
    const { state, actor } = ctx;
    const enemies = visibleThreats(state, actor);
    // Out of sight but not out of mind: a fleeing adventurer keeps running from where it last saw them.
    const marks = enemies.length === 0 && actor.actor.faction === 'party' && actor.ai.memory.fleeing !== null ? freshThreats(state, actor) : [];
    if (enemies.length === 0 && marks.length === 0) {
      const harmless = visibleEnemies(state, actor);
      if (harmless.length === 0) return null;
      return { skipped: `ignoring ${listNames(harmless)}: ${harmless.length === 1 ? "it can't" : "they can't"} hurt anyone` };
    }
    // Still running after recovering above the start threshold, but cornered by a threat next to
    // it: turning to fight beats failing Flee checks and taking free hits (ETH-148).
    if (actor.actor.faction === 'party' && hpPercent(state, actor) >= BASELINE_FLEE_PERCENT) {
      const close = enemies.filter((e) => distance(e.pos, actor.pos) <= 1);
      if (close.length > 0) return { skipped: `not breaking away from ${listNames(close)} next to me: HP is above ${BASELINE_FLEE_PERCENT}%` };
    }
    // Enemy tiles stay enterable here, so the distance map spreads from them; the step taken
    // never leads onto one, since it is the highest ground on the flee map.
    const paths = pathGridFor(ctx);
    const dangers = enemies.length > 0 ? enemies.map((e) => e.pos) : marks.map((m) => m.pos);
    const flee = buildFleeMap(paths, buildGoalMap(paths, dangers));
    const dir = stepToward(paths, flee, actor.pos);
    if (dir === null) return null;
    const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
    const near = Math.min(...dangers.map((p) => distance(p, to)));
    if (near <= 1 || blockerAt(state, actor, actor.floor, to) !== undefined) return null;
    const goal = pathAlong(paths, flee, actor.pos).at(-1);
    const withGoal = goal === undefined ? {} : { goal };
    const who = enemies.length > 0 ? listNames(enemies) : marks.map((m) => m.name).join(', ');
    const pursuit = enemies.length > 0 ? 'in pursuit' : 'last seen nearby';
    const still =
      actor.actor.faction === 'party' && actor.ai.memory.fleeing !== null && hpPercent(state, actor) >= BASELINE_FLEE_PERCENT
        ? `still fleeing: ${who} ${pursuit}, HP ${Math.round(hpPercent(state, actor))}%`
        : null;
    const door = featureAt(state, actor.floor, to)?.feature;
    if (door?.kind === 'door' && !door.open) {
      return { request: { id: 'openDoor', dir }, detail: `${still ?? `escaping ${who}`}; opening a door`, ...withGoal };
    }
    // `flee`, not `move`: with an enemy adjacent it takes a Flee check (ETH-081, `flee.ts`).
    const adjacent = enemies.some((e) => distance(e.pos, actor.pos) <= 1);
    return {
      request: { id: 'flee', dir },
      detail: still ?? `${adjacent ? 'breaking away from' : 'running from'} ${who}`,
      ...withGoal,
    };
  },
  describe: () => 'flee from the threats in sight',
});

/**
 * Stay put when there is nowhere left to run (ETH-148). Once an adventurer is fleeing and the flee
 * map has no free step, walking on would only take it back toward the threat (exploring leads past
 * it), so it holds still until the threat comes (and `act.attack_adjacent` fights it), HP recovers,
 * or the coast has been clear for `FLEE_CALM_TURNS`.
 */
export const ACT_HOLD_POSITION = defineRuleAction({
  id: 'act.hold_position',
  name: 'Hold position',
  description:
    'Stand still while fleeing with no escape route left, rather than walk back toward the enemy that was ' +
    'being fled. Ends when HP has recovered, when no threat has been seen for a while, or when an enemy ' +
    'reaches the adventurer and there is a fight to be had.',
  idle: true,
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    if (actor.actor.faction !== 'party' || actor.ai.memory.fleeing === null) return null;
    if (adjacentEnemies(state, actor).length > 0) return null;
    return { request: { id: 'wait' }, detail: `nowhere left to run; holding still until the coast is clear, HP ${Math.round(hpPercent(state, actor))}%` };
  },
  describe: () => 'hold still while fleeing with nowhere to run',
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
      return { request: { id: 'move', dir: { x: dir.x, y: dir.y } }, detail: 'wandering', goal: to };
    }
    return null;
  },
  describe: () => 'wander',
});

/** The combat domain's conditions, in registration order. */
export const COMBAT_CONDITIONS: readonly ConditionDef[] = [COND_ENEMY_ADJACENT, COND_ENEMY_VISIBLE, COND_HP_BELOW, COND_FLEEING];

/** The combat domain's rule actions, in registration order. */
export const COMBAT_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_ATTACK_ADJACENT, ACT_APPROACH_ENEMY, ACT_FLEE, ACT_HOLD_POSITION, ACT_WANDER];
