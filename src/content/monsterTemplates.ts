/**
 * Monster templates (ETH-117): named changes layered on any monster when it spawns, so "a stronger
 * or stranger version of this monster" needs no new `MonsterDef`. *Venomous*, *Swift*: each is a
 * name prefix, stat changes, a bundle (traits: triggers, extra modifiers), optionally a new role
 * and powers, and how much more dangerous and better-rewarded it makes the monster.
 *
 * In the sim a monster carries the ids of its templates in its overlay (`MonsterOverlay`,
 * `src/sim/combat/overlay.ts`). Stat changes go through the `combat.overlay` stat provider and the
 * bundle through the `combat.templates` bundle source, each credited to the template, so tooltips
 * say why. Every name and description here is original.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import { bundleRefs, bundleSchema } from './bundles';
import type { Bundle } from './bundles';
import type { ContentKind, ContentRef } from './kind';
import { bolsterSchema, boltSchema, MONSTER_ROLES, MONSTERS, mendSchema } from './monsters';
import type { MonsterDef, MonsterPowers, MonsterRole, RoleOverride } from './monsters';
import { defShape, nonNegativeInt, positiveInt } from './schema';

/** At most this many templates on one monster (default approved by Nate). */
export const MAX_TEMPLATES = 2;

/** The highest loot tier: 0 is the plain table, higher tiers roll better loot (ETH-052). */
export const MAX_LOOT_TIER = 3;

/** Stat changes by stat id (`hp`, `speed`, …): `add` adds to the base, `mul` multiplies the stat. */
export interface StatChanges {
  readonly add?: Readonly<Record<string, number>>;
  readonly mul?: Readonly<Record<string, number>>;
}

export interface MonsterTemplateDef extends Def, RoleOverride {
  /** Put before the monster's name: "Venomous" makes "Venomous gloam rat". */
  readonly prefix?: string;
  /** Put after the name ("of the Deep"). Content uses prefixes only (the approved default). */
  readonly suffix?: string;
  /** Changes to the monster's base stats, credited to this template in tooltips. */
  readonly stats?: StatChanges;
  /** Traits: modifiers and triggers active on the monster while it lives. */
  readonly bundle?: Bundle;
  /** A new way to fight (`ROLE_RULES`). A caster needs a bolt, a support mend or bolster, in `powers`. */
  readonly role?: MonsterRole;
  /** Powers added or replaced (`bolt`, `mend`, `bolster`). */
  readonly powers?: MonsterPowers;
  /** Multiplies the monster's threat, which weighs Trophies and kill XP. */
  readonly threatMul: number;
  /** The loot tier it raises the monster to (0 = the plain table). The highest of a monster's tiers counts. */
  readonly lootTier: number;
  /** How often generation picks it among the templates that fit a monster, relative to the others. */
  readonly weight: number;
  /** Map color for a monster carrying it, lowercase `#rrggbb`. The last template with one wins. */
  readonly glyphTint?: string;
  /** Monster tags it fits (`beast`, `swarm`, …); left out, it fits any monster. */
  readonly families?: readonly string[];
}

export const MONSTER_TEMPLATES = new Registry<MonsterTemplateDef>('template');

const statChangesSchema = z.strictObject({
  add: z.record(z.string(), z.number().refine(Number.isFinite, 'must be a finite number')).optional(),
  mul: z.record(z.string(), z.number().positive('must be above 0').refine(Number.isFinite, 'must be a finite number')).optional(),
});

const nameSchema = z.string().trim().min(1, 'must not be empty');

