/**
 * Floors written as text, for hand-built maps in tests and the M0 floor, and for printing a
 * floor to eyeball it in a test failure.
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
 * | `@` | party start position on a floor tile (only when parsing) |
 *
 * Every row must be the same width.
 */
import { Grid } from '../core';
import type { Pos } from '../core';
import { getFloor } from './entities';
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
}

const FEATURE_CHARS: Record<string, { def: string; feature: FeaturePart }> = {
  '+': { def: DEFS.door, feature: { kind: 'door', open: false } },
  "'": { def: DEFS.door, feature: { kind: 'door', open: true } },
  '<': { def: DEFS.stairsUp, feature: { kind: 'stairs', dir: 'up' } },
  '>': { def: DEFS.stairsDown, feature: { kind: 'stairs', dir: 'down' } },
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
        plan.features.push({ def: feature.def, pos: { x, y }, feature: { ...feature.feature } });
      }
    }
  });
  return plan;
}

/**
 * Prints a floor of a run as text using the legend above. Actors are drawn on top: party
 * members as `@`, anything else with an actor part as `m`.
 */
export function floorToText(state: RunState, floorId: FloorId): string[] {
  const floor = getFloor(state, floorId);
  const terrain = Grid.wrap(floor.terrain);
  const rows: string[][] = [];
  for (let y = 0; y < terrain.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < terrain.width; x++) row.push(terrain.get(x, y) === Terrain.Wall ? '#' : '.');
    rows.push(row);
  }
  const draw = (pos: Pos, ch: string) => {
    (rows[pos.y] as string[])[pos.x] = ch;
  };
  const entities = floor.entities.map((id) => state.entities[id]);
  for (const e of entities) {
    if (e?.feature === undefined) continue;
    const f = e.feature;
    draw(e.pos, f.kind === 'door' ? (f.open ? "'" : '+') : f.dir === 'up' ? '<' : '>');
  }
  for (const e of entities) {
    if (e?.actor === undefined) continue;
    draw(e.pos, e.actor.faction === 'party' ? '@' : 'm');
  }
  return rows.map((row) => row.join(''));
}
