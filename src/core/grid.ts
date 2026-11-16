/**
 * A fixed-size 2D grid of integers backed by a typed array: terrain, map memory, goal-map
 * distances and so on. Cells are stored row by row (`index = y * width + x`).
 *
 * `get` and `set` check their coordinates and `set` checks the value fits the cell type, so a
 * mistake throws instead of silently wrapping. Hot loops that have already checked bounds can
 * read and write `cells` directly.
 */

export interface Pos {
  readonly x: number;
  readonly y: number;
}

/** Orthogonal steps, in a fixed order: north, east, south, west. */
export const DIRS_4: readonly Pos[] = Object.freeze([
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]);

/**
 * All eight steps, orthogonal first (as in `DIRS_4`) then diagonal: NE, SE, SW, NW. The order
 * is part of the determinism contract, and putting orthogonal steps first makes ties in
 * pathing prefer straight moves.
 */
export const DIRS_8: readonly Pos[] = Object.freeze([
  ...DIRS_4,
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
]);

const ARRAYS = {
  u8: Uint8Array,
  u16: Uint16Array,
  i16: Int16Array,
  i32: Int32Array,
} as const;

const LIMITS: Record<GridKind, readonly [min: number, max: number]> = {
  u8: [0, 0xff],
  u16: [0, 0xffff],
  i16: [-0x8000, 0x7fff],
  i32: [-0x8000_0000, 0x7fff_ffff],
};

/** The integer type of each cell. */
export type GridKind = keyof typeof ARRAYS;

export type GridCells = InstanceType<(typeof ARRAYS)[GridKind]>;

/**
 * A grid as plain JSON-safe data. `runs` is run-length encoded as `[value, count, value,
 * count, ...]` in row order, which keeps mostly-uniform grids such as terrain small in saves.
 */
export interface GridData {
  width: number;
  height: number;
  kind: GridKind;
  runs: number[];
}

/**
 * A grid as plain data that is cheap to use: the fields of a `Grid` without its methods, with
 * the typed array itself rather than an encoding of it. Run state stores grids in this form,
 * because it holds no class instances (docs/ARCHITECTURE.md §3.1). `Grid.wrap` gives a `Grid`
 * over the same cells to work with, and structured clone (worker transfer) copies it as is.
 */
export interface GridBuffer {
  width: number;
  height: number;
  kind: GridKind;
  cells: GridCells;
}

function isGridKind(kind: unknown): kind is GridKind {
  return typeof kind === 'string' && Object.hasOwn(ARRAYS, kind);
}

/** Checks that `value` is a well-formed `GridBuffer`: its cells match its kind and size. */
export function isGridBuffer(value: unknown): value is GridBuffer {
  if (typeof value !== 'object' || value === null) return false;
  const { width, height, kind, cells } = value as Partial<GridBuffer>;
  return (
    isGridKind(kind) &&
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    (width as number) >= 1 &&
    (height as number) >= 1 &&
    cells instanceof ARRAYS[kind] &&
    cells.length === (width as number) * (height as number)
  );
}

