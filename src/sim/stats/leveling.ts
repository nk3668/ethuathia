/**
 * XP, levels and class growth (ETH-034, ETH-110; docs/ARCHITECTURE.md Contracts, "Stats").
 *
 * An adventurer earns XP from kills and from depth:
 *
 * - **Kills** (`grantKillXp`): a monster a party member kills is worth `XP_PER_THREAT` × its
 *   threat. Every living member in the fight shares it: on the victim's floor and within
 *   `KILL_SHARE_RADIUS` tiles of the killer or the victim, so a healer standing back still earns.
 *   With n sharers each gets `ceil(base × (1 + KILL_GROUP_BONUS × (n − 1)) / n)`: a lone
 *   adventurer gets the whole amount, a group a little more in total.
 * - **Depth** (`grantDepthXp`): `XP_PER_DEPTH` × depth to every living member, the first time
 *   the party reaches a new deepest floor.
 *
 * Enough XP raises the level (`xpForLevel`, no cap). Each level-up rolls the class's `growth`
 * for every attribute from a seeded RNG of its own (`growthRng`: the run seed, the actor and the
 * level), and adds the result to the actor's stored `growth.gained`, so the gains never change
 * after a save and load and never shift another stream's draws.
 *
 * Every grant emits `xpGained` with the class id, the hook for the guild-wide class Mastery
 * (ETH-087), and the `track.xp` tracker sums it per actor and per class into
 * `RunResult.extras['track.xp']`, the fallen included.
 */
import { ATTRIBUTE_IDS, CLASSES, isAttributeId } from '../../content';
import type { AttributeId, GrowthRoll } from '../../content';
import { Rng, seedState } from '../../core';
import type { RunTracker } from '../domain';
import type { Emit } from '../events';
import type { Entity, EntityId, RunState } from '../state';
import { statValue } from './getStat';

/** XP a kill is worth per point of the victim's threat (a gloam rat is threat 1). */
export const XP_PER_THREAT = 1;

/** XP each living member earns per depth when the party first reaches a new deepest floor. */
export const XP_PER_DEPTH = 14;

/** XP to go from level L to L + 1 is `XP_STEP × L`. */
export const XP_STEP = 26;

/** Party members within this many tiles (Chebyshev) of the killer or the victim share a kill. */
export const KILL_SHARE_RADIUS = 6;

/** A shared kill is worth this much more per extra sharer, before it is split. */
export const KILL_GROUP_BONUS = 0.25;

/** Attribute points an actor's level-ups have added, per attribute. */
export type GrowthGains = Partial<Record<AttributeId, number>>;

/** An adventurer's level, total XP and rolled growth this run. Absent means level 1, 0 XP. */
export interface GrowthPart {
  level: number;
  /** Total XP earned, never spent. */
  xp: number;
  /** Points every level-up so far has rolled, summed per attribute. */
  gained: GrowthGains;
}

/** Why XP was earned: `source` is the victim's def for a kill, the floor id for depth. */
export type XpReason = 'kill' | 'depth';

/** The events leveling emits (part of `StatsEvent`). */
export type LevelingEvent =
  /**
   * `actor` earned `amount` XP (`xp` is its new total). `classId` lets a class Mastery tracker
   * (ETH-087) credit the class without looking the actor up.
   */
  | { type: 'xpGained'; actor: EntityId; classId: string; amount: number; xp: number; reason: XpReason; source: string }
  /** `actor` reached `level`, gaining `gains` attribute points (only the attributes that rose). */
  | {
      type: 'leveledUp';
      actor: EntityId;
      name: string;
      classId: string;
      level: number;
      gains: GrowthGains;
      floor: string;
      pos: { x: number; y: number };
    };

