/**
 * content: typed data definitions and their validation.
 * May import: core. See docs/ARCHITECTURE.md §1 and §5.
 */
export * from './attributes';
export { CLASS_KIND, CLASS_VANGUARD, CLASSES, defineClass } from './classes';
export type { ClassDef } from './classes';
export {
  defineFeature,
  FEATURE_DOOR,
  FEATURE_FOUNTAIN,
  FEATURE_KIND,
  FEATURE_STAIRS_DOWN,
  FEATURE_STAIRS_UP,
  FEATURES,
} from './features';
export type { FeatureDef } from './features';
export { defineFloorType, FLOOR_HALLS, FLOOR_TYPE_KIND, FLOOR_TYPES } from './floors';
export type { FloorStepRef, FloorTypeDef } from './floors';
export { checkKinds, ContentError } from './kind';
export type { ContentKind, ContentRef, RefTarget } from './kind';
export { defineRace, RACE_HUMAN, RACE_KIND, RACES } from './races';
export type { RaceDef } from './races';
export { checkContent, CONTENT_KINDS, findDef, findGlyph, validateContent } from './registries';
export { defShape, glyphSchema, idSchema, nonNegativeInt, positiveInt } from './schema';
export type { Glyph } from './schema';
export { defineTerrain, TERRAIN, TERRAIN_FLOOR, TERRAIN_KIND, TERRAIN_WALL } from './terrain';
export type { TerrainDef } from './terrain';
export * from './monsters';
export * from './items';
export * from './contracts';
export * from './bounties';
export * from './omens';
export * from './deities';
export * from './doctrines';
export * from './upgrades';
export * from './town';
export * from './bundles';
export * from './statuses';
export * from './draughts';
