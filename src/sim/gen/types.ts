/**
 * The shapes shared by the floor generator and its steps (docs/ARCHITECTURE.md §3.6).
 */
import type { Def, Grid, Pos, Rng } from '../../core';
import type { DungeonDef } from '../../content';
import type { FloorPlan, PlannedItem } from '../floorText';

/** A rectangle of tiles: `x` and `y` are its top-left tile. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What opt-in Omens change about how a floor is built (ETH-186). Every field is optional and 0
 * when left out. The whole object is absent on a run with no such Omen, so generation takes the
 * path it always did.
 */
export interface FloorRisk {
  /** Danger levels added when reading the template ramp (Stalker's Ledger). */
  templateShift?: number;
  /** Added to the out-of-depth chance (Stalker's Ledger). */
  oodBonus?: number;
  /** Added to the chance a piece of gear is cursed (Cursed Hoards). */
  curseBonus?: number;
  /** Added to the chance a potion or scroll is cursed (Cursed Hoards). */
  consumableCurseBonus?: number;
  /** Added to the chance un-cursed gear is enchanted (Cursed Hoards). */
  enchantBonus?: number;
  /** Added to the highest enchantment loot can roll (Cursed Hoards). */
  enchantCapBonus?: number;
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
  /** The effective Danger rating of the floor being built (defaults to `depth`). */
  danger: number;
  /** Adventurers the run sets out with (1 when not known): bigger parties meet more monsters (ETH-145). */
  partySize: number;
  /** Overrides `PARTY_SIZE_BUDGET_STEP` while generating this floor (tests and tuning runs). */
  partyBudgetStep?: number;
  /** The dungeon variant being built, if known (carries ecology & encounter curves). */
  dungeon?: DungeonDef;
  /** What opt-in Omens change about this floor (ETH-186). Absent when none is on. */
  risk?: FloorRisk;
  /**
   * The floor's loot RNG (`lootRngState`), separate from the layout RNG every step gets, so
   * placing items never shifts the layout. Steps that place items draw only from this one.
   */
  loot: Rng;
  /** Items to place on the floor, in order (`gen.loot`). */
  items: PlannedItem[];
  /** Creatures to create with the floor (`FloorPlan.spawns`). */
  spawns: NonNullable<FloorPlan['spawns']>;
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
