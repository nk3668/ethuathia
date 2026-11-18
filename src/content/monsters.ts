/**
 * Monsters: the creatures that fight the party. In the sim each one is an actor entity whose
 * `def` is one of these ids (ETH-060, `src/sim/combat/`).
 *
 * A monster def is data only: its look, its base stats, the rules its AI follows (the same rule
 * engine as adventurers, naming conditions and rule actions by id), where in the dungeon it
 * appears and how often, and how dangerous it is. Every name and description here is original.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind, ContentRef } from './kind';
import { defShape, glyphSchema, idSchema, nonNegativeInt, positiveInt } from './schema';
import type { Glyph } from './schema';

/** A monster's numbers before any modifier: the base values of its stats (`src/sim/stats`). */
export interface MonsterStats {
  /** Maximum HP. */
  readonly hp: number;
  /** Added to every blow that lands (1 to 3 before it), before armor. */
  readonly damage: number;
  /** Added to the chance to hit. */
  readonly accuracy: number;
  /** Taken from attackers' chance to hit. */
  readonly evasion: number;
  /** Taken from the damage of each blow that lands (never below 1). */
  readonly armor: number;
  /** Energy gained per tick; 100 acts once a turn. */
  readonly speed: number;
  /** How far it sees, in tiles. Defaults to the stat's base. */
  readonly sight?: number;
}

/** One rule a monster's AI checks, as data: a condition id and a rule action id, with params. */
export interface MonsterRule {
  readonly condition: { readonly id: string; readonly params?: unknown };
  readonly action: { readonly id: string; readonly params?: unknown };
}

export interface MonsterDef extends Def {
  /** How it is drawn on the map and in the Codex. The map colors it from this. */
  readonly glyph: Glyph;
  readonly stats: MonsterStats;
  /** Checked top to bottom each turn; the first that applies is done. Waits if none does. */
  readonly rules: readonly MonsterRule[];
  /** The floors it appears on, by depth, both ends included. */
  readonly depth: { readonly min: number; readonly max: number };
  /** How often it is picked among the monsters of a depth, relative to the others. */
  readonly weight: number;
  /** How dangerous it is, for rewards (Trophies weigh kills by it) and reports. */
  readonly threat: number;
  /**
   * Small folk and swarming creatures that can crowd onto one tile. Two creatures may share a
   * tile only if both have this; anything else needs a tile of its own.
   */
  readonly sharesTile?: boolean;
}

export const MONSTERS = new Registry<MonsterDef>('monster');

const ruleSchema = z.strictObject({
  condition: z.strictObject({ id: idSchema('cond'), params: z.unknown().optional() }),
  action: z.strictObject({ id: idSchema('act'), params: z.unknown().optional() }),
});

