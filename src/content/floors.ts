/**
 * Floor types (docs/ARCHITECTURE.md §3.6): how a floor is built, as an ordered list of generation
 * steps with parameters. The steps themselves are code in `src/sim/gen`; a floor type names them
 * by id. Validation checks the ids against the sim's `GEN_STEPS` (a ref of kind
 * `generation step`), and the sim's `validateGame` also checks each step's parameters.
 */
import { z } from 'zod';
import { Registry } from '../core';
import type { Def } from '../core';
import type { ContentKind } from './kind';
import { defShape, idSchema } from './schema';

/** One step of a floor type: a generation step id and its parameters (defaults when left out). */
export interface FloorStepRef {
  /** Id of a generation step, e.g. `gen.rooms`. */
  readonly step: string;
  readonly params?: unknown;
}

export interface FloorTypeDef extends Def {
  /** Size of the floor in tiles, border included. */
  readonly size: { readonly w: number; readonly h: number };
  /** Run in order on an all-wall floor. */
  readonly steps: readonly FloorStepRef[];
}

export const FLOOR_TYPES = new Registry<FloorTypeDef>('floor type');

/** The smallest floor side: room for a wall border round one floor tile. */
const side = z.number().int('must be a whole number').min(3, 'must be at least 3');

export const FLOOR_TYPE_KIND: ContentKind<FloorTypeDef> = {
  registry: FLOOR_TYPES,
  schema: z.strictObject({
    ...defShape('floor'),
    size: z.strictObject({ w: side, h: side }),
    steps: z.array(z.strictObject({ step: idSchema('gen'), params: z.unknown().optional() })).min(1, 'needs at least one step'),
  }),
  refs: (def) => def.steps.map((s, i) => ({ path: `steps[${i}].step`, kind: 'generation step', id: s.step })),
};

/** Registers a floor type and returns it. Its shape is checked by `validateContent`. */
export function defineFloorType(def: FloorTypeDef): FloorTypeDef {
  return FLOOR_TYPES.register(def);
}

/** Rectangular chambers joined by passages, with doors at the chamber mouths. */
export const FLOOR_HALLS = defineFloorType({
  id: 'floor.halls',
  name: 'Hewn Halls',
  description:
    'Rectangular chambers cut from the rock and joined by narrow passages. Most chamber mouths are fitted with doors.',
  hint: 'Square-cut chambers linked by narrow corridors and heavy doors.',
  tags: ['floor'],
  size: { w: 64, h: 32 },
  steps: [
    { step: 'gen.rooms', params: { maxRooms: 12, minWidth: 4, maxWidth: 12, minHeight: 3, maxHeight: 7 } },
    { step: 'gen.corridors', params: { extraChance: 0.15 } },
    { step: 'gen.doors', params: { chance: 0.7, openChance: 0.25 } },
    { step: 'gen.stairs' },
    { step: 'gen.fountains', params: { min: 0, max: 2, minDraughts: 2, maxDraughts: 4 } },
    { step: 'gen.loot', params: { minItems: 3, maxItems: 6 } },
    { step: 'gen.monsters' },
  ],
});
