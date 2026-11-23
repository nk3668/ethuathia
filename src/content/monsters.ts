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
import { bundleRefs, bundleSchema } from './bundles';
import type { Bundle } from './bundles';
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

/** Open-ended Danger band over which a monster appears, peaking at `peak` (default `(min + max) / 2`). */
export interface DangerRange {
  readonly min: number;
  readonly peak?: number;
  readonly max: number;
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
  /** The Danger band it appears in, both ends included, with optional peak weight center. */
  readonly danger: DangerRange;
  /** Optional innate passives (stat modifiers and hit/turn triggers) credited to this species. */
  readonly bundle?: Bundle;
  /** How often it is picked among the monsters of a Danger rating, relative to the others. */
  readonly weight: number;
  /** How dangerous it is, for rewards (Trophies weigh kills by it) and reports. */
  readonly threat: number;
  /**
   * Small folk and swarming creatures that can crowd onto one tile. Two creatures may share a
   * tile only if both have this; anything else needs a tile of its own.
   */
  readonly sharesTile?: boolean;
  /**
   * True for a def that only ever appears by hand (a unique, a summon, a test fixture), so the
   * content reachability check (ETH-143) does not expect it to spawn in a dungeon.
   */
  readonly handPlaced?: boolean;
  /**
   * Kill counts at which the Codex reveals this monster's basics, full stats and lore (ETH-144).
   * Strictly increasing. Absent means `MONSTER_KILL_TIERS`. Set it on monsters that can't
   * realistically reach 50 kills: uniques and bosses, very rare spawns, out-of-depth monsters.
   */
  readonly codexTiers?: MonsterKillTiers;
}

/** Kill counts that unlock each Codex tier of a monster. */
export interface MonsterKillTiers {
  readonly basics: number;
  readonly stats: number;
  readonly lore: number;
}

/** The default Codex kill tiers (ETH-091): basics at 1 kill, full stats at 10, lore and drops at 50. */
export const MONSTER_KILL_TIERS: MonsterKillTiers = { basics: 1, stats: 10, lore: 50 };

/** The Codex kill tiers for a monster: its own `codexTiers`, or the defaults. The one reader of them. */
export function killTiersFor(def: MonsterDef): MonsterKillTiers {
  return def.codexTiers ?? MONSTER_KILL_TIERS;
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

const dangerNumber = z.number().refine(Number.isFinite, 'must be a finite number').positive('must be above 0');

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
      danger: z.strictObject({ min: dangerNumber, peak: dangerNumber.optional(), max: dangerNumber }),
      bundle: bundleSchema.optional(),
      weight: positiveInt,
      threat: positiveInt,
      sharesTile: z.boolean().optional(),
      handPlaced: z.boolean().optional(),
      codexTiers: z.strictObject({ basics: positiveInt, stats: positiveInt, lore: positiveInt }).optional(),
    })
    .refine((def) => def.codexTiers === undefined || (def.codexTiers.basics < def.codexTiers.stats && def.codexTiers.stats < def.codexTiers.lore), {
      message: 'codexTiers must be strictly increasing (basics < stats < lore)',
      path: ['codexTiers'],
    })
    .refine((def) => def.danger.min <= def.danger.max, { message: 'danger.min must not be above danger.max', path: ['danger'] })
    .refine((def) => def.danger.peak === undefined || (def.danger.peak >= def.danger.min && def.danger.peak <= def.danger.max), {
      message: 'danger.peak must lie between danger.min and danger.max',
      path: ['danger', 'peak'],
    })
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
    ...(def.bundle === undefined ? [] : bundleRefs('bundle', def.bundle)),
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
  hint: 'Scratching claws at the edge of the lantern’s circle, quick to bite and quicker to bolt.',
  tags: ['beast'],
  glyph: { ch: 'r', color: '#b8a48c' },
  stats: { hp: 3, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 110 },
  role: 'skirmisher',
  danger: { min: 1, peak: 2, max: 4 },
  weight: 10,
  threat: 1,
});