export const MONSTER_KIND: ContentKind<MonsterDef> = {
  registry: MONSTERS,
  schema: z
    .strictObject({
      ...defShape('monster'),
      glyph: glyphSchema,
      stats: z.strictObject({
        hp: positiveInt,
        damage: nonNegativeInt,
        accuracy: nonNegativeInt,
        evasion: nonNegativeInt,
        armor: nonNegativeInt,
        speed: positiveInt,
        sight: positiveInt.optional(),
      }),
      rules: z.array(ruleSchema).min(1, 'needs at least one rule'),
      depth: z.strictObject({ min: positiveInt, max: positiveInt }),
      weight: positiveInt,
      threat: positiveInt,
      sharesTile: z.boolean().optional(),
    })
    .refine((def) => def.depth.min <= def.depth.max, { message: 'depth.min must not be above depth.max', path: ['depth'] }),
  refs: (def) =>
    def.rules.flatMap((rule, i): ContentRef[] => [
      { path: `rules[${i}].condition.id`, kind: 'rule condition', id: rule.condition.id },
      { path: `rules[${i}].action.id`, kind: 'rule action', id: rule.action.id },
    ]),
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineMonster(def: MonsterDef): MonsterDef {
  return MONSTERS.register(def);
}

// ---------------------------------------------------------------------------------------------
// Rule sets

/** Fight whatever is next to it, close in on any adventurer it can see, and roam otherwise. */
export const HUNTER_RULES: readonly MonsterRule[] = [
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.attack_adjacent' } },
  { condition: { id: 'cond.enemy_visible' }, action: { id: 'act.approach_enemy' } },
  { condition: { id: 'cond.always' }, action: { id: 'act.wander' } },
];

/** As `HUNTER_RULES`, but runs once badly hurt. */
export const SKITTISH_RULES: readonly MonsterRule[] = [
  { condition: { id: 'cond.hp_below', params: { percent: 40 } }, action: { id: 'act.flee' } },
  ...HUNTER_RULES,
];

// ---------------------------------------------------------------------------------------------
// The starter monsters

export const MONSTER_GLOAM_RAT = defineMonster({
  id: 'monster.gloam_rat',
  name: 'Gloam rat',
  description:
    'A lean grey rat that lives where the lamplight gives out. Alone it is a nuisance; it bolts as soon as it is hurt.',
  tags: ['beast'],
  glyph: { ch: 'r', color: '#b8a48c' },
  stats: { hp: 3, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 110 },
  rules: SKITTISH_RULES,
  depth: { min: 1, max: 4 },
  weight: 10,
  threat: 1,
});

export const MONSTER_MOSSLING = defineMonster({
  id: 'monster.mossling',
  name: 'Mossling',
  description:
    'A knee-high creature of the damp tunnels with a beard of living moss. Mosslings go about in crowds and ' +
    'think nothing of standing on each other’s feet, so several can share one spot.',
  tags: ['small_folk'],
  glyph: { ch: 'g', color: '#7fae5a' },
  stats: { hp: 4, damage: 0, accuracy: 0, evasion: 0, armor: 0, speed: 100 },
  rules: HUNTER_RULES,
  depth: { min: 1, max: 6 },
  weight: 8,
  threat: 1,
  sharesTile: true,
});

export const MONSTER_MIRE_TOAD = defineMonster({
  id: 'monster.mire_toad',
  name: 'Mire toad',
  description: 'A slow, warty toad the size of a dog, with skin thick enough to turn a careless blow.',
  tags: ['beast'],
  glyph: { ch: 't', color: '#8fa34a' },
  stats: { hp: 6, damage: 0, accuracy: 0, evasion: 0, armor: 1, speed: 80 },
  rules: HUNTER_RULES,
  depth: { min: 1, max: 5 },
  weight: 6,
  threat: 2,
});

export const MONSTER_ASHMITE_SWARM = defineMonster({
  id: 'monster.ashmite_swarm',
  name: 'Ashmite swarm',
  description:
    'A drifting cloud of biting mites the colour of old ash. Swarms flow together and through one another, ' +
    'so they can pile onto one spot.',
  tags: ['swarm'],
  glyph: { ch: 'w', color: '#c9b9a6' },
  stats: { hp: 3, damage: 0, accuracy: 0, evasion: 2, armor: 0, speed: 120 },
  rules: HUNTER_RULES,
  depth: { min: 2, max: 8 },
  weight: 6,
  threat: 2,
  sharesTile: true,
});

export const MONSTER_BONE_GNAWER = defineMonster({
  id: 'monster.bone_gnawer',
  name: 'Bone gnawer',
  description: 'A hunched scavenger with a jaw built for cracking marrow, and no patience for the living.',
  tags: ['beast'],
  glyph: { ch: 'G', color: '#d8cfb0' },
  stats: { hp: 8, damage: 0, accuracy: 0, evasion: 0, armor: 0, speed: 100 },
  rules: HUNTER_RULES,
  depth: { min: 3, max: 9 },
  weight: 6,
  threat: 3,
});

export const MONSTER_SLATE_HOUND = defineMonster({
  id: 'monster.slate_hound',
  name: 'Slate hound',
  description: 'A long-legged hound with a hide like split stone. It runs its prey down rather than wait for it.',
  tags: ['beast'],
  glyph: { ch: 'd', color: '#8a9bb0' },
  stats: { hp: 7, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 110 },
  rules: HUNTER_RULES,
  depth: { min: 4, max: 10 },
  weight: 5,
  threat: 4,
});

export const MONSTER_CAVERN_BRUTE = defineMonster({
  id: 'monster.cavern_brute',
  name: 'Cavern brute',
  description:
    'A heavy-shouldered hulk that lives in the deepest halls, slow to move and slow to fall, and its blows land like dropped stone.',
  tags: ['giant'],
  glyph: { ch: 'B', color: '#c7714f' },
  stats: { hp: 10, damage: 1, accuracy: 0, evasion: 0, armor: 0, speed: 80 },
  rules: HUNTER_RULES,
  depth: { min: 7, max: 99 },
  weight: 4,
  threat: 6,
});
