/**
 * Monster roles (ETH-040): the conditions and rule actions that make a brute, skirmisher, caster,
 * support or swarm fight the way it does. The role rule sets themselves are content
 * (`ROLE_RULES` in `src/content/monsters.ts`); they name these by id. Like every condition and
 * rule action, these change nothing: they read the state and pick an action request.
 *
 * - Skirmishers: `cond.just_attacked` → `act.fall_back` (strike, then step out of reach).
 * - Casters: `act.fall_back` from anyone next to them, `act.cast_bolt` at range.
 * - Supports: `cond.ally_hurt` → `act.mend_ally`, `act.bolster_ally`, `act.hang_back`.
 * - Swarms: `act.surround` (make for a free tile around the prey).
 *
 * The powers (`bolt`, `mend`, `bolster`) are on the monster def; `rolePowers` reads them.
 */
import { DIRS_8 } from '../../core';
import type { Pos } from '../../core';
import { MONSTERS, monsterPowers } from '../../content';
import type { BoltPower, BolsterPower, MendPower } from '../../content';
import { followMap, nameOf } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { ConditionDef, ParamParser, Resolved, RuleActionDef } from '../ai/types';
import { stepBlocker } from '../coreActions';
import { blockerAt, getEntity, getFloor, inFloorBounds } from '../entities';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { fieldOfView, sightRadius } from '../perception';
import type { ActorEntity, Entity, RunState } from '../state';
import { templatesOf } from './overlay';
import { adjacentEnemies, distance, fleeingNow, hpPercent, isHostile, pathGridFor, visibleEnemies } from './rules';
import { isThreat } from './threat';

/** The role powers of an actor: those on its monster def, or none (adventurers, for now). */
export interface RolePowers {
  bolt?: BoltPower;
  mend?: MendPower;
  bolster?: BolsterPower;
}

/** What `actor` can do beyond a blow: the powers on its monster def, with its templates' over them (ETH-117). */
export function rolePowers(actor: Entity): RolePowers {
  if (!MONSTERS.has(actor.def)) return {};
  return { ...monsterPowers(MONSTERS.get(actor.def), templatesOf(actor)) };
}

/** True if `a` and `b` are different living actors on the same side (and not neutral). */
export function isAlly(a: Entity, b: Entity): boolean {
  if (a.id === b.id || a.actor === undefined || b.actor === undefined || b.actor.hp <= 0) return false;
  return a.actor.faction !== 'neutral' && a.actor.faction === b.actor.faction;
}

/** True if `viewer` can see `target` right now: same floor, within sight and in its field of view. */
export function canSee(state: RunState, viewer: ActorEntity, target: Entity): boolean {
  if (target.floor !== viewer.floor || distance(target.pos, viewer.pos) > sightRadius(state, viewer)) return false;
  return fieldOfView(state, viewer).some((p) => p.x === target.pos.x && p.y === target.pos.y);
}

/**
 * Living allies `actor` can see right now, nearest first (ties by id). Its field of view is only
 * worked out when an ally is within sight range.
 */
export function visibleAllies(state: RunState, actor: ActorEntity): ActorEntity[] {
  const radius = sightRadius(state, actor);
  const near: ActorEntity[] = [];
  for (const id of getFloor(state, actor.floor).entities) {
    const e = getEntity(state, id);
    if (isAlly(actor, e) && distance(e.pos, actor.pos) <= radius) near.push(e as ActorEntity);
  }
  if (near.length === 0) return [];
  const { width } = getFloor(state, actor.floor).terrain;
  const seen = new Set(fieldOfView(state, actor).map((p) => p.y * width + p.x));
  return near
    .filter((e) => seen.has(e.pos.y * width + e.pos.x))
    .sort((a, b) => distance(a.pos, actor.pos) - distance(b.pos, actor.pos) || a.id - b.id);
}

function hasStatus(entity: Entity, statusId: string): boolean {
  return entity.stats?.statuses.some((s) => s.status === statusId) ?? false;
}

// ---------------------------------------------------------------------------------------------
// Conditions

