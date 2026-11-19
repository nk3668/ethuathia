/**
 * Monsters: the creatures that fight the party. In the sim each one is an actor entity whose
 * `def` is one of these ids (ETH-060, `src/sim/combat/`).
 *
 * A monster def is data only: its look, its base stats, its **role** (ETH-040: how it fights,
 * which sets the rules its AI follows unless the def lists its own), the powers its role uses,
 * where in the dungeon it appears and how often, and how dangerous it is. Rules name conditions
 * and rule actions by id (the same rule engine as adventurers). Every name and description here
 * is original.
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

// ---------------------------------------------------------------------------------------------
// Roles (ETH-040)

/** How a monster fights. Each role has a rule set (`ROLE_RULES`) and Codex text (`ROLE_INFO`). */
export const MONSTER_ROLES = ['brute', 'skirmisher', 'caster', 'support', 'swarm'] as const;
export type MonsterRole = (typeof MONSTER_ROLES)[number];

/** A role's Codex and tooltip text. */
export interface RoleInfo {
  readonly name: string;
  /** The Codex group heading for monsters of this role. */
  readonly plural: string;
  /** How a monster of this role fights, in a sentence or two. */
  readonly description: string;
}

export const ROLE_INFO: Readonly<Record<MonsterRole, RoleInfo>> = {
  brute: {
    name: 'Brute',
    plural: 'Brutes',
    description: 'Walks straight at the nearest adventurer it sees and fights until one of them falls. Never runs.',
  },
  skirmisher: {
    name: 'Skirmisher',
    plural: 'Skirmishers',
    description:
      'Darts in, strikes, then steps back out of reach before closing in again, so it lands blows without standing ' +
      'still to take them. Runs when badly hurt.',
  },
  caster: {
    name: 'Caster',
    plural: 'Casters',
    description:
      'Attacks from a distance and keeps it: it closes only until an adventurer is in range, and backs away from ' +
      'anyone who reaches it. Cornered, it fights hand to hand.',
  },
  support: {
    name: 'Support',
    plural: 'Supports',
    description:
      'Hangs back behind its kin, mending their wounds and spurring them on in a fight. It only fights itself when ' +
      'cornered.',
  },
  swarm: {
    name: 'Swarm',
    plural: 'Swarms',
    description:
      'Spreads out to surround its prey, each one making for a free spot around it rather than queueing behind the ' +
      'others.',
  },
};

/** Close in on the nearest adventurer in sight and fight; roam otherwise. */
export const BRUTE_RULES: readonly MonsterRule[] = [
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.attack_adjacent' } },
  { condition: { id: 'cond.enemy_visible' }, action: { id: 'act.approach_enemy' } },
  { condition: { id: 'cond.always' }, action: { id: 'act.wander' } },
];

/** Hit, step back out of reach, close in again; run once badly hurt. */
export const SKIRMISHER_RULES: readonly MonsterRule[] = [
  { condition: { id: 'cond.hp_below', params: { percent: 40 } }, action: { id: 'act.flee' } },
  { condition: { id: 'cond.just_attacked' }, action: { id: 'act.fall_back' } },
  ...BRUTE_RULES,
];

/** Back away from anyone next to it, bolt whoever is in range, close in only to get in range. */
export const CASTER_RULES: readonly MonsterRule[] = [
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.fall_back' } },
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.attack_adjacent' } },
  { condition: { id: 'cond.enemy_visible' }, action: { id: 'act.cast_bolt' } },
  ...BRUTE_RULES.slice(1),
];

/** Mend hurt kin, spur on kin in a fight, keep out of reach, stay near its kin. */
export const SUPPORT_RULES: readonly MonsterRule[] = [
  { condition: { id: 'cond.ally_hurt', params: { percent: 75 } }, action: { id: 'act.mend_ally' } },
  { condition: { id: 'cond.enemy_visible' }, action: { id: 'act.bolster_ally' } },
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.fall_back' } },
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.attack_adjacent' } },
  { condition: { id: 'cond.enemy_visible' }, action: { id: 'act.hang_back' } },
  { condition: { id: 'cond.always' }, action: { id: 'act.wander' } },
];

/** Fight what is next to it, make for a free spot around the prey, else close in. */
export const SWARM_RULES: readonly MonsterRule[] = [
  { condition: { id: 'cond.enemy_adjacent' }, action: { id: 'act.attack_adjacent' } },
  { condition: { id: 'cond.enemy_visible' }, action: { id: 'act.surround' } },
  ...BRUTE_RULES.slice(1),
];

