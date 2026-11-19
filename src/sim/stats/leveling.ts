/**
 * XP, levels and class growth (ETH-034, docs/ARCHITECTURE.md Contracts, "Stats").
 *
 * An adventurer earns XP from kills (`XP_PER_THREAT` per point of the victim's threat, to the one
 * who struck the blow) and from depth (`XP_PER_DEPTH` × depth to every living member, the first
 * time the party reaches a new deepest floor). Enough XP raises the level (`xpForLevel`), and each
 * level adds the class's `growth` to the attributes, which the attribute formulas turn into stats.
 * Nothing here draws randomness, so leveling is the same for the same seed.
 *
 * Every grant emits `xpGained` with the class id, the hook for the guild-wide class Mastery
 * (ETH-087), and the `track.xp` tracker sums it per actor and per class into
 * `RunResult.extras['track.xp']`, the fallen included.
 */
import { ATTRIBUTE_IDS, CLASSES } from '../../content';
import type { AttributeId } from '../../content';
import type { RunTracker } from '../domain';
import type { Emit } from '../events';
import type { Entity, EntityId, RunState } from '../state';
import { statValue } from './getStat';

/** The highest level an adventurer can reach. XP still accrues past it (for Mastery). */
export const MAX_LEVEL = 20;

/** XP the killer earns per point of the victim's threat (a gloam rat is threat 1). */
export const XP_PER_THREAT = 4;

/** XP each living member earns per depth when the party first reaches a new deepest floor. */
export const XP_PER_DEPTH = 5;

/** XP to go from level L to L + 1 is `XP_STEP × L`. */
export const XP_STEP = 15;

/** An adventurer's level and total XP this run. Absent means level 1 with 0 XP. */
export interface GrowthPart {
  level: number;
  /** Total XP earned, never spent. */
  xp: number;
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
      gains: Partial<Record<AttributeId, number>>;
      floor: string;
      pos: { x: number; y: number };
    };

/** Total XP needed to reach `level`: 0 for level 1, then `XP_STEP × L(L − 1) / 2`. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (XP_STEP * l * (l - 1)) / 2;
}

/** The level `xp` total XP reaches, capped at `MAX_LEVEL`. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** An entity's level: 1 without a growth part. */
export function levelOf(entity: Entity): number {
  return entity.growth?.level ?? 1;
}

/** Points the class's growth has added to `attribute` by `level`. */
export function growthAt(classId: string, attribute: AttributeId, level: number): number {
  const rate = CLASSES.get(classId).growth[attribute] ?? 0;
  return Math.floor(rate * (Math.max(1, level) - 1) + 1e-9);
}

/** The attribute points a class gains going from level `from` to level `to` (only those that rise). */
export function levelGains(classId: string, from: number, to: number): Partial<Record<AttributeId, number>> {
  const gains: Partial<Record<AttributeId, number>> = {};
  for (const attribute of ATTRIBUTE_IDS) {
    const gain = growthAt(classId, attribute, to) - growthAt(classId, attribute, from);
    if (gain !== 0) gains[attribute] = gain;
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
  /** Total XP at which the next level begins; `null` at `MAX_LEVEL`. */
  nextXp: number | null;
}

/** The level view of `entity`. */
export function levelView(entity: Entity): LevelView {
  const level = levelOf(entity);
  return {
    level,
    xp: entity.growth?.xp ?? 0,
    levelXp: xpForLevel(level),
    nextXp: level >= MAX_LEVEL ? null : xpForLevel(level + 1),
  };
}

/**
 * Gives `amount` XP to `entity`, a living adventurer (anything else gets nothing), and levels it
 * up as far as the total reaches. Each level raises current HP and MP by as much as their maxima
 * rose, and emits `leveledUp` after `xpGained`.
 */
export function grantXp(state: RunState, entity: Entity, amount: number, reason: XpReason, source: string, emit: Emit): void {
  const adventurer = entity.adventurer;
  if (adventurer === undefined || entity.actor === undefined || entity.actor.hp <= 0) return;
  const xpAmount = Math.floor(amount);
  if (xpAmount <= 0) return;
  const growth = entity.growth ?? (entity.growth = { level: 1, xp: 0 });
  growth.xp += xpAmount;
  emit({ type: 'xpGained', actor: entity.id, classId: adventurer.classId, amount: xpAmount, xp: growth.xp, reason, source });
  const target = levelForXp(growth.xp);
  while (growth.level < target) {
    const actor = entity.actor;
    const hpBefore = statValue(state, entity, 'hp');
    const mpBefore = statValue(state, entity, 'mp');
    const gains = levelGains(adventurer.classId, growth.level, growth.level + 1);
    growth.level++;
    actor.hp = Math.min(statValue(state, entity, 'hp'), actor.hp + Math.max(0, statValue(state, entity, 'hp') - hpBefore));
    actor.mp = Math.min(statValue(state, entity, 'mp'), actor.mp + Math.max(0, statValue(state, entity, 'mp') - mpBefore));
    emit({
      type: 'leveledUp',
      actor: entity.id,
      name: adventurer.name,
      classId: adventurer.classId,
      level: growth.level,
      gains,
      floor: entity.floor,
      pos: { x: entity.pos.x, y: entity.pos.y },
    });
  }
}

/** Kill XP: `XP_PER_THREAT` × the victim's threat, to `killer` if it is an adventurer. */
export function grantKillXp(state: RunState, killer: Entity, victimDef: string, threat: number, emit: Emit): void {
  grantXp(state, killer, threat * XP_PER_THREAT, 'kill', victimDef, emit);
}

/** Depth XP: `XP_PER_DEPTH` × `depth` to every living party member, for reaching `floor` first. */
export function grantDepthXp(state: RunState, floor: string, depth: number, emit: Emit): void {
  for (const id of state.party) {
    const member = state.entities[id];
    if (member !== undefined) grantXp(state, member, depth * XP_PER_DEPTH, 'depth', floor, emit);
  }
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
