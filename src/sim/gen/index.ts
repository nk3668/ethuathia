/**
 * Floor generation: the step pipeline and the built-in steps (docs/ARCHITECTURE.md §3.6).
 */
export { checkFloorType, GEN_STEPS, generateFloor } from './generate';
export { readParams } from './params';
export type { NumberParam } from './params';
export { defineGenStep, rectTiles } from './types';
export type { BoundGenStep, FloorDraft, GenStepDef, Rect } from './types';