/** The rule set each role follows unless a def lists its own `rules`. */
export const ROLE_RULES: Readonly<Record<MonsterRole, readonly MonsterRule[]>> = {
  brute: BRUTE_RULES,
  skirmisher: SKIRMISHER_RULES,
  caster: CASTER_RULES,
  support: SUPPORT_RULES,
  swarm: SWARM_RULES,
};

// ---------------------------------------------------------------------------------------------
// Defs

/** A caster's ranged attack: same hit and damage rolls as a blow, at up to `range` tiles. */
export interface BoltPower {
  readonly range: number;
  /** What it throws, for the log: "a gob of bog-slime". */
  readonly name: string;
}

/** A support's healing: `amount` HP to one hurt ally within `range` tiles that it can see. */
export interface MendPower {
  readonly amount: number;
  readonly range: number;
}

/** A support's spur: `status` for `turns` on an ally within `range` that is next to an enemy. */
export interface BolsterPower {
  readonly status: string;
  readonly turns: number;
  readonly range: number;
}

export interface MonsterDef extends Def {
  /** How it is drawn on the map and in the Codex. The map colors it from this. */
  readonly glyph: Glyph;
  readonly stats: MonsterStats;
  /** How it fights (`ROLE_INFO`). Sets its rules unless `rules` is given. */
  readonly role: MonsterRole;
  /**
   * Checked top to bottom each turn; the first that applies is done. Waits if none does. Leave
   * out to follow the role's rules (`ROLE_RULES`); `monsterRules(def)` gives the ones in force.
   */
  readonly rules?: readonly MonsterRule[];
  /** Casters must have one: the ranged attack `act.cast_bolt` uses. */
  readonly bolt?: BoltPower;
  /** Healing `act.mend_ally` uses. A support has this or `bolster` or both. */
  readonly mend?: MendPower;
  /** The status `act.bolster_ally` hands out. */
  readonly bolster?: BolsterPower;
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

/** A monster's role powers: what it can do beyond a blow. */
export interface MonsterPowers {
  readonly bolt?: BoltPower;
  readonly mend?: MendPower;
  readonly bolster?: BolsterPower;
}

/**
 * A change to how a monster fights, layered over its def (ETH-117): a monster template sets a new
 * `role` and adds or replaces `powers`. Later ones in a list win.
 */
export interface RoleOverride {
  readonly role?: MonsterRole;
  readonly powers?: MonsterPowers;
}

/** The role a monster of `def` fights with: the last override that sets one, or the def's. */
export function monsterRole(def: MonsterDef, overrides: readonly RoleOverride[] = []): MonsterRole {
  let role = def.role;
  for (const o of overrides) if (o.role !== undefined) role = o.role;
  return role;
}

/**
 * The rules a monster of `def` follows: its own, or its role's. With `overrides` (its templates,
 * ETH-117) that change the role, the new role's rules.
 */
export function monsterRules(def: MonsterDef, overrides: readonly RoleOverride[] = []): readonly MonsterRule[] {
  const role = monsterRole(def, overrides);
  return role === def.role ? (def.rules ?? ROLE_RULES[role]) : ROLE_RULES[role];
}

/** The role powers of a monster of `def`: the def's, each replaced by the last override that has it. */
export function monsterPowers(def: MonsterDef, overrides: readonly RoleOverride[] = []): MonsterPowers {
  let { bolt, mend, bolster } = def;
  for (const o of overrides) {
    bolt = o.powers?.bolt ?? bolt;
    mend = o.powers?.mend ?? mend;
    bolster = o.powers?.bolster ?? bolster;
  }
  return { ...(bolt === undefined ? {} : { bolt }), ...(mend === undefined ? {} : { mend }), ...(bolster === undefined ? {} : { bolster }) };
}

export const MONSTERS = new Registry<MonsterDef>('monster');

const ruleSchema = z.strictObject({
  condition: z.strictObject({ id: idSchema('cond'), params: z.unknown().optional() }),
  action: z.strictObject({ id: idSchema('act'), params: z.unknown().optional() }),
});

/** The shapes of the role powers, shared with monster templates (ETH-117). */
export const boltSchema = z.strictObject({ range: z.number().int().min(2).max(12), name: z.string().min(1) });
export const mendSchema = z.strictObject({ amount: positiveInt, range: positiveInt });
export const bolsterSchema = z.strictObject({ status: idSchema('status'), turns: positiveInt, range: positiveInt });

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
      role: z.enum(MONSTER_ROLES),
      rules: z.array(ruleSchema).min(1, 'needs at least one rule').optional(),
      bolt: boltSchema.optional(),
      mend: mendSchema.optional(),
      bolster: bolsterSchema.optional(),
      depth: z.strictObject({ min: positiveInt, max: positiveInt }),
      weight: positiveInt,
      threat: positiveInt,
      sharesTile: z.boolean().optional(),
    })
    .refine((def) => def.depth.min <= def.depth.max, { message: 'depth.min must not be above depth.max', path: ['depth'] })
    .refine((def) => def.role !== 'caster' || def.bolt !== undefined, { message: 'a caster needs a bolt', path: ['bolt'] })
    .refine((def) => def.role !== 'support' || def.mend !== undefined || def.bolster !== undefined, {
      message: 'a support needs mend or bolster',
      path: ['mend'],
    }),
  refs: (def) => [
    ...monsterRules(def).flatMap((rule, i): ContentRef[] => [
      { path: `rules[${i}].condition.id`, kind: 'rule condition', id: rule.condition.id },
      { path: `rules[${i}].action.id`, kind: 'rule action', id: rule.action.id },
    ]),
    ...(def.bolster === undefined ? [] : [{ path: 'bolster.status', kind: 'status', id: def.bolster.status }]),
  ],
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineMonster(def: MonsterDef): MonsterDef {
  return MONSTERS.register(def);
}

