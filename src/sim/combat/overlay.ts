/**
 * Monster overlays (ETH-117, docs/ARCHITECTURE.md, Contracts, "Monster templates"): "this base
 * monster, but more", layered on a `MonsterDef` when the monster spawns, without a new def.
 *
 * A `MonsterOverlay` is plain data on the monster's part (`monster.overlay`): content templates by
 * id (*Venomous*, *Swift*), and for a monster made from a profile (a nemesis, an heirloom carrier)
 * or a unique, its own name, title, stat changes, bundles, threat, loot tier and carried items.
 *
 * - Stats: the `combat.overlay` stat provider adds each template's and the overlay's stat
 *   changes after `stats.base`, and the `combat.templates` bundle source visits the template and
 *   overlay bundles, each credited to its template ("Venomous") for tooltips.
 * - Role: `monsterRules` and `rolePowers` read the templates' role and powers over the def's.
 * - Text: `monsterName(entity)` is the name everywhere (`ActorView.name`, log text, death causes).
 * - Rewards: `monsterThreat(entity)` weighs Trophies and kill XP; `monsterLootTier(entity)` is for
 *   the better loot table (ETH-052). `carries` drop where the monster dies.
 */
import type { Rng } from '../../core';
import {
  isProperName,
  MAX_LOOT_TIER,
  MAX_TEMPLATES,
  MONSTER_TEMPLATES,
  MONSTERS,
  monsterDisplayName,
  templateDefs,
  templateFits,
} from '../../content';
import type { MonsterDef, MonsterTemplateDef } from '../../content';
import type { ItemInstance } from '../items/instance';
import { instanceProblem } from '../items/instance';
import { propertyProblems } from '../items/properties';
import type { Entity, EntityId } from '../state';
import { bundleOf, hasBundle, scaleModifier, sourceLabel } from '../stats/getStat';
import { isStatId, STAT_INFO } from '../stats/statIds';
import type { StatId } from '../stats/statIds';
import type { BundleSource, BundleVisitor, StatProvider, StatSink } from '../stats/types';

/** Stat changes by stat id: `add` is added to the base, `mul` multiplies the stat. */
export interface OverlayStats {
  add?: Partial<Record<StatId, number>>;
  mul?: Partial<Record<StatId, number>>;
}

/**
 * Changes layered on a monster's def (ETH-117). Plain data, kept on `monster.overlay`. Every field
 * is optional; leave unused ones out.
 */
export interface MonsterOverlay {
  /** Content template ids (`template.*`), at most `MAX_TEMPLATES`, in the order they were put on. */
  templates?: string[];
  /** A proper name ("Vell"): the monster is called by it ("Vell the Unbowed"), with no article. */
  name?: string;
  /** Put after the name, or after the kind when there is no name ("the Unbowed"). */
  title?: string;
  /** Its own stat changes on top of the templates' (a nemesis's grudge), credited to it by name. */
  stats?: OverlayStats;
  /** Bundle ids (`bundle.*` or any def with a bundle) active on it, credited to it by name. */
  bundles?: string[];
  /** Multiplies its threat, after the templates' multipliers. */
  threatMul?: number;
  /** Its loot tier, if higher than its templates' (0 to `MAX_LOOT_TIER`). */
  lootTier?: number;
  /** Items it carries, dropped where it dies (an heirloom, a guaranteed artifact). */
  carries?: ItemInstance[];
}

/** How a monster is named in an event: its display name and whether it is a proper name. */
export interface ShownName {
  name: string;
  /** A proper name ("Vell the Unbowed"): text uses no article and keeps its capitals. */
  proper?: true;
}

/** The overlay on a monster, if it has one. */
export function overlayOf(entity: Entity): MonsterOverlay | undefined {
  return entity.monster?.overlay;
}

/** The template defs on a monster, in order; none for a plain monster or a non-monster. */
export function templatesOf(entity: Entity): MonsterTemplateDef[] {
  return templateDefs(overlayOf(entity)?.templates);
}

/** The display name of a monster ("Venomous gloam rat", "Vell the Unbowed"); an adventurer's name; else the def id. */
export function monsterName(entity: Entity): string {
  if (entity.adventurer !== undefined) return entity.adventurer.name;
  if (!MONSTERS.has(entity.def)) return entity.def;
  return monsterDisplayName(MONSTERS.get(entity.def), overlayOf(entity) ?? {});
}

/**
 * How an event should name `entity` when its overlay changes its name: `{ name, proper? }`;
 * `undefined` for a plain monster (or anyone else), whose def names it as before.
 */
export function shownName(entity: Entity): ShownName | undefined {
  const overlay = overlayOf(entity);
  if (overlay === undefined || !MONSTERS.has(entity.def)) return undefined;
  const name = monsterName(entity);
  if (name === MONSTERS.get(entity.def).name) return undefined;
  return isProperName(overlay) ? { name, proper: true } : { name };
}