/** True when the actor's last decision was a blow (`act.attack_adjacent`). */
export const COND_JUST_ATTACKED = defineCondition({
  id: 'cond.just_attacked',
  name: 'Just attacked',
  description: 'True right after a turn spent striking an enemy, before doing anything else.',
  parse: noParams,
  evaluate({ actor }) {
    return actor.ai.memory.intent?.action === 'act.attack_adjacent' ? { ok: true, detail: 'just struck' } : { ok: false, detail: '' };
  },
  describe: () => 'I just attacked',
});

/** `cond.ally_hurt`'s params: the HP threshold as a percentage of the ally's maximum. */
export interface AllyHurtParams {
  percent: number;
}

const parseAllyHurt: ParamParser<AllyHurtParams> = (raw) => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'Params must be an object with "percent"';
  const { percent, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return `Unknown parameter "${Object.keys(rest)[0] as string}"`;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 1 || percent > 99) {
    return '"percent" must be a whole number from 1 to 99';
  }
  return { percent };
};

/** True while an ally the actor can see is below a share of its maximum HP. */
export const COND_ALLY_HURT = defineCondition({
  id: 'cond.ally_hurt',
  name: 'Ally hurt',
  description: 'True while an ally in sight has less than the given percentage of their maximum HP.',
  parse: parseAllyHurt,
  evaluate({ state, actor }, { percent }) {
    const hurt = visibleAllies(state, actor).find((a) => hpPercent(state, a) < percent);
    return hurt === undefined
      ? { ok: false, detail: '' }
      : { ok: true, detail: `${nameOf(hurt)} at ${Math.round(hpPercent(state, hurt))}% HP` };
  },
  describe: ({ percent }) => `an ally is below ${percent}% HP`,
});

// ---------------------------------------------------------------------------------------------
// Rule actions

/**
 * One step out of reach of every enemy in sight: to a free neighboring tile that no enemy is
 * next to, the one farthest from the nearest enemy (ties go to the first direction in `DIRS_8`).
 * Only while an enemy is next to the actor; `null` if none is or there is no such tile.
 */
export const ACT_FALL_BACK = defineRuleAction({
  id: 'act.fall_back',
  name: 'Fall back',
  description:
    'Step away from the enemies next to you, onto a free tile none of them can reach without moving. Only when an ' +
    'enemy is next to you and such a tile exists.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    if (adjacentEnemies(state, actor).length === 0) return null;
    const enemies = visibleEnemies(state, actor);
    let best: { dir: Pos; gap: number } | null = null;
    for (const dir of DIRS_8) {
      if (stepBlocker(state, actor.floor, actor.pos, dir) !== null) continue;
      const to = { x: actor.pos.x + dir.x, y: actor.pos.y + dir.y };
      if (blockerAt(state, actor, actor.floor, to) !== undefined) continue;
      const gap = Math.min(...enemies.map((e) => distance(e.pos, to)));
      if (gap >= 2 && (best === null || gap > best.gap)) best = { dir, gap };
    }
    if (best === null) return null;
    const names = adjacentEnemies(state, actor).map(nameOf).join(' and ');
    const to = { x: actor.pos.x + best.dir.x, y: actor.pos.y + best.dir.y };
    return { request: { id: 'move', dir: { x: best.dir.x, y: best.dir.y } }, detail: `falling back from ${names}`, goal: to };
  },
  describe: () => 'fall back out of reach',
});

/** Bolt the nearest enemy in sight within the actor's bolt range. Needs a bolt power. */
export const ACT_CAST_BOLT = defineRuleAction({
  id: 'act.cast_bolt',
  name: 'Bolt',
  description:
    'Attack the nearest enemy in sight from a distance, if they are within range. Uses the same chance to hit and ' +
    'damage as a blow. Only creatures with a ranged attack can do this.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const { bolt } = rolePowers(actor);
    if (bolt === undefined) return null;
    const target = visibleEnemies(state, actor).find((e) => distance(e.pos, actor.pos) <= bolt.range);
    if (target === undefined) return null;
    return {
      request: { id: 'bolt', target: target.id },
      detail: `hurling a ${bolt.name} at ${nameOf(target)}`,
      goal: { x: target.pos.x, y: target.pos.y },
    };
  },
  describe: () => 'attack from range',
});