// ---------------------------------------------------------------------------------------------
// The starter monsters

export const MONSTER_GLOAM_RAT = defineMonster({
  id: 'monster.gloam_rat',
  name: 'Gloam rat',
  description:
    'A lean grey rat that lives where the lamplight gives out. It nips and darts away again, and bolts for good as ' +
    'soon as it is badly hurt.',
  tags: ['beast'],
  glyph: { ch: 'r', color: '#b8a48c' },
  stats: { hp: 3, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 110 },
  role: 'skirmisher',
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
  role: 'swarm',
  depth: { min: 1, max: 6 },
  weight: 8,
  threat: 1,
  sharesTile: true,
});

export const MONSTER_MOSS_TENDER = defineMonster({
  id: 'monster.moss_tender',
  name: 'Moss tender',
  description:
    'An old mossling whose beard has grown down to its toes. It keeps to the back of a crowd of its kin, packing ' +
    'their cuts with moss and croaking them on.',
  tags: ['small_folk'],
  glyph: { ch: 'h', color: '#a8c76a' },
  stats: { hp: 4, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 100 },
  role: 'support',
  mend: { amount: 2, range: 4 },
  bolster: { status: 'status.emboldened', turns: 5, range: 4 },
  depth: { min: 2, max: 7 },
  weight: 4,
  threat: 2,
  sharesTile: true,
});

export const MONSTER_MIRE_TOAD = defineMonster({
  id: 'monster.mire_toad',
  name: 'Mire toad',
  description:
    'A slow, warty toad the size of a dog, with skin thick enough to turn a careless blow. It spits bog-slime from ' +
    'across a room and shuffles away from anyone who comes close.',
  tags: ['beast'],
  glyph: { ch: 't', color: '#8fa34a' },
  stats: { hp: 6, damage: 0, accuracy: 0, evasion: 0, armor: 1, speed: 80 },
  role: 'caster',
  bolt: { range: 4, name: 'gob of bog-slime' },
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
  role: 'swarm',
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
  role: 'brute',
  depth: { min: 3, max: 9 },
  weight: 6,
  threat: 3,
});

export const MONSTER_SLATE_HOUND = defineMonster({
  id: 'monster.slate_hound',
  name: 'Slate hound',
  description:
    'A long-legged hound with a hide like split stone. It runs its prey down, snaps, and wheels away before the ' +
    'answering blow.',
  tags: ['beast'],
  glyph: { ch: 'd', color: '#8a9bb0' },
  stats: { hp: 7, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 110 },
  role: 'skirmisher',
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
  role: 'brute',
  depth: { min: 7, max: 99 },
  weight: 4,
  threat: 6,
});