/**
 * `{ names }` for the entities among `entities` whose names an overlay changes, keyed by entity
 * id, or `{}` when none does, so plain monsters' events stay as they were. Spread it into an event.
 */
export function namesOf(...entities: readonly Entity[]): { names?: Record<EntityId, ShownName> } {
  let names: Record<EntityId, ShownName> | undefined;
  for (const e of entities) {
    const shown = shownName(e);
    if (shown !== undefined) (names ??= {})[e.id] = shown;
  }
  return names === undefined ? {} : { names };
}

/**
 * The Codex discovery key that records template `templateId` was met on a monster of `monsterDef`
 * (`met.monster.gloam_rat.template.venomous`), so a monster's entry can list its variants met. It
 * names no def: the Codex shows only entries for content ids and ignores it otherwise.
 */
export function templateMetKey(monsterDef: string, templateId: string): string {
  return `met.${monsterDef}.${templateId}`;
}

/** The templates met on monsters of `monsterDef` so far, by `discovered` keys, in template registration order. */
export function templatesMet(discovered: Readonly<Record<string, unknown>>, monsterDef: string): MonsterTemplateDef[] {
  return MONSTER_TEMPLATES.all().filter((t) => discovered[templateMetKey(monsterDef, t.id)] !== undefined);
}

/** The template ids on a monster as an event field: `{ templates }`, or `{}` when it has none. */
export function templatesField(entity: Entity): { templates?: string[] } {
  const ids = overlayOf(entity)?.templates ?? [];
  return ids.length === 0 ? {} : { templates: [...ids] };
}

/**
 * A monster's threat (rewards and XP): its def's, times each template's `threatMul`, times the
 * overlay's, rounded, at least 1. 0 for anything that isn't a monster.
 */
export function monsterThreat(entity: Entity): number {
  if (!MONSTERS.has(entity.def)) return 0;
  const base = MONSTERS.get(entity.def).threat;
  const overlay = overlayOf(entity);
  if (overlay === undefined) return base;
  const mul = templatesOf(entity).reduce((m, t) => m * t.threatMul, overlay.threatMul ?? 1);
  return Math.max(1, Math.round(base * mul));
}

/** A monster's loot tier: the highest of its templates' and its overlay's, 0 for a plain one. */
export function monsterLootTier(entity: Entity): number {
  const overlay = overlayOf(entity);
  if (overlay === undefined) return 0;
  return Math.max(overlay.lootTier ?? 0, ...templatesOf(entity).map((t) => t.lootTier));
}

/** The map tint of a monster: the last of its templates' `glyphTint`, if any. */
export function monsterTint(entity: Entity): string | undefined {
  let tint: string | undefined;
  for (const t of templatesOf(entity)) tint = t.glyphTint ?? tint;
  return tint;
}

/** The label the overlay's own stat changes and bundles carry in tooltips. */
function overlayLabel(def: MonsterDef, overlay: MonsterOverlay): string {
  return overlay.name !== undefined || overlay.title !== undefined ? monsterDisplayName(def, overlay) : 'Altered';
}

/** Feeds `stat`'s changes from the templates (in order), then the overlay's own, to `sink`. */
function overlayStatParts(def: MonsterDef, overlay: MonsterOverlay, stat: StatId, sink: StatSink): void {
  for (const t of templateDefs(overlay.templates)) {
    const add = t.stats?.add?.[stat];
    const mul = t.stats?.mul?.[stat];
    if (add !== undefined) sink('add', add, t.id, t.name);
    if (mul !== undefined) sink('mul', mul, t.id, t.name);
  }
  const add = overlay.stats?.add?.[stat];
  const mul = overlay.stats?.mul?.[stat];
  if (add !== undefined) sink('add', add, def.id, overlayLabel(def, overlay));
  if (mul !== undefined) sink('mul', mul, def.id, overlayLabel(def, overlay));
}

/** Visits the templates' bundles (in order), then the overlay's own bundles. */
function overlayBundles(def: MonsterDef, overlay: MonsterOverlay, visit: BundleVisitor): void {
  for (const t of templateDefs(overlay.templates)) if (t.bundle !== undefined) visit(t.bundle, t.id, 1, t.name);
  for (const id of overlay.bundles ?? []) visit(bundleOf(id), def.id, 1, `${overlayLabel(def, overlay)} (${sourceLabel(id)})`);
}

/** The overlay's stat changes, after `stats.base`: templates credited to themselves, its own to its name. */
export const PROVIDER_OVERLAY: StatProvider = {
  id: 'combat.overlay',
  contribute(_state, entity, stat, sink) {
    const overlay = overlayOf(entity);
    if (overlay !== undefined && MONSTERS.has(entity.def)) overlayStatParts(MONSTERS.get(entity.def), overlay, stat, sink);
  },
};