/**
 * Make for a free tile next to the nearest enemy in sight that nobody stands on, so a swarm
 * spreads around its prey instead of queueing behind one another. `null` once no such tile is
 * left or none can be reached (the next rule closes in instead).
 */
export const ACT_SURROUND = defineRuleAction({
  id: 'act.surround',
  name: 'Surround',
  description:
    'Head for a free spot next to the nearest enemy in sight that no one else stands on, so a pack ends up all ' +
    'around its prey.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const target = visibleEnemies(state, actor)[0];
    if (target === undefined) return null;
    const floor = getFloor(state, actor.floor);
    const paths = pathGridFor(ctx);
    const goals: Pos[] = [];
    for (const dir of DIRS_8) {
      const pos = { x: target.pos.x + dir.x, y: target.pos.y + dir.y };
      if (!inFloorBounds(floor, pos) || paths.cost[pos.y * paths.width + pos.x] === 0) continue;
      const taken = floor.entities.some((id) => {
        const e = getEntity(state, id);
        return id !== actor.id && e.actor !== undefined && e.actor.hp > 0 && e.pos.x === pos.x && e.pos.y === pos.y;
      });
      if (!taken) goals.push(pos);
    }
    if (goals.length === 0) return null;
    const map = buildGoalMap(paths, goals);
    if (map.get(actor.pos.x, actor.pos.y) === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `surrounding ${nameOf(target)}`);
  },
  describe: () => 'surround the nearest enemy',
});

/** Heal the most hurt ally in sight within mend range. Needs a mend power. */
export const ACT_MEND_ALLY = defineRuleAction({
  id: 'act.mend_ally',
  name: 'Mend ally',
  description: 'Heal the most hurt ally in sight within reach. Only creatures that can mend can do this.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const { mend } = rolePowers(actor);
    if (mend === undefined) return null;
    const target = visibleAllies(state, actor)
      .filter((a) => distance(a.pos, actor.pos) <= mend.range && hpPercent(state, a) < 100)
      .sort((a, b) => hpPercent(state, a) - hpPercent(state, b) || a.id - b.id)[0];
    if (target === undefined) return null;
    return {
      request: { id: 'aid', target: target.id, power: 'mend' },
      detail: `mending ${nameOf(target)}`,
      goal: { x: target.pos.x, y: target.pos.y },
    };
  },
  describe: () => 'mend the most hurt ally',
});

/** Spur on an ally in sight, within reach, that is next to an enemy and not spurred yet. */
export const ACT_BOLSTER_ALLY = defineRuleAction({
  id: 'act.bolster_ally',
  name: 'Bolster ally',
  description:
    'Spur on an ally in sight and within reach who is fighting an enemy and isn’t already spurred. Only creatures ' +
    'that can bolster can do this.',
  parse: noParams,
  resolve({ state, actor }): Resolved | null {
    const { bolster } = rolePowers(actor);
    if (bolster === undefined) return null;
    const target = visibleAllies(state, actor).find(
      (a) => distance(a.pos, actor.pos) <= bolster.range && !hasStatus(a, bolster.status) && adjacentEnemies(state, a).length > 0,
    );
    if (target === undefined) return null;
    return {
      request: { id: 'aid', target: target.id, power: 'bolster' },
      detail: `spurring on ${nameOf(target)}`,
      goal: { x: target.pos.x, y: target.pos.y },
    };
  },
  describe: () => 'spur on an ally in a fight',
});

/**
 * Stay behind its allies: walk toward the ally nearest the enemy while it is out of reach of the
 * actor's powers, otherwise hold still out of the fight. Needs an enemy in sight.
 */
