/**
 * Symmetric shadowcasting field of view (docs/ARCHITECTURE.md §3.7), after Albert Ford's
 * "Symmetric Shadowcasting" description. Pure: it knows nothing about run state, only a grid
 * size, an origin and which tiles block sight.
 *
 * - **Symmetric:** if a non-blocking tile B is visible from A, then A is visible from B.
 * - Blocking tiles (walls, closed doors) are seen when light reaches them but hide what is behind.
 * - The radius is a circle, `dx² + dy² <= r² + r`, which is symmetric too.
 *
 * Slopes are kept as integer fractions, so no tile's visibility depends on floating-point
 * rounding.
 */
import type { Pos } from '../core';

/** A slope `n / d` with `d > 0`, as a column offset per row of depth. */
interface Slope {
  n: number;
  d: number;
}

/** One row of a quadrant's scan: tiles at `depth` between two slopes. */
interface Row {
  depth: number;
  start: Slope;
  end: Slope;
}

/**
 * Maps a (depth, column) pair in a quadrant to grid coordinates around the origin. North, east,
 * south, west, in that order, so the output order is fixed.
 */
const QUADRANTS: readonly ((ox: number, oy: number, depth: number, col: number) => Pos)[] = [
  (ox, oy, depth, col) => ({ x: ox + col, y: oy - depth }),
  (ox, oy, depth, col) => ({ x: ox + depth, y: oy + col }),
  (ox, oy, depth, col) => ({ x: ox + col, y: oy + depth }),
  (ox, oy, depth, col) => ({ x: ox - depth, y: oy + col }),
];

export interface FovInput {
  width: number;
  height: number;
  origin: Pos;
  /** How far sight reaches, in tiles. 0 sees only the origin. */
  radius: number;
  /** True if (x, y) blocks sight. Only called for in-bounds tiles; the edge of the grid blocks. */
  blocksSight: (x: number, y: number) => boolean;
}

/**
 * Every tile visible from `origin`, the origin included, as indices into the grid
 * (`y * width + x`). Each tile appears once, in a fixed order.
 */
export function computeFov({ width, height, origin, radius, blocksSight }: FovInput): number[] {
  const seen = new Set<number>();
  const inBounds = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  if (!inBounds(origin)) throw new RangeError(`FOV origin (${origin.x}, ${origin.y}) is outside the grid`);
  seen.add(origin.y * width + origin.x);
  const r2 = radius * radius + radius;

  for (const transform of QUADRANTS) {
    const at = (depth: number, col: number) => transform(origin.x, origin.y, depth, col);
    const isWall = (p: Pos) => !inBounds(p) || blocksSight(p.x, p.y);
    const reveal = (p: Pos) => {
      const dx = p.x - origin.x;
      const dy = p.y - origin.y;
      if (inBounds(p) && dx * dx + dy * dy <= r2) seen.add(p.y * width + p.x);
    };

    const scan = (row: Row): void => {
      if (row.depth > radius) return;
      let prevWall: boolean | null = null;
      const first = roundTiesUp(row.depth, row.start);
      const last = roundTiesDown(row.depth, row.end);
      for (let col = first; col <= last; col++) {
        const p = at(row.depth, col);
        const wall = isWall(p);
        if (wall || isSymmetric(row, col)) reveal(p);
        if (prevWall === true && !wall) row.start = tileSlope(row.depth, col);
        if (prevWall === false && wall) scan({ depth: row.depth + 1, start: row.start, end: tileSlope(row.depth, col) });
        prevWall = wall;
      }
      if (prevWall === false) scan({ depth: row.depth + 1, start: row.start, end: row.end });
    };

    scan({ depth: 1, start: { n: -1, d: 1 }, end: { n: 1, d: 1 } });
  }
  return [...seen];
}

/** The slope of a tile's near edge: `(2·col − 1) / (2·depth)`. */
function tileSlope(depth: number, col: number): Slope {
  return { n: 2 * col - 1, d: 2 * depth };
}

/** True if the tile's center lies within the row's slopes, so the view to it is symmetric. */
function isSymmetric(row: Row, col: number): boolean {
  return col * row.start.d >= row.depth * row.start.n && col * row.end.d <= row.depth * row.end.n;
}

/** `floor(depth · s + 1/2)`, in integers. */
function roundTiesUp(depth: number, s: Slope): number {
  return Math.floor((2 * depth * s.n + s.d) / (2 * s.d));
}

/** `ceil(depth · s − 1/2)`, in integers. */
function roundTiesDown(depth: number, s: Slope): number {
  return Math.ceil((2 * depth * s.n - s.d) / (2 * s.d));
}