export const MONSTER_MOSSLING = defineMonster({
  id: 'monster.mossling',
  name: 'Mossling',
  description:
    'A knee-high creature of the damp tunnels with a beard of living moss. Mosslings go about in crowds and ' +
    'think nothing of standing on each other’s feet, so several can share one spot.',
  hint: 'Damp, knee-high folk of the upper tunnels that crowd three deep on a single stone.',
  tags: ['small_folk'],
  glyph: { ch: 'g', color: '#7fae5a' },
  stats: { hp: 4, damage: 0, accuracy: 0, evasion: 0, armor: 0, speed: 100 },
  role: 'swarm',
  danger: { min: 1, peak: 2, max: 5 },
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
  hint: 'A hoarse croak from behind the mob, binding its kin’s wounds with wet green moss.',
  tags: ['small_folk'],
  glyph: { ch: 'h', color: '#a8c76a' },
  stats: { hp: 6, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 100 },
  role: 'support',
  mend: { amount: 3, range: 4 },
  bolster: { status: 'status.emboldened', turns: 5, range: 4 },
  danger: { min: 2, peak: 3, max: 7 },
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
  hint: 'A wet croak across the chamber before a gob of bog-slime splatters against a shield.',
  tags: ['beast'],
  glyph: { ch: 't', color: '#8fa34a' },
  stats: { hp: 6, damage: 0, accuracy: 0, evasion: 0, armor: 1, speed: 80 },
  role: 'caster',
  bolt: { range: 4, name: 'gob of bog-slime' },
  danger: { min: 1, peak: 2, max: 5 },
  weight: 6,
  threat: 2,
});

export const MONSTER_PIT_BADGER = defineMonster({
  id: 'monster.pit_badger',
  name: 'Pit badger',
  description:
    'A broad-clawed burrower with dusty slate fur and a stubborn, territorial snarl. Once cornered in the upper ' +
    'workings, it stands its ground and trades blows until one side drops.',
  hint: 'Broad claws scraping loose shale in the shallow workings, refusing to yield a step.',
  tags: ['beast'],
  glyph: { ch: 'b', color: '#c48f65' },
  stats: { hp: 6, damage: 1, accuracy: 0, evasion: 0, armor: 0, speed: 95 },
  role: 'brute',
  danger: { min: 1, peak: 2, max: 4 },
  weight: 7,
  threat: 2,
});

export const MONSTER_SPORE_PUFF = defineMonster({
  id: 'monster.spore_puff',
  name: 'Spore puff',
  description:
    'A drifting cluster of pale, fist-sized toadstools that scoot along damp flagstones on fibrous threads. They ' +
    'crowd together in drifts and bump clumsily against warm ankles.',
  hint: 'Soft pale caps bobbing in damp corners, drifting together like spilled flour.',
  tags: ['fungus', 'swarm'],
  glyph: { ch: 'f', color: '#b4c474' },
  stats: { hp: 3, damage: 0, accuracy: 0, evasion: 1, armor: 0, speed: 95 },
  role: 'swarm',
  danger: { min: 1, peak: 2, max: 4 },
  weight: 6,
  threat: 1,
  sharesTile: true,
});

export const MONSTER_ASHMITE_SWARM = defineMonster({
  id: 'monster.ashmite_swarm',
  name: 'Ashmite swarm',
  description:
    'A drifting cloud of biting mites the colour of old ash. Swarms flow together and through one another, ' +
    'so they can pile onto one spot.',
  hint: 'A grey, humming haze of tiny mandibles drifting like disturbed hearth-ash.',
  tags: ['swarm'],
  glyph: { ch: 'w', color: '#c9b9a6' },
  stats: { hp: 5, damage: 0, accuracy: 1, evasion: 2, armor: 0, speed: 120 },
  role: 'swarm',
  danger: { min: 2, peak: 4, max: 7 },
  weight: 6,
  threat: 2,
  sharesTile: true,
});

export const MONSTER_BONE_GNAWER = defineMonster({
  id: 'monster.bone_gnawer',
  name: 'Bone gnawer',
  description: 'A hunched scavenger with a jaw built for cracking marrow, and no patience for the living.',
  hint: 'The dry crack of split marrow echoing from a darkened corner.',
  tags: ['beast'],
  glyph: { ch: 'G', color: '#d8cfb0' },
  stats: { hp: 10, damage: 2, accuracy: 1, evasion: 0, armor: 1, speed: 100 },
  role: 'brute',
  danger: { min: 3, peak: 4, max: 8 },
  weight: 6,
  threat: 3,
});

