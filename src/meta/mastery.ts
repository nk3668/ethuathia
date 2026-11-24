/**
 * Class Mastery (ETH-087, CLAUDE.md §4): one guild-wide level per class, fed by every run. The
 * `mastery` slice (`slices/mastery.ts`) stores only each class's XP and run count; level and
 * talent points come from `MASTERY_CURVE` here, so retuning the curve never needs a migration.
 *
 * A run gives each class in its party:
 * - the XP its members earned (`track.xp`, the fallen included), each member scaled by a
 *   diminishing share (`MASTERY_SHARES`, highest earner first), and a temporary companion half
 *   (`MASTERY_COMPANION_SHARE`) outside that ordering;
 * - a run-end bonus, once per class: so much per floor of the deepest depth reached and per
 *   objective completed (contracts and bounties).
 *
 * Mastery isn't currency, so a wipe doesn't take 25% of it. Talent points (one per level) are
 * only banked until M4 (ETH-088) lets adventurers spend them. All helpers are pure.
 */
import { z } from 'zod';
import { objectiveRecords } from '../sim';
import type { RunResult } from '../sim';
import type { Profile } from './profile';
import type { ClassMastery, Mastery } from './slices/mastery';

/** XP the 1st, 2nd, 3rd and 4th highest earner of a class contribute (tunable); any further member gets the last. */
export const MASTERY_SHARES: readonly number[] = [1, 0.75, 0.5, 0.25];

/** The share a temporary companion contributes (tunable), outside the ordering above. */
export const MASTERY_COMPANION_SHARE = 0.5;

/** Run-end bonus XP per floor of the deepest depth reached, once per class in the party (tunable). */
export const MASTERY_BONUS_PER_DEPTH = 25;

/** Run-end bonus XP per completed objective (contract or bounty), once per class in the party (tunable). */
export const MASTERY_BONUS_PER_OBJECTIVE = 150;

/**
 * Going from level L to L + 1 costs `base × (1 + growth × L)` XP (tunable; ETH-161 retunes it).
 * Mastery starts at level 0 and has no end.
 */
export const MASTERY_CURVE: { readonly base: number; readonly growth: number } = { base: 156, growth: 0.1 };

/** Talent points banked at `level`: one per level until M4 adds spending. */
export function masteryPoints(level: number): number {
  return level;
}

/** XP to go from `level` to the next level. */
export function masteryStepCost(level: number): number {
  return Math.max(1, Math.round(MASTERY_CURVE.base * (1 + MASTERY_CURVE.growth * level)));
}

/** Total XP needed to reach `level` (level 0 needs none). */
export function masteryXpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += masteryStepCost(l);
  return total;
}

/** The level `xp` total XP reaches. There is no cap. */
export function masteryLevel(xp: number): number {
  const base = MASTERY_CURVE.base;
  const g = MASTERY_CURVE.growth;
  if (!(xp > 0)) return 0;
  // Solve base × (L + g × L(L − 1) / 2) ≤ xp for the largest L, then correct any rounding.
  let level = g === 0 ? Math.floor(xp / base) : Math.max(0, Math.floor((g - 2 + Math.sqrt((2 - g) ** 2 + (8 * g * xp) / base)) / (2 * g)));
  while (level > 0 && masteryXpForLevel(level) > xp) level--;
  while (masteryXpForLevel(level + 1) <= xp) level++;
  return level;
}

/** Where `xp` stands: the level, the XP into it and the XP still to go to the next. */
export interface MasteryProgress {
  readonly level: number;
  readonly into: number;
  readonly toNext: number;
}

export function masteryProgress(xp: number): MasteryProgress {
  const level = masteryLevel(xp);
  const into = Math.max(0, Math.floor(xp)) - masteryXpForLevel(level);
  return { level, into, toNext: masteryStepCost(level) - into };
}

/** A class's stored Mastery, or an empty one if it has none yet. */
export function classMastery(mastery: Mastery, classId: string): ClassMastery {
  return Object.hasOwn(mastery.classes, classId) ? (mastery.classes[classId] as ClassMastery) : { xp: 0, runs: 0 };
}

/** A class's Mastery in a profile: its XP and runs, level, progress and banked talent points. */
export interface MasteryView extends MasteryProgress {
  readonly classId: string;
  readonly xp: number;
  readonly runs: number;
  readonly points: number;
}

export function masteryOf(profile: Pick<Profile, 'mastery'>, classId: string): MasteryView {
  const { xp, runs } = classMastery(profile.mastery, classId);
  return { classId, xp, runs, points: masteryPoints(masteryLevel(xp)), ...masteryProgress(xp) };
}

