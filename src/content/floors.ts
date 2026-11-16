/**
 * Floor types (docs/ARCHITECTURE.md §3.6): how a floor is built, as an ordered list of generation
 * steps with parameters. The steps themselves are code in `src/sim/gen`; a floor type names them
 * by id, and `checkFloorType` in the sim checks the ids and parameters.
 */
import { Registry } from '../core';
import type { Def } from '../core';

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

/** Rectangular chambers joined by passages, with doors at the chamber mouths. */
export const FLOOR_HALLS = FLOOR_TYPES.register({
  id: 'floor.halls',
  name: 'Hewn Halls',
  description:
    'Rectangular chambers cut from the rock and joined by narrow passages. Most chamber mouths are fitted with doors.',
  tags: ['floor'],
  size: { w: 64, h: 32 },
  steps: [
    { step: 'gen.rooms', params: { maxRooms: 12, minWidth: 4, maxWidth: 12, minHeight: 3, maxHeight: 7 } },
    { step: 'gen.corridors', params: { extraChance: 0.15 } },
    { step: 'gen.doors', params: { chance: 0.7, openChance: 0.25 } },
    { step: 'gen.stairs' },
  ],
});
