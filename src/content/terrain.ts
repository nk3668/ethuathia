/**
 * Terrain: what a tile is made of. The sim stores terrain as small codes in a grid and maps each
 * code to one of these ids (`TERRAIN_IDS` in `src/sim/state.ts`); names, glyphs and Codex text
 * live here.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape, glyphSchema } from './schema';
import type { Glyph } from './schema';

export interface TerrainDef extends Def {
  readonly glyph: Glyph;
}

export const TERRAIN = new Registry<TerrainDef>('terrain');

export const TERRAIN_KIND: ContentKind<TerrainDef> = {
  registry: TERRAIN,
  schema: z.strictObject({ ...defShape('terrain'), glyph: glyphSchema }),
};

/** Registers a terrain def and returns it. Its shape is checked by `validateContent`. */
export function defineTerrain(def: TerrainDef): TerrainDef {
  return TERRAIN.register(def);
}

export const TERRAIN_WALL = defineTerrain({
  id: 'terrain.wall',
  name: 'Wall',
  description: 'Solid rock. Nothing walks through it and nothing sees past it.',
  tags: ['solid'],
  glyph: { ch: '#', color: '#b9c2ce' },
});

export const TERRAIN_FLOOR = defineTerrain({
  id: 'terrain.floor',
  name: 'Floor',
  description: 'Bare stone underfoot, worn smooth by whoever came this way before.',
  tags: [],
  glyph: { ch: '.', color: '#6f7a89' },
});
