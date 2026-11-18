/**
 * Floors written as text, for hand-built maps in tests, and for printing a floor (built or
 * generated) to eyeball it in a test failure.
 *
 * Legend:
 *
 * | Char | Meaning |
 * |---|---|
 * | `#` or space | wall (solid rock) |
 * | `.` | floor |
 * | `+` | closed door on a floor tile |
 * | `'` | open door on a floor tile |
 * | `<` | stairs up on a floor tile |
 * | `>` | stairs down on a floor tile |
 * | `{` | fountain on a floor tile, holding `TEXT_FOUNTAIN_DRAUGHTS` (a printed fountain may hold others, or none) |
 * | `@` | party start position on a floor tile (only when parsing) |
 *
 * Every row must be the same width.
 */
import { clonePlain, Grid } from '../core';
import type { Pos } from '../core';
import { getEntity, getFloor } from './entities';
import { DRAUGHT_MENDING } from '../content';
import type { ItemInstance } from './items/instance';
import { DEFS, Terrain } from './state';
import type { FeaturePart, FloorId, RunState } from './state';

/** A parsed floor, ready to be added to a run with `addFloor`. */
export interface FloorPlan {
  /** `u8` grid of `Terrain` codes. */
  terrain: Grid;
  /** Features to create, in row order. */
  features: { def: string; pos: Pos; feature: FeaturePart }[];
  /** Positions marked `@`, in row order. */
  starts: Pos[];
  /** Items lying on the floor, created by `addFloor` in order (ETH-061). Text never has any. */
  items?: PlannedItem[];
}

/** An item a plan puts on a floor tile. */
export interface PlannedItem {
  pos: Pos;
  item: ItemInstance;
}

/**
 * What a fountain written as `{` holds: three draughts of mending water, so hand-built test maps
 * get a predictable fountain. Tests that need other water set the feature's `draughts` themselves.
 */
export const TEXT_FOUNTAIN_DRAUGHTS: readonly string[] = [DRAUGHT_MENDING.id, DRAUGHT_MENDING.id, DRAUGHT_MENDING.id];

const FEATURE_CHARS: Record<string, { def: string; feature: FeaturePart }> = {
  '+': { def: DEFS.door, feature: { kind: 'door', open: false } },
  "'": { def: DEFS.door, feature: { kind: 'door', open: true } },
  '<': { def: DEFS.stairsUp, feature: { kind: 'stairs', dir: 'up' } },
  '>': { def: DEFS.stairsDown, feature: { kind: 'stairs', dir: 'down' } },
  '{': { def: DEFS.fountain, feature: { kind: 'fountain', draughts: [...TEXT_FOUNTAIN_DRAUGHTS] } },
};

/** Parses a floor from text rows. Throws on ragged rows or an unknown character. */
export function parseFloorText(rows: readonly string[]): FloorPlan {
  const width = rows[0]?.length ?? 0;
  if (rows.length === 0 || width === 0) throw new Error('Floor text is empty');
  const terrain = new Grid(width, rows.length, 'u8', Terrain.Wall);
  const plan: FloorPlan = { terrain, features: [], starts: [] };

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Floor text row ${y} is ${row.length} wide, expected ${width} like row 0`);
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x] as string;
      if (ch === '#' || ch === ' ') continue;
      const feature = FEATURE_CHARS[ch];
      if (ch !== '.' && ch !== '@' && feature === undefined) {
        throw new Error(`Floor text has an unknown character "${ch}" at (${x}, ${y})`);
      }
      terrain.set(x, y, Terrain.Floor);
      if (ch === '@') plan.starts.push({ x, y });
      if (feature !== undefined) {
        plan.features.push({ def: feature.def, pos: { x, y }, feature: clonePlain(feature.feature) });
      }
    }
  });
  return plan;
}

function featureChar(f: FeaturePart): string {
  switch (f.kind) {
    case 'door':
      return f.open ? "'" : '+';
    case 'stairs':
      return f.dir === 'up' ? '<' : '>';
    case 'fountain':
      return '{';
  }
}

/** Terrain as text, then each mark drawn over it in order (later marks win). */
function render(terrain: Grid, marks: { pos: Pos; ch: string }[]): string[] {
  const rows: string[][] = [];
  for (let y = 0; y < terrain.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < terrain.width; x++) row.push(terrain.get(x, y) === Terrain.Wall ? '#' : '.');
    rows.push(row);
  }
  for (const { pos, ch } of marks) (rows[pos.y] as string[])[pos.x] = ch;
  return rows.map((row) => row.join(''));
}

/**
 * Prints a floor of a run as text using the legend above. Actors are drawn on top: party
 * members as `@`, anything else with an actor part as `m`.
 */
export function floorToText(state: RunState, floorId: FloorId): string[] {
  const floor = getFloor(state, floorId);
  const entities = floor.entities.map((id) => getEntity(state, id));
  return render(Grid.wrap(floor.terrain), [
    ...entities.flatMap((e) => (e.feature === undefined ? [] : [{ pos: e.pos, ch: featureChar(e.feature) }])),
    ...entities.flatMap((e) =>
      e.actor === undefined ? [] : [{ pos: e.pos, ch: e.actor.faction === 'party' ? '@' : 'm' }],
    ),
  ]);
}

/**
 * Prints a plan, such as a generated floor, as text using the legend above. Starts are drawn as
 * `@` over anything else, so `parseFloorText(planToText(plan))` gives the plan back unless a start
 * shares a tile with a feature.
 */
export function planToText(plan: FloorPlan): string[] {
  return render(plan.terrain, [
    ...plan.features.map((f) => ({ pos: f.pos, ch: featureChar(f.feature) })),
    ...plan.starts.map((pos) => ({ pos, ch: '@' })),
  ]);
}