function checkSize(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Grid size must be positive integers, got ${width}x${height}`);
  }
}

export class Grid {
  readonly width: number;
  readonly height: number;
  readonly kind: GridKind;
  /** The backing array. Direct access skips all checks: index it with `index(x, y)`. */
  readonly cells: GridCells;

  constructor(width: number, height: number, kind: GridKind, fill = 0) {
    checkSize(width, height);
    if (!isGridKind(kind)) throw new TypeError(`Unknown grid kind "${String(kind)}"`);
    this.width = width;
    this.height = height;
    this.kind = kind;
    this.cells = new ARRAYS[kind](width * height);
    if (fill !== 0) this.fill(fill);
  }

  /** Rebuilds a grid from `toData()` output. Throws on malformed data, such as a corrupt save. */
  static fromData(data: GridData): Grid {
    const grid = new Grid(data.width, data.height, data.kind);
    const { runs } = data;
    if (!Array.isArray(runs) || runs.length % 2 !== 0) {
      throw new TypeError('Grid data: runs must be an array of [value, count] pairs');
    }
    let i = 0;
    for (let r = 0; r < runs.length; r += 2) {
      const value = runs[r] as number;
      const count = runs[r + 1] as number;
      grid.checkValue(value);
      if (!Number.isSafeInteger(count) || count < 1 || i + count > grid.cells.length) {
        throw new RangeError(`Grid data: bad run length ${count} at cell ${i}`);
      }
      grid.cells.fill(value, i, i + count);
      i += count;
    }
    if (i !== grid.cells.length) {
      throw new RangeError(`Grid data: runs cover ${i} cells, expected ${grid.cells.length}`);
    }
    return grid;
  }

  /**
   * A `Grid` over the cells of `buffer`, without copying them: writes through the grid change
   * the buffer, as `new Rng(state)` does for RNG state. Throws if the buffer is malformed.
   */
  static wrap(buffer: GridBuffer): Grid {
    if (!isGridBuffer(buffer)) throw new TypeError('Grid.wrap: not a valid grid buffer');
    // Skips the constructor, which would allocate new cells.
    const grid = Object.create(Grid.prototype) as Grid;
    return Object.assign(grid, {
      width: buffer.width,
      height: buffer.height,
      kind: buffer.kind,
      cells: buffer.cells,
    });
  }

  /** This grid as a plain `GridBuffer` sharing its cells. `Grid.wrap` reverses it. */
  toBuffer(): GridBuffer {
    return { width: this.width, height: this.height, kind: this.kind, cells: this.cells };
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** The position of (x, y) in `cells`. Throws if it is outside the grid. */
  index(x: number, y: number): number {
    if (!this.inBounds(x, y)) {
      throw new RangeError(`(${x}, ${y}) is outside the ${this.width}x${this.height} grid`);
    }
    return y * this.width + x;
  }

  get(x: number, y: number): number {
    return this.cells[this.index(x, y)] as number;
  }

  set(x: number, y: number, value: number): void {
    const i = this.index(x, y);
    this.checkValue(value);
    this.cells[i] = value;
  }

  fill(value: number): this {
    this.checkValue(value);
    this.cells.fill(value);
    return this;
  }

  clone(): Grid {
    const copy = new Grid(this.width, this.height, this.kind);
    copy.cells.set(this.cells);
    return copy;
  }

  /**
   * Calls `fn` for each neighbor of (x, y) that is inside the grid, in the order of `dirs`.
   * Takes plain numbers rather than `Pos` objects so pathing loops do not allocate.
   */
  forEachNeighbor(x: number, y: number, fn: (nx: number, ny: number) => void, dirs: readonly Pos[] = DIRS_8): void {
    for (const d of dirs) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (this.inBounds(nx, ny)) fn(nx, ny);
    }
  }

  /** The in-bounds neighbors of (x, y), in the order of `dirs`. */
  neighbors(x: number, y: number, dirs: readonly Pos[] = DIRS_8): Pos[] {
    const out: Pos[] = [];
    this.forEachNeighbor(x, y, (nx, ny) => out.push({ x: nx, y: ny }), dirs);
    return out;
  }

  /** The grid as plain JSON-safe data. `Grid.fromData` reverses it exactly. */
  toData(): GridData {
    const runs: number[] = [];
    const { cells } = this;
    let value = cells[0] as number;
    let count = 0;
    for (const cell of cells) {
      if (cell === value) {
        count++;
      } else {
        runs.push(value, count);
        value = cell;
        count = 1;
      }
    }
    runs.push(value, count);
    return { width: this.width, height: this.height, kind: this.kind, runs };
  }

  private checkValue(value: number): void {
    const [min, max] = LIMITS[this.kind];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`${value} does not fit in a ${this.kind} grid cell (${min} to ${max})`);
    }
  }
}
