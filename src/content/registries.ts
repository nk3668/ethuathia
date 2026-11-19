/**
 * Every content kind, validation over all of them, and lookups by id across kinds for the Codex,
 * tooltips and the map.
 */
import type { Def } from '../core';
import { ATTRIBUTE_KIND } from './attributes';
import { BOUNTY_KIND } from './bounties';
import { BUNDLE_KIND } from './bundles';
import { CLASS_KIND } from './classes';
import { CONTRACT_KIND } from './contracts';
import { DEITY_KIND } from './deities';
import { DOCTRINE_KIND } from './doctrines';
import { DRAUGHT_KIND } from './draughts';
import { DUNGEON_KIND } from './dungeons';
import { FEATURE_KIND, FEATURES } from './features';
import { FLOOR_TYPE_KIND } from './floors';
import { GRAMMAR_KIND } from './grammars';
import { ITEM_KIND, ITEMS } from './items';
import { checkKinds, ContentError } from './kind';
import type { ContentKind, RefTarget } from './kind';
import { MONSTER_KIND, MONSTERS } from './monsters';
import { MONSTER_TEMPLATE_KIND } from './monsterTemplates';
import { OMEN_KIND } from './omens';
import { RACE_KIND } from './races';
import { STATUS_KIND } from './statuses';
import type { Glyph } from './schema';
import { TERRAIN, TERRAIN_KIND } from './terrain';
import './town';
import { BUILDING_KIND, UPGRADE_KIND } from './upgrades';

/** Every content kind, in the order they are validated. A new kind is added here. */
export const CONTENT_KINDS: readonly ContentKind[] = [
  TERRAIN_KIND,
  FEATURE_KIND,
  ATTRIBUTE_KIND,
  CLASS_KIND,
  RACE_KIND,
  FLOOR_TYPE_KIND,
  DUNGEON_KIND,
  BUNDLE_KIND,
  STATUS_KIND,
  DRAUGHT_KIND,
  MONSTER_KIND,
  MONSTER_TEMPLATE_KIND,
  ITEM_KIND,
  CONTRACT_KIND,
  BOUNTY_KIND,
  OMEN_KIND,
  DEITY_KIND,
  DOCTRINE_KIND,
  BUILDING_KIND,
  UPGRADE_KIND,
  GRAMMAR_KIND,
];

/**
 * Content kinds whose definitions can appear undiscovered in the Codex and must carry a non-empty
 * `hint` (ETH-091). Checked at load time by `checkDefHints` / `checkContent`.
 */
export const HINT_REQUIRED_KINDS: ReadonlySet<string> = new Set([
  'feature',
  'class',
  'race',
  'floor type',
  'dungeon',
  'status',
  'draught',
  'monster',
  'template',
  'item',
  'contract',
  'bounty',
  'omen',
  'deity',
  'doctrine',
]);

/** Checks that every def in `kinds` belonging to `HINT_REQUIRED_KINDS` has a non-empty `hint`. */
export function checkDefHints(kinds: readonly ContentKind[] = CONTENT_KINDS): string[] {
  const problems: string[] = [];
  for (const kind of kinds) {
    if (!HINT_REQUIRED_KINDS.has(kind.registry.kind)) continue;
    for (const def of kind.registry.all()) {
      if (def.hint === undefined || def.hint.trim() === '') {
        problems.push(`${kind.registry.kind} "${def.id}": hint: must not be empty`);
      }
    }
  }
  return problems;
}

/**
 * Every problem with the registered content (see `checkKinds`). `targets` are registries outside
 * content that defs refer to, such as the sim's generation steps.
 */
export function checkContent(targets: readonly RefTarget[] = []): string[] {
  return [...checkKinds(CONTENT_KINDS, targets), ...checkDefHints(CONTENT_KINDS)];
}

/** Throws a `ContentError` listing every problem with the registered content. */
export function validateContent(targets: readonly RefTarget[] = []): void {
  const problems = checkContent(targets);
  if (problems.length > 0) throw new ContentError(problems);
}

/** The def with this id, of any kind, or `undefined`. */
export function findDef(id: string): Def | undefined {
  for (const kind of CONTENT_KINDS) if (kind.registry.has(id)) return kind.registry.get(id);
  return undefined;
}

/** The name of the def with this id, of any kind, or the id itself if there is none (milestone text). */
export function defName(id: string): string {
  return findDef(id)?.name ?? id;
}

/**
 * The map look for a glyph id: a terrain, feature, item or monster id (`terrain.wall`,
 * `monster.gloam_rat`), or a feature id with a state (`feature.door.open`). A state the feature
 * doesn't list falls back to its plain glyph.
 * `undefined` for anything else.
 */
export function findGlyph(glyphId: string): Glyph | undefined {
  if (TERRAIN.has(glyphId)) return TERRAIN.get(glyphId).glyph;
  if (FEATURES.has(glyphId)) return FEATURES.get(glyphId).glyph;
  if (ITEMS.has(glyphId)) return ITEMS.get(glyphId).glyph;
  if (MONSTERS.has(glyphId)) return MONSTERS.get(glyphId).glyph;
  const dot = glyphId.lastIndexOf('.');
  const base = glyphId.slice(0, dot);
  if (dot < 0 || !FEATURES.has(base)) return undefined;
  const feature = FEATURES.get(base);
  return feature.states?.[glyphId.slice(dot + 1)] ?? feature.glyph;
}
