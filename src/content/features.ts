/**
 * Features: things built into a tile, such as doors and stairs (later altars, graves and
 * fountains). In the sim each one is an entity whose `def` is one of these ids.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape, glyphSchema } from './schema';
import type { Glyph } from './schema';

export interface FeatureDef extends Def {
  /** The look in the Codex, and on the map when no state below applies. */
  readonly glyph: Glyph;
  /**
   * The look in each state, keyed by state name: a door is `closed` or `open`. The map draws a
   * feature in state `s` with glyph id `<def id>.<s>`.
   */
  readonly states?: Readonly<Record<string, Glyph>>;
}

export const FEATURES = new Registry<FeatureDef>('feature');

export const FEATURE_KIND: ContentKind<FeatureDef> = {
  registry: FEATURES,
  schema: z.strictObject({
    ...defShape('feature'),
    glyph: glyphSchema,
    states: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/, 'state names must be lowercase'), glyphSchema).optional(),
  }),
};

/** Registers a feature def and returns it. Its shape is checked by `validateContent`. */
export function defineFeature(def: FeatureDef): FeatureDef {
  return FEATURES.register(def);
}

const DOOR_CLOSED: Glyph = { ch: '+', color: '#c08a4a' };

export const FEATURE_DOOR = defineFeature({
  id: 'feature.door',
  name: 'Door',
  description:
    'A heavy plank door on iron hinges. Shut, it blocks sight and has to be opened before anyone can pass. ' +
    'A doorway can only be entered or left straight on, never diagonally.',
  tags: ['door'],
  glyph: DOOR_CLOSED,
  states: { closed: DOOR_CLOSED, open: { ch: "'", color: '#c08a4a' } },
});

export const FEATURE_STAIRS_UP = defineFeature({
  id: 'feature.stairs_up',
  name: 'Stairs up',
  description: 'Steps climbing back toward the surface. On the first floor they lead out of the dungeon.',
  tags: ['stairs'],
  glyph: { ch: '<', color: '#ffffff', bold: true },
});

export const FEATURE_STAIRS_DOWN = defineFeature({
  id: 'feature.stairs_down',
  name: 'Stairs down',
  description: 'Steps descending to the next floor, where the dark is deeper and the danger greater.',
  tags: ['stairs'],
  glyph: { ch: '>', color: '#ffffff', bold: true },
});

const FOUNTAIN_FLOWING: Glyph = { ch: '{', color: '#4f8fd9' };

/** A fountain (ETH-072): drink from it while standing on it, for a draught from `DRAUGHTS`. */
export const FEATURE_FOUNTAIN = defineFeature({
  id: 'feature.fountain',
  name: 'Fountain',
  description:
    'A stone basin fed by a spring deep in the rock. Anyone standing on it can drink, and each drink is a draught ' +
    'of chance: most often it mends wounds, sometimes it sharpens the eyes or turns the stomach, and sometimes it ' +
    'is only water. A fountain holds a few draughts before it runs dry. Adventurers drink when hurt and carrying ' +
    'no healing potion, and skip draughts they know to be harmful.',
  tags: ['fountain'],
  glyph: FOUNTAIN_FLOWING,
  states: { flowing: FOUNTAIN_FLOWING, dry: { ch: '{', color: '#5b6573' } },
});