export const MONSTER_LANTERN_CAP = defineMonster({
  id: 'monster.lantern_cap',
  name: 'Lantern cap',
  description:
    'A tall, waxy shelf-fungus whose crown stores a harsh yellow flare. It keeps across the gallery, lobbing ' +
    'blinding spore-flashes that leave spots dancing in an explorer’s eyes.',
  hint: 'A pale yellow glow from a damp pillar before a stinging flare bursts in your eyes.',
  tags: ['fungus'],
  glyph: { ch: 'F', color: '#e6c85c' },
  stats: { hp: 8, damage: 1, accuracy: 1, evasion: 0, armor: 0, speed: 90 },
  role: 'caster',
  bolt: { range: 4, name: 'glimmering spore-flash' },
  bundle: { triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.dazzled', turns: 3, to: 'other' }] }] },
  danger: { min: 3, peak: 4, max: 8 },
  weight: 5,
  threat: 4,
});

export const MONSTER_SLATE_HOUND = defineMonster({
  id: 'monster.slate_hound',
  name: 'Slate hound',
  description:
    'A long-legged hound with a hide like split stone. It runs its prey down, snaps, and wheels away before the ' +
    'answering blow.',
  hint: 'Stone-grey flanks loping through the mid-levels, snapping once and wheeling out of reach.',
  tags: ['beast'],
  glyph: { ch: 'd', color: '#8a9bb0' },
  stats: { hp: 9, damage: 2, accuracy: 1, evasion: 2, armor: 0, speed: 110 },
  role: 'skirmisher',
  danger: { min: 4, peak: 5, max: 9 },
  weight: 5,
  threat: 4,
});

export const MONSTER_CRYPT_SENTINEL = defineMonster({
  id: 'monster.crypt_sentinel',
  name: 'Crypt sentinel',
  description:
    'A dry-jointed watchman from forgotten mine shrines, its ribs bound in rusted iron strapping. Unfeeling and ' +
    'patient, it shrugs off venoms and foul vapors that would drop living flesh.',
  hint: 'Rusted iron strapping creaking over dry bone, marching steadily through the galleries.',
  tags: ['undead'],
  glyph: { ch: 'U', color: '#a8b6c2' },
  stats: { hp: 13, damage: 2, accuracy: 1, evasion: 0, armor: 2, speed: 85 },
  role: 'brute',
  bundle: { modifiers: [{ stat: 'statusResist', op: 'add', value: 30 }] },
  danger: { min: 3, peak: 5, max: 9 },
  weight: 5,
  threat: 4,
});

export const MONSTER_CLINKER_AUTOMATON = defineMonster({
  id: 'monster.clinker_automaton',
  name: 'Clinker automaton',
  description:
    'A squat mining rig hammered together from boiler plate and slag-bound gears, still following some old ' +
    'watch-order. Heavy armor turns hasty edges while its iron-shod piston arm strikes like a hammer.',
  hint: 'The rhythmic hiss and clank of riveted boiler plate rounding a deep gallery bend.',
  tags: ['construct'],
  glyph: { ch: 'C', color: '#b59461' },
  stats: { hp: 20, damage: 4, accuracy: 2, evasion: 0, armor: 3, speed: 80 },
  role: 'brute',
  bundle: { modifiers: [{ stat: 'statusResist', op: 'add', value: 50 }] },
  danger: { min: 6, peak: 7, max: 11 },
  weight: 5,
  threat: 7,
});

export const MONSTER_FETID_STALKER = defineMonster({
  id: 'monster.fetid_stalker',
  name: 'Fetid stalker',
  description:
    'A sinewy, six-limbed cave hunter with pale weeping glands behind its fangs. It bounds through the deep ' +
    'workings, raking with poison-slick claws and springing back into shadow.',
  hint: 'Six silent pads slipping over wet stone, leaving dark drops of venom on the trail.',
  tags: ['beast'],
  glyph: { ch: 'S', color: '#7ea859' },
  stats: { hp: 15, damage: 3, accuracy: 2, evasion: 3, armor: 1, speed: 120 },
  role: 'skirmisher',
  bundle: { triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.poisoned', turns: 3, to: 'other' }] }] },
  danger: { min: 6, peak: 7, max: 12 },
  weight: 5,
  threat: 6,
});

export const MONSTER_TARN_SPITTER = defineMonster({
  id: 'monster.tarn_spitter',
  name: 'Tarn spitter',
  description:
    'A bloated, blind amphibian bred in stagnant sump-pools deep below the shafts. From across a chamber it hurls ' +
    'clots of rancid tarn-bile that turn an adventurer’s stomach and slow their stride.',
  hint: 'A hollow splash from a black sump-pool before sour bile arcs through the dark.',
  tags: ['beast'],
  glyph: { ch: 'T', color: '#9ab84b' },
  stats: { hp: 14, damage: 3, accuracy: 2, evasion: 1, armor: 1, speed: 95 },
  role: 'caster',
  bolt: { range: 5, name: 'clot of tarn-bile' },
  bundle: { triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.queasy', turns: 4, to: 'other' }] }] },
  danger: { min: 6, peak: 8, max: 12 },
  weight: 5,
  threat: 6,
});

export const MONSTER_GLOOMCHANTER = defineMonster({
  id: 'monster.gloomchanter',
  name: 'Gloomchanter',
  description:
    'A cowl-headed subterranean singer wrapped in damp mineral-stained rags. Keeping behind bigger brutes, it knits ' +
    'their torn flesh with deep-mine moss-salves and drums them into a fury.',
  hint: 'A low, resonant hum echoing behind a warband, steadying wounded brutes.',
  tags: ['small_folk'],
  glyph: { ch: 'H', color: '#c298d9' },
  stats: { hp: 14, damage: 2, accuracy: 1, evasion: 2, armor: 1, speed: 100 },
  role: 'support',
  mend: { amount: 5, range: 4 },
  bolster: { status: 'status.emboldened', turns: 6, range: 4 },
  danger: { min: 6, peak: 8, max: 12 },
  weight: 4,
  threat: 6,
  sharesTile: true,
});

export const MONSTER_CAVERN_BRUTE = defineMonster({
  id: 'monster.cavern_brute',
  name: 'Cavern brute',
  description:
    'A heavy-shouldered hulk that lives in the deepest halls, slow to move and slow to fall, and its blows land like dropped stone.',
  hint: 'Slow, deliberate footsteps in the deep halls that shake dust from the vaulting.',
  tags: ['giant'],
  glyph: { ch: 'B', color: '#c7714f' },
  stats: { hp: 24, damage: 4, accuracy: 2, evasion: 0, armor: 2, speed: 85 },
  role: 'brute',
  danger: { min: 7, peak: 9, max: 99 },
  weight: 4,
  threat: 6,
});

export const MONSTER_SABLEWING_SWARM = defineMonster({
  id: 'monster.sablewing_swarm',
  name: 'Sablewing swarm',
  description:
    'A churning cloud of razor-beaked cave midges whose bites carry a slow-burning sting. They pour around ' +
    'frontline shields to surround any exposed flank.',
  hint: 'A dark, whistling ribbon of needle-beaks threading the deepest vaults.',
  tags: ['swarm'],
  glyph: { ch: 'w', color: '#d67c6b' },
  stats: { hp: 14, damage: 3, accuracy: 3, evasion: 4, armor: 0, speed: 120 },
  role: 'swarm',
  bundle: { triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.poisoned', turns: 4, to: 'other' }] }] },
  danger: { min: 7, peak: 10, max: 15 },
  weight: 4,
  threat: 7,
  sharesTile: true,
});

export const MONSTER_BASALT_GIANT = defineMonster({
  id: 'monster.basalt_giant',
  name: 'Basalt giant',
  description:
    'A towering slab-muscled colossus of living grey rock veined with warm mineral sap. Slow to turn but terrible ' +
    'to trade blows with, its cracked hide knits itself closed breath by breath.',
  hint: 'Grinding stone joints and the smell of wet slate, mending cracks as fast as steel opens them.',
  tags: ['giant'],
  glyph: { ch: 'J', color: '#9c7863' },
  stats: { hp: 30, damage: 5, accuracy: 3, evasion: 0, armor: 3, speed: 85 },
  role: 'brute',
  bundle: { triggers: [{ on: 'trigger.turn_start', effects: [{ kind: 'heal', amount: 1 }] }] },
  danger: { min: 8, peak: 10, max: 16 },
  weight: 4,
  threat: 10,
});

export const MONSTER_GRAVE_CANTOR = defineMonster({
  id: 'monster.grave_cantor',
  name: 'Grave cantor',
  description:
    'A tall, shrouded cantor from the deepest ossuary cuts whose silent bell-notes knit shattered bone and whip ' +
    'nearby horrors into unnatural speed.',
  hint: 'A cold, voiceless bell-toll behind the abyssal ranks that quickens every dead hand.',
  tags: ['undead'],
  glyph: { ch: 'V', color: '#d4a3d9' },
  stats: { hp: 21, damage: 3, accuracy: 2, evasion: 2, armor: 2, speed: 100 },
  role: 'support',
  mend: { amount: 8, range: 4 },
  bolster: { status: 'status.hasted', turns: 4, range: 4 },
  bundle: { modifiers: [{ stat: 'statusResist', op: 'add', value: 40 }] },
  danger: { min: 8, peak: 10, max: 16 },
  weight: 3,
  threat: 9,
});

export const MONSTER_SHROUDWEAVER = defineMonster({
  id: 'monster.shroudweaver',
  name: 'Shroudweaver',
  description:
    'A tattered, floating remnant wrapped in luminous burial-mist. It drifts back from steel while hurling jagged ' +
    'bolts of grave-chill that sear the eyes and leave torches guttering.',
  hint: 'Pale silver threads hanging in the deepest dark, lancing chill across the chamber.',
  tags: ['undead'],
  glyph: { ch: 'W', color: '#8f9de0' },
  stats: { hp: 22, damage: 4, accuracy: 3, evasion: 2, armor: 1, speed: 100 },
  role: 'caster',
  bolt: { range: 5, name: 'lance of grave-chill' },
  bundle: {
    modifiers: [{ stat: 'statusResist', op: 'add', value: 40 }],
    triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.dazzled', turns: 4, to: 'other' }] }],
  },
  danger: { min: 10, peak: 11, max: 18 },
  weight: 4,
  threat: 10,
});
