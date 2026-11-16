/**
 * The floor generation pipeline (docs/ARCHITECTURE.md §3.6): a floor type is an ordered list of
 * step ids with parameters, and `generateFloor` runs them in order on an all-wall floor.
 */
import { Grid, Registry } from '../../core';
import type { Rng } from '../../core';
import type { FloorTypeDef } from '../../content';
import type { FloorPlan } from '../floorText';
import { Terrain } from '../state';
import { ROOM_STEPS } from './steps';
import type { BoundGenStep, FloorDraft, GenStepDef } from './types';

/** Every generation step, by id (`gen.rooms`, `gen.corridors`, …). */
export const GEN_STEPS = new Registry<GenStepDef>('generation step');
for (const step of ROOM_STEPS) GEN_STEPS.register(step);

/** The smallest floor side: room for a wall border round one floor tile. */
const MIN_SIDE = 3;

function where(type: FloorTypeDef, index: number, stepId: string): string {
  return `Floor type "${type.id}" step ${index + 1} ("${stepId}")`;
}

/** Checks the size and binds every step to its params. Throws naming the floor type and step. */
function bindSteps(type: FloorTypeDef): { stepId: string; run: BoundGenStep }[] {
  const { w, h } = type.size;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < MIN_SIDE || h < MIN_SIDE) {
    throw new RangeError(`Floor type "${type.id}" size must be whole numbers of at least ${MIN_SIDE}, got ${w}x${h}`);
  }
  return type.steps.map(({ step: stepId, params }, i) => {
    if (!GEN_STEPS.has(stepId)) throw new Error(`${where(type, i, stepId)}: unknown generation step`);
    try {
      return { stepId, run: GEN_STEPS.get(stepId).bind(params) };
    } catch (err) {
      throw new Error(`${where(type, i, stepId)}: ${(err as Error).message}`, { cause: err });
    }
  });
}

/**
 * Checks a floor type without generating anything: its size, that every step id is registered,
 * and that every step accepts its params. Throws with a message naming the type and the step.
 */
export function checkFloorType(type: FloorTypeDef): void {
  bindSteps(type);
}

/**
 * Builds a floor of `type`, drawing only from `rng` (the run's `dungeon` stream), so the same
 * rng state always gives the same floor. Every step is checked before any of them runs.
 */
export function generateFloor(type: FloorTypeDef, rng: Rng): FloorPlan {
  const steps = bindSteps(type);
  const draft: FloorDraft = {
    terrain: new Grid(type.size.w, type.size.h, 'u8', Terrain.Wall),
    rooms: [],
    features: [],
    starts: [],
  };
  steps.forEach(({ stepId, run }, i) => {
    try {
      run(draft, rng);
    } catch (err) {
      throw new Error(`${where(type, i, stepId)}: ${(err as Error).message}`, { cause: err });
    }
  });
  return { terrain: draft.terrain, features: draft.features, starts: draft.starts };
}