export const ACT_HANG_BACK = defineRuleAction({
  id: 'act.hang_back',
  name: 'Hang back',
  description:
    'Keep out of the fight but close to your allies: move toward the ally nearest the enemy while they are out of ' +
    'reach, otherwise wait where you are.',
  idle: true,
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const enemy = visibleEnemies(state, actor)[0];
    if (enemy === undefined) return null;
    const powers = rolePowers(actor);
    const reach = Math.min(powers.mend?.range ?? 3, powers.bolster?.range ?? 3);
    const front = visibleAllies(state, actor).sort((a, b) => distance(a.pos, enemy.pos) - distance(b.pos, enemy.pos) || a.id - b.id)[0];
    // An adventurer (a Healer, ETH-193) only hangs back behind an ally that is nearer the enemy, never
    // when alone, in a melee of its own or running; then it plays as normal.
    if (actor.actor.faction === 'party') {
      if (!isThreat(state, enemy)) return null;
      if (front === undefined || distance(front.pos, enemy.pos) >= distance(actor.pos, enemy.pos)) return null;
      if (adjacentEnemies(state, actor).length > 0 || fleeingNow(state, actor)) return null;
      // Only while the ally is actually fighting: waiting on a foe that is not coming would stall the party.
      if (adjacentEnemies(state, front).length === 0) return null;
    }
    if (front !== undefined && distance(front.pos, actor.pos) > reach) {
      const paths = pathGridFor(ctx);
      const step = followMap(ctx, paths, buildGoalMap(paths, [front.pos]), `staying close to ${nameOf(front)}`);
      if (step !== null) return step;
    }
    return { request: { id: 'wait' }, detail: `keeping back from ${nameOf(enemy)}` };
  },
  describe: () => 'hang back behind my allies',
});

/** Enemies in sight with a bolt that reaches `actor`, nearest first. */
function castersInRange(state: RunState, actor: ActorEntity): ActorEntity[] {
  return visibleEnemies(state, actor).filter((e) => {
    const { bolt } = rolePowers(e);
    return bolt !== undefined && distance(e.pos, actor.pos) <= bolt.range;
  });
}

/** True when an enemy in sight could bolt the actor from where it stands. */
export const COND_IN_BOLT_RANGE = defineCondition({
  id: 'cond.in_bolt_range',
  name: 'Under fire',
  description: 'True when an enemy in sight that attacks from a distance has you within its range.',
  parse: noParams,
  evaluate({ state, actor }) {
    const caster = castersInRange(state, actor)[0];
    return caster === undefined ? { ok: false, detail: '' } : { ok: true, detail: `${nameOf(caster)} can reach me from afar` };
  },
  describe: () => 'a ranged enemy has me in range',
});

/** Close in on the nearest enemy in sight that has the actor in bolt range. */
export const ACT_RUSH_CASTER = defineRuleAction({
  id: 'act.rush_caster',
  name: 'Rush the caster',
  description: 'Close in on the nearest enemy in sight that can attack you from a distance, instead of standing under fire.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const caster = castersInRange(ctx.state, ctx.actor)[0];
    if (caster === undefined) return null;
    const paths = pathGridFor(ctx);
    const map = buildGoalMap(paths, [caster.pos]);
    if (map.get(ctx.actor.pos.x, ctx.actor.pos.y) === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `rushing ${nameOf(caster)}`);
  },
  describe: () => 'rush a ranged enemy',
});

/** The role conditions, in registration order. */
export const ROLE_CONDITIONS: readonly ConditionDef[] = [COND_JUST_ATTACKED, COND_ALLY_HURT, COND_IN_BOLT_RANGE];

/** The role rule actions, in registration order. */
export const ROLE_RULE_ACTIONS: readonly RuleActionDef[] = [
  ACT_FALL_BACK,
  ACT_CAST_BOLT,
  ACT_SURROUND,
  ACT_MEND_ALLY,
  ACT_BOLSTER_ALLY,
  ACT_HANG_BACK,
  ACT_RUSH_CASTER,
];

/** Whether `a` may target `b` with a bolt: a living enemy. */
export function boltable(a: Entity, b: Entity): boolean {
  return b.actor !== undefined && b.actor.hp > 0 && isHostile(a, b);
}
