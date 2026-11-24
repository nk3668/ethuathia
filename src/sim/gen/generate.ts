/**
 * The floor generation pipeline (docs/ARCHITECTURE.md §3.6): a floor type is an ordered list of
 * step ids with parameters, and `generateFloor` runs them in order on an all-wall floor.
 */
import { Grid } from '../../core';
import type { Rng } from '../../core';
import type { DungeonDef, FloorTypeDef } from '../../content';
import type { FloorPlan } from '../floorText';
import { GEN_STEPS } from '../registries';
import { Terrain } from '../state';
import type { BoundGenStep, FloorDraft } from './types';

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

/** What a floor is built for, beyond its layout RNG. */
export interface GenerateOptions {
  /** The floor's depth. Default 1. */
  depth?: number;
  /** The floor's effective Danger rating. Default: `depth ?? 1`. */
  danger?: number;
  /** The dungeon variant being generated, for ecology and encounter curves. */
  dungeon?: DungeonDef;
  /** The floor's loot RNG (`lootRngState`). Default: `rng` itself, after the layout steps. */
  loot?: Rng;
  /** Adventurers the run sets out with, for the party-size encounter surcharge (ETH-145). Default 1. */
  partySize?: number;
  /** Overrides `PARTY_SIZE_BUDGET_STEP` for this floor (tests and tuning runs). */
  partyBudgetStep?: number;
}

/**
 * Builds a floor of `type`, drawing only from `rng` (the floor's layout RNG) and `options.loot`,
 * so the same states always give the same floor. Every step is checked before any of them runs.
 */
export function generateFloor(type: FloorTypeDef, rng: Rng, options: GenerateOptions = {}): FloorPlan {
  const steps = bindSteps(type);
  const depth = options.depth ?? 1;
  const draft: FloorDraft = {
    terrain: new Grid(type.size.w, type.size.h, 'u8', Terrain.Wall),
    rooms: [],
    features: [],
    starts: [],
    depth,
    danger: options.danger ?? depth,
    partySize: options.partySize ?? 1,
    ...(options.partyBudgetStep === undefined ? {} : { partyBudgetStep: options.partyBudgetStep }),
    ...(options.dungeon === undefined ? {} : { dungeon: options.dungeon }),
    loot: options.loot ?? rng,
    items: [],
    spawns: [],
  };
  steps.forEach(({ stepId, run }, i) => {
    try {
      run(draft, rng);
    } catch (err) {
      throw new Error(`${where(type, i, stepId)}: ${(err as Error).message}`, { cause: err });
    }
  });
  return { terrain: draft.terrain, features: draft.features, starts: draft.starts, items: draft.items, spawns: draft.spawns };
}