/** The overlay's bundles: each template's, credited to the template, then its own. Their triggers fire too. */
export const SOURCE_TEMPLATES: BundleSource = {
  id: 'combat.templates',
  visit(_state, entity, visit) {
    const overlay = overlayOf(entity);
    if (overlay !== undefined && MONSTERS.has(entity.def)) overlayBundles(MONSTERS.get(entity.def), overlay, visit);
  },
};

/**
 * The max HP of a new monster of `def` with `overlay`, worked out from the def and the overlay
 * alone (no run state), the way `statValue` would: base, then the overlay's changes, then the
 * template and overlay bundles' HP modifiers. Generation uses it to spawn monsters at full HP.
 */
export function spawnHp(def: MonsterDef, overlay: MonsterOverlay | undefined): number {
  if (overlay === undefined) return def.stats.hp;
  let add = def.stats.hp;
  let mul = 1;
  const sink: StatSink = (op, value) => {
    if (op === 'add') add += value;
    else mul *= value;
  };
  overlayStatParts(def, overlay, 'hp', sink);
  overlayBundles(def, overlay, (bundle, _source, potency) => {
    for (const m of bundle.modifiers ?? []) if (m.stat === 'hp') sink(m.op, scaleModifier(m.op, m.value, potency), def.id);
  });
  return Math.max(STAT_INFO.hp.min, Math.round(add * mul));
}

/** Everything wrong with an overlay, as readable lines (an empty list when it is well formed). */
export function overlayProblems(overlay: MonsterOverlay, defId?: string): string[] {
  const problems: string[] = [];
  const templates = overlay.templates ?? [];
  if (templates.length > MAX_TEMPLATES) problems.push(`has ${templates.length} templates (at most ${MAX_TEMPLATES})`);
  if (new Set(templates).size !== templates.length) problems.push('has a template twice');
  for (const id of templates) {
    if (!MONSTER_TEMPLATES.has(id)) problems.push(`has unknown template "${id}"`);
    else if (defId !== undefined && MONSTERS.has(defId) && !templateFits(MONSTER_TEMPLATES.get(id), MONSTERS.get(defId))) {
      problems.push(`has template "${id}", which doesn't fit ${defId}`);
    }
  }
  for (const [op, changes] of Object.entries(overlay.stats ?? {}) as [string, Record<string, unknown>][]) {
    if (op !== 'add' && op !== 'mul') {
      problems.push(`has stat changes under unknown key "${op}"`);
      continue;
    }
    for (const [stat, value] of Object.entries(changes)) {
      if (!isStatId(stat)) problems.push(`changes unknown stat "${stat}"`);
      else if (typeof value !== 'number' || !Number.isFinite(value) || (op === 'mul' && value <= 0)) {
        problems.push(`has ${op} ${stat} ${String(value)}`);
      }
    }
  }
  for (const id of overlay.bundles ?? []) if (!hasBundle(id)) problems.push(`has unknown bundle "${id}"`);
  if (overlay.threatMul !== undefined && (!Number.isFinite(overlay.threatMul) || overlay.threatMul <= 0)) {
    problems.push(`has threatMul ${overlay.threatMul}`);
  }
  if (overlay.lootTier !== undefined && (!Number.isInteger(overlay.lootTier) || overlay.lootTier < 0 || overlay.lootTier > MAX_LOOT_TIER)) {
    problems.push(`has loot tier ${overlay.lootTier}`);
  }
  for (const name of [overlay.name, overlay.title]) {
    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) problems.push('has an empty name or title');
  }
  (overlay.carries ?? []).forEach((item, i) => {
    const bad = instanceProblem(item) ?? propertyProblems(item)[0] ?? null;
    if (bad !== null) problems.push(`carries[${i}]: ${bad}`);
  });
  return problems;
}

/**
 * Up to `MAX_TEMPLATES` templates for a new monster of `def`, for generation: each roll of
 * `chance` that succeeds adds one, picked by weight among the fitting templates not taken yet.
 * Draws one `chance` roll per slot until one fails, plus one pick per success. Returns `[]`
 * without drawing when `chance` is 0.
 */
export function rollTemplates(def: MonsterDef, rng: Rng, chance: number): string[] {
  if (chance <= 0) return [];
  const picked: string[] = [];
  while (picked.length < MAX_TEMPLATES && rng.chance(chance)) {
    const options = MONSTER_TEMPLATES.all().filter((t) => templateFits(t, def) && !picked.includes(t.id));
    const total = options.reduce((n, t) => n + t.weight, 0);
    if (total === 0) break;
    let roll = rng.int(1, total);
    for (const t of options) {
      roll -= t.weight;
      if (roll <= 0) {
        picked.push(t.id);
        break;
      }
    }
  }
  return picked;
}