/** Total XP needed to reach `level`: 0 for level 1, then `XP_STEP × L(L − 1) / 2`. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (XP_STEP * l * (l - 1)) / 2;
}

/** The level `xp` total XP reaches. There is no cap. */
export function levelForXp(xp: number): number {
  if (!(xp > 0)) return 1;
  // Solve XP_STEP × L(L − 1) / 2 ≤ xp for the largest L, then correct any rounding.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / XP_STEP)) / 2));
  while (level > 1 && xpForLevel(level) > xp) level--;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** An entity's level: 1 without a growth part. */
export function levelOf(entity: Entity): number {
  return entity.growth?.level ?? 1;
}

/** Points the actor's level-ups have added to `attribute` (0 without a growth part). */
export function growthOf(entity: Entity, attribute: AttributeId): number {
  return entity.growth?.gained[attribute] ?? 0;
}

/**
 * The RNG for one actor's level-up roll: seeded from the run seed, the actor id and the level it
 * reaches, so the roll is the same whatever happened before and draws from no shared stream.
 */
export function growthRng(state: RunState, actor: EntityId, level: number): Rng {
  return new Rng(seedState(state.seed, `growth/${actor}/${level}`));
}

/** One roll of `roll`: a chance, then a whole number from `min` to `max`. */
function rollGrowth(rng: Rng, roll: GrowthRoll): number {
  // Always draw both, so one attribute's odds never shift the next attribute's roll.
  const hit = rng.chance(roll.chance ?? 1);
  const points = rng.int(roll.min, roll.max);
  return hit ? points : 0;
}

/**
 * The attribute points `classId` gains when `actor` reaches `level`: one roll per attribute in
 * `ATTRIBUTE_IDS` order (only those that rose). Pure: the same arguments give the same gains.
 */
export function rollLevelGains(state: RunState, actor: EntityId, classId: string, level: number): GrowthGains {
  const growth = CLASSES.get(classId).growth;
  const rng = growthRng(state, actor, level);
  const gains: GrowthGains = {};
  for (const attribute of ATTRIBUTE_IDS) {
    const roll = growth[attribute];
    if (roll === undefined) continue;
    const gain = rollGrowth(rng, roll);
    if (gain > 0) gains[attribute] = gain;
  }
  return gains;
}

/** Progress within the current level, for the party card's XP bar. */
export interface LevelView {
  level: number;
  /** Total XP. */
  xp: number;
  /** Total XP at which this level began. */
  levelXp: number;
  /** Total XP at which the next level begins. */
  nextXp: number;
}

/** The level view of `entity`. */
export function levelView(entity: Entity): LevelView {
  const level = levelOf(entity);
  return { level, xp: entity.growth?.xp ?? 0, levelXp: xpForLevel(level), nextXp: xpForLevel(level + 1) };
}

/**
 * Gives `amount` XP to `entity`, a living adventurer (anything else gets nothing), and levels it
 * up as far as the total reaches, rolling each level's growth. Each level raises current HP and
 * MP by as much as their maxima rose, and emits `leveledUp` after `xpGained`.
 */
export function grantXp(state: RunState, entity: Entity, amount: number, reason: XpReason, source: string, emit: Emit): void {
  const adventurer = entity.adventurer;
  if (adventurer === undefined || entity.actor === undefined || entity.actor.hp <= 0) return;
  const xpAmount = Math.floor(amount);
  if (xpAmount <= 0) return;
  const growth = entity.growth ?? (entity.growth = { level: 1, xp: 0, gained: {} });
  growth.xp += xpAmount;
  emit({ type: 'xpGained', actor: entity.id, classId: adventurer.classId, amount: xpAmount, xp: growth.xp, reason, source });
  const target = levelForXp(growth.xp);
  while (growth.level < target) {
    const actor = entity.actor;
    const hpBefore = statValue(state, entity, 'hp');
    const mpBefore = statValue(state, entity, 'mp');
    const level = growth.level + 1;
    const gains = rollLevelGains(state, entity.id, adventurer.classId, level);
    for (const attribute of ATTRIBUTE_IDS) {
      const gain = gains[attribute];
      if (gain !== undefined) growth.gained[attribute] = (growth.gained[attribute] ?? 0) + gain;
    }
    growth.level = level;
    const hpAfter = statValue(state, entity, 'hp');
    const mpAfter = statValue(state, entity, 'mp');
    actor.hp = Math.min(hpAfter, actor.hp + Math.max(0, hpAfter - hpBefore));
    actor.mp = Math.min(mpAfter, actor.mp + Math.max(0, mpAfter - mpBefore));
    emit({
      type: 'leveledUp',
      actor: entity.id,
      name: adventurer.name,
      classId: adventurer.classId,
      level,
      gains,
      floor: entity.floor,
      pos: { x: entity.pos.x, y: entity.pos.y },
    });
  }
}

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/**
 * The party members who share a kill, in party order: living, on the victim's floor, within
 * `KILL_SHARE_RADIUS` of the killer or the victim. Empty unless a party member struck the blow.
 */
export function killSharers(state: RunState, killer: Entity, victim: Entity): Entity[] {
  if (!state.party.includes(killer.id)) return [];
  const out: Entity[] = [];
  for (const id of state.party) {
    const member = state.entities[id];
    if (member?.actor === undefined || member.adventurer === undefined || member.actor.hp <= 0) continue;
    if (member.floor !== victim.floor) continue;
    const near =
      member.id === killer.id ||
      chebyshev(member.pos, victim.pos) <= KILL_SHARE_RADIUS ||
      (killer.floor === member.floor && chebyshev(member.pos, killer.pos) <= KILL_SHARE_RADIUS);
    if (near) out.push(member);
  }
  return out;
}

/** Each sharer's XP from a kill worth `base`: `ceil(base × (1 + KILL_GROUP_BONUS × (n − 1)) / n)`. */
export function killShare(base: number, sharers: number): number {
  if (sharers <= 0 || base <= 0) return 0;
  return Math.ceil((base * (1 + KILL_GROUP_BONUS * (sharers - 1))) / sharers);
}

/** Kill XP: `XP_PER_THREAT` × `threat`, shared by `killSharers`. Call it before the victim leaves the run. */
export function grantKillXp(state: RunState, killer: Entity, victim: Entity, threat: number, emit: Emit): void {
  const sharers = killSharers(state, killer, victim);
  const each = killShare(threat * XP_PER_THREAT, sharers.length);
  for (const member of sharers) grantXp(state, member, each, 'kill', victim.def, emit);
}

/** Depth XP: `XP_PER_DEPTH` × `depth` to every living party member, for reaching `floor` first. */
export function grantDepthXp(state: RunState, floor: string, depth: number, emit: Emit): void {
  for (const id of state.party) {
    const member = state.entities[id];
    if (member !== undefined) grantXp(state, member, depth * XP_PER_DEPTH, 'depth', floor, emit);
  }
}

/** Problems with a growth part, for the `stats.growth` invariant. */
export function growthProblems(entity: Entity): string[] {
  const growth = entity.growth;
  if (growth === undefined) return [];
  const problems: string[] = [];
  const id = entity.id;
  if (entity.adventurer === undefined) problems.push(`entity ${id} has a level but is no adventurer`);
  if (!Number.isInteger(growth.level) || growth.level < 1) problems.push(`entity ${id} has level ${String(growth.level)}`);
  if (!Number.isInteger(growth.xp) || growth.xp < 0) problems.push(`entity ${id} has ${String(growth.xp)} XP`);
  else if (growth.level !== levelForXp(growth.xp)) {
    problems.push(`entity ${id} is level ${String(growth.level)} with ${growth.xp} XP (expected ${levelForXp(growth.xp)})`);
  }
  if (typeof growth.gained !== 'object' || growth.gained === null) problems.push(`entity ${id} has no rolled growth`);
  else {
    for (const [attribute, value] of Object.entries(growth.gained)) {
      if (!isAttributeId(attribute)) problems.push(`entity ${id} has growth in unknown attribute "${attribute}"`);
      else if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) problems.push(`entity ${id} has ${attribute} growth ${String(value)}`);
    }
  }
  return problems;
}

