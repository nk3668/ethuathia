/**
 * The shapes shared by the floor generator and its steps (docs/ARCHITECTURE.md §3.6).
 */
import type { Def, Grid, Pos, Rng } from '../../core';
import type { FloorPlan, PlannedItem } from '../floorText';

/** A rectangle of tiles: `x` and `y` are its top-left tile. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A floor being built. Steps change it in place. It is a `FloorPlan` (terrain, features and
 * starts) plus notes that later steps read, such as where the rooms are.
 */
export interface FloorDraft extends FloorPlan {
  /** `u8` grid of `Terrain` codes. Starts as all wall. */
  terrain: Grid;
  /** Room interiors, in the order they were laid out. */
  rooms: Rect[];
  /** The depth of the floor being built (1 when not known, e.g. in tests). */
  depth: number;
  /**
   * The floor's loot RNG (`lootRngState`), separate from the layout RNG every step gets, so
   * placing items never shifts the layout. Steps that place items draw only from this one.
   */
  loot: Rng;
  /** Items to place on the floor, in order (`gen.loot`). */
  items: PlannedItem[];
}

/** A step bound to checked parameters, ready to run. */
export type BoundGenStep = (draft: FloorDraft, rng: Rng) => void;

/** One generation step, as stored in `GEN_STEPS`. */
export interface GenStepDef extends Def {
  /** Checks `params` (`undefined` means all defaults) and returns the step bound to them. Throws on bad params. */
  bind(params: unknown): BoundGenStep;
}

/**
 * Builds a `GenStepDef` from a parser for its parameters and the step itself, so the step's
 * code sees typed parameters and never runs with unchecked ones.
 */
export function defineGenStep<P>(def: {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  parse(params: unknown): P;
  run(draft: FloorDraft, params: P, rng: Rng): void;
}): GenStepDef {
  const { id, name, description, tags = ['gen'], parse, run } = def;
  return {
    id,
    name,
    description,
    tags,
    bind(params) {
      const parsed = parse(params);
      return (draft, rng) => run(draft, parsed, rng);
    },
  };
}

/** The tiles inside `rect`, in row order. */
export function rectTiles(rect: Rect): Pos[] {
  const tiles: Pos[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) tiles.push({ x, y });
  }
  return tiles;
}