/** One member's part of a class's gain. */
export interface MasteryMemberGain {
  readonly actor: number;
  readonly name: string;
  /** The XP they earned this run. */
  readonly xp: number;
  /** The share of it that counts: from `MASTERY_SHARES`, or the companion share. */
  readonly share: number;
  readonly companion: boolean;
  /** `floor(xp × share)`. */
  readonly gained: number;
}

/** The run-end bonus a class earns. */
export interface MasteryBonus {
  readonly depth: number;
  readonly objectives: number;
  readonly depthXp: number;
  readonly objectiveXp: number;
  readonly total: number;
}

/** What a run gives one class, with the levels before and after. */
export interface ClassMasteryGain {
  readonly classId: string;
  /** Members' shares plus the bonus. */
  readonly xp: number;
  readonly members: readonly MasteryMemberGain[];
  readonly bonus: MasteryBonus;
  readonly levelBefore: number;
  readonly levelAfter: number;
}

// What the gain reads from `RunResult.extras`. A missing or odd value leaves its part out: Mastery
// is for showing, and a bad tracker must not lose a run's banking.
const partyExtras = z.array(
  z.object({ actor: z.number(), name: z.string(), classId: z.string(), companion: z.literal(true).optional() }),
);
const xpExtras = z.object({ byActor: z.record(z.string(), z.object({ xp: z.number() })) });

/** Objectives that count toward the bonus: contracts and bounties (building quests are contracts). */
const COUNTED_OWNERS: readonly string[] = ['contract', 'bounty'];

/** A class's gain from `result` without levels: what `masteryGain` adds to the stored XP. */
export type MasteryShare = Omit<ClassMasteryGain, 'levelBefore' | 'levelAfter'>;

/** What each class in the run's party earns, in the order the classes first appear in the party. */
export function masteryShares(result: RunResult): MasteryShare[] {
  const party = partyExtras.safeParse(result.extras['run.party']);
  if (!party.success) return [];
  const xp = xpExtras.safeParse(result.extras['track.xp']);
  const earned = (actor: number) => (xp.success ? Math.max(0, xp.data.byActor[actor]?.xp ?? 0) : 0);
  const objectives = objectiveRecords(result.extras).filter((r) => r.status === 'complete' && COUNTED_OWNERS.includes(r.owner.kind)).length;
  const depth = Math.max(0, Math.floor(result.deepestDepth));
  const bonus: MasteryBonus = {
    depth,
    objectives,
    depthXp: Math.round(depth * MASTERY_BONUS_PER_DEPTH),
    objectiveXp: Math.round(objectives * MASTERY_BONUS_PER_OBJECTIVE),
    total: Math.round(depth * MASTERY_BONUS_PER_DEPTH) + Math.round(objectives * MASTERY_BONUS_PER_OBJECTIVE),
  };

  const classIds = [...new Set(party.data.map((m) => m.classId))];
  return classIds.map((classId) => {
    const ofClass = party.data.filter((m) => m.classId === classId);
    // Highest earner first; ties keep party order (the sort is stable).
    const ranked = ofClass.filter((m) => m.companion !== true).sort((a, b) => earned(b.actor) - earned(a.actor));
    const members: MasteryMemberGain[] = ofClass.map((m) => {
      const companion = m.companion === true;
      const share = companion
        ? MASTERY_COMPANION_SHARE
        : (MASTERY_SHARES[ranked.indexOf(m)] ?? (MASTERY_SHARES[MASTERY_SHARES.length - 1] as number));
      return { actor: m.actor, name: m.name, xp: earned(m.actor), share, companion, gained: Math.floor(earned(m.actor) * share) };
    });
    return { classId, xp: members.reduce((n, m) => n + m.gained, 0) + bonus.total, members, bonus };
  });
}

/**
 * What `result` gives each class in its party, with the class's level before and after, given the
 * Mastery as it stood before the run was banked.
 */
export function masteryGain(before: Pick<Profile, 'mastery'>, result: RunResult): ClassMasteryGain[] {
  return masteryShares(result).map((share) => {
    const xp = classMastery(before.mastery, share.classId).xp;
    return { ...share, levelBefore: masteryLevel(xp), levelAfter: masteryLevel(xp + share.xp) };
  });
}

/**
 * The same gain, read from a profile that has already banked `result` (the run summary opens
 * after banking): the "before" is the banked XP minus the gain. Only valid for the run just banked.
 */
export function masteryGainBanked(banked: Pick<Profile, 'mastery'>, result: RunResult): ClassMasteryGain[] {
  return masteryShares(result).map((share) => {
    const now = classMastery(banked.mastery, share.classId).xp;
    return { ...share, levelBefore: masteryLevel(Math.max(0, now - share.xp)), levelAfter: masteryLevel(now) };
  });
}