/** One actor's XP this run, in `track.xp`. */
export interface XpRecord {
  classId: string;
  xp: number;
  level: number;
}

/** `track.xp` state: XP per party member and per class this run (fallen members included). */
export interface XpTrackerState {
  byActor: Record<EntityId, XpRecord>;
  byClass: Record<string, number>;
}

/**
 * `track.xp`: XP earned this run per party member and per class, from `xpGained` and
 * `leveledUp`. Its final state is `RunResult.extras['track.xp']`, what the roster (ETH-068) and
 * class Mastery (ETH-087) read. It earns no currency.
 */
export const XP_TRACKER: RunTracker<XpTrackerState> = {
  id: 'track.xp',
  init: () => ({ byActor: {}, byClass: {} }),
  reduce(s, e) {
    if (e.type === 'xpGained') {
      const was = s.byActor[e.actor];
      return {
        byActor: { ...s.byActor, [e.actor]: { classId: e.classId, xp: e.xp, level: was?.level ?? 1 } },
        byClass: { ...s.byClass, [e.classId]: (s.byClass[e.classId] ?? 0) + e.amount },
      };
    }
    if (e.type === 'leveledUp') {
      const was = s.byActor[e.actor];
      if (was === undefined) return s;
      return { ...s, byActor: { ...s.byActor, [e.actor]: { ...was, level: e.level } } };
    }
    return s;
  },
};