export const MONSTER_TEMPLATE_KIND: ContentKind<MonsterTemplateDef> = {
  registry: MONSTER_TEMPLATES,
  schema: z
    .strictObject({
      ...defShape('template'),
      prefix: nameSchema.optional(),
      suffix: nameSchema.optional(),
      stats: statChangesSchema.optional(),
      bundle: bundleSchema.optional(),
      role: z.enum(MONSTER_ROLES).optional(),
      powers: z.strictObject({ bolt: boltSchema.optional(), mend: mendSchema.optional(), bolster: bolsterSchema.optional() }).optional(),
      threatMul: z.number().positive('must be above 0').max(20),
      lootTier: nonNegativeInt.max(MAX_LOOT_TIER),
      weight: positiveInt,
      glyphTint: z.string().regex(/^#[0-9a-f]{6}$/, 'must be a lowercase #rrggbb color').optional(),
      families: z.array(z.string().min(1)).min(1, 'leave it out to fit every monster').optional(),
    })
    .refine((def) => def.prefix !== undefined || def.suffix !== undefined, { message: 'needs a prefix or a suffix', path: ['prefix'] })
    .refine((def) => def.role !== 'caster' || def.powers?.bolt !== undefined, { message: 'a caster template needs powers.bolt', path: ['powers'] })
    .refine((def) => def.role !== 'support' || def.powers?.mend !== undefined || def.powers?.bolster !== undefined, {
      message: 'a support template needs powers.mend or powers.bolster',
      path: ['powers'],
    }),
  refs: (def) => [
    ...Object.keys(def.stats?.add ?? {}).map((id): ContentRef => ({ path: `stats.add.${id}`, kind: 'stat', id })),
    ...Object.keys(def.stats?.mul ?? {}).map((id): ContentRef => ({ path: `stats.mul.${id}`, kind: 'stat', id })),
    ...(def.bundle === undefined ? [] : bundleRefs('bundle', def.bundle)),
    ...(def.powers?.bolster === undefined ? [] : [{ path: 'powers.bolster.status', kind: 'status', id: def.powers.bolster.status }]),
  ],
};

/** Registers a def of this kind and returns it. Its shape is checked by `validateContent`. */
export function defineMonsterTemplate(def: MonsterTemplateDef): MonsterTemplateDef {
  return MONSTER_TEMPLATES.register(def);
}

/** True if `template` may be put on a monster of `def`: it lists none of the def's families, or one of them. */
export function templateFits(template: MonsterTemplateDef, def: MonsterDef): boolean {
  return template.families === undefined || template.families.some((f) => def.tags.includes(f));
}

/** The templates with these ids, in order. Throws on an unknown id. */
export function templateDefs(ids: readonly string[] | undefined): MonsterTemplateDef[] {
  return (ids ?? []).map((id) => MONSTER_TEMPLATES.get(id));
}

/** What a monster's name is built from: its templates, and an own name and title if it has them. */
export interface MonsterNaming {
  readonly templates?: readonly string[];
  /** A proper name ("Vell"): the monster is then called by it, not by its kind. */
  readonly name?: string;
  /** Put after the name ("the Unbowed"), or after the kind when there is no name. */
  readonly title?: string;
}

/**
 * A monster's display name (ETH-117): "Gloam rat", "Venomous gloam rat", "Swift venomous gloam
 * rat", "Vell the Unbowed", "Gloam rat the Unbowed". With an own `name`, the templates' prefixes
 * are left out (it is someone, not something). Unknown template ids are skipped.
 */
export function monsterDisplayName(def: MonsterDef, naming: MonsterNaming = {}): string {
  const title = naming.title === undefined ? '' : ` ${naming.title}`;
  if (naming.name !== undefined) return `${naming.name}${title}`;
  const templates = (naming.templates ?? []).filter((id) => MONSTER_TEMPLATES.has(id)).map((id) => MONSTER_TEMPLATES.get(id));
  if (templates.length === 0) return `${def.name}${title}`;
  const prefixes = templates.flatMap((t) => (t.prefix === undefined ? [] : [t.prefix.toLowerCase()]));
  const suffixes = templates.flatMap((t) => (t.suffix === undefined ? [] : [t.suffix]));
  const text = [...prefixes, def.name.toLowerCase(), ...suffixes].join(' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${title}`;
}

/** True when `naming` gives the monster a proper name, so text uses no article ("Vell", not "the Vell"). */
export function isProperName(naming: MonsterNaming): boolean {
  return naming.name !== undefined;
}

/** A monster def's display name by id, with the naming; the id itself for an unknown def. */
export function monsterDisplayNameOf(defId: string, naming: MonsterNaming = {}): string {
  return MONSTERS.has(defId) ? monsterDisplayName(MONSTERS.get(defId), naming) : defId;
}

// ---------------------------------------------------------------------------------------------
// The first templates

export const TEMPLATE_VENOMOUS = defineMonsterTemplate({
  id: 'template.venomous',
  name: 'Venomous',
  description:
    'Its bite or sting carries a venom that keeps working after the blow: every hit that lands poisons the ' +
    'one it struck for a few turns.',
  hint: 'Green-flecked fangs that leave a lingering burn in the wound.',
  tags: ['trait'],
  prefix: 'Venomous',
  bundle: { triggers: [{ on: 'trigger.hit', effects: [{ kind: 'applyStatus', status: 'status.poisoned', turns: 4, to: 'other' }] }] },
  threatMul: 1.5,
  lootTier: 1,
  weight: 4,
  glyphTint: '#a6e22e',
  families: ['beast', 'swarm'],
});

export const TEMPLATE_SWIFT = defineMonsterTemplate({
  id: 'template.swift',
  name: 'Swift',
  description: 'Lean and quick on its feet: it moves and strikes a third again as often as others of its kind.',
  hint: 'A creature leaner and quicker on the turn than the rest of its litter.',
  tags: ['trait'],
  prefix: 'Swift',
  stats: { mul: { speed: 1.3 } },
  threatMul: 1.5,
  lootTier: 1,
  weight: 4,
  glyphTint: '#7fd1ff',
});

export const TEMPLATE_HULKING = defineMonsterTemplate({
  id: 'template.hulking',
  name: 'Hulking',
  description: 'Half again the size of its kin, with the hide and the heft to match: more HP and heavier blows.',
  hint: 'Broad-backed and scarred, towering a head above its fellows.',
  tags: ['trait'],
  prefix: 'Hulking',
  stats: { mul: { hp: 1.5 }, add: { damage: 1 } },
  threatMul: 2,
  lootTier: 1,
  weight: 3,
  glyphTint: '#e0915a',
});

export const TEMPLATE_HEXSPITTING = defineMonsterTemplate({
  id: 'template.hexspitting',
  name: 'Hexspitting',
  description:
    'Something in the deep dark taught it to spit a sour hex from across a room. It fights as a caster: it keeps ' +
    'its distance and backs away from anyone who closes in.',
  hint: 'Crackling violet spittle hurled from the far side of a chamber.',
  tags: ['trait'],
  prefix: 'Hexspitting',
  role: 'caster',
  powers: { bolt: { range: 4, name: 'sour hex' } },
  threatMul: 1.5,
  lootTier: 1,
  weight: 2,
  glyphTint: '#c58cf2',
});
