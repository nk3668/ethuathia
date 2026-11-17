/**
 * The glyph atlas (docs/ARCHITECTURE.md §8.2): each look a cell can have is drawn once into an
 * offscreen canvas, and the map copies it from there with `drawImage`. Slots are handed out
 * the first time a look is needed and kept until the cell size changes.
 *
 * The layout math is pure; `GlyphAtlas` holds the canvas and is given a factory for it, so
 * tests can run it without a real canvas.
 */

/** Widest an atlas canvas is made, in device pixels. */
export const ATLAS_MAX_WIDTH = 2048;

/** Slots an atlas starts with. It doubles when full. */
export const ATLAS_START_SLOTS = 64;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How slots of one size are laid out: left to right, then row by row. */
export interface AtlasLayout {
  slotW: number;
  slotH: number;
  columns: number;
}

export function atlasLayout(slotW: number, slotH: number, maxWidth = ATLAS_MAX_WIDTH): AtlasLayout {
  return { slotW, slotH, columns: Math.max(1, Math.floor(maxWidth / slotW)) };
}

export function slotRect(layout: AtlasLayout, index: number): Rect {
  return {
    x: (index % layout.columns) * layout.slotW,
    y: Math.floor(index / layout.columns) * layout.slotH,
    w: layout.slotW,
    h: layout.slotH,
  };
}

/** The canvas size that holds `capacity` slots. */
export function atlasSize(layout: AtlasLayout, capacity: number): { width: number; height: number } {
  const columns = Math.min(layout.columns, Math.max(capacity, 1));
  const rows = Math.ceil(Math.max(capacity, 1) / layout.columns);
  return { width: columns * layout.slotW, height: rows * layout.slotH };
}

/** The parts of a canvas the atlas uses: a real `HTMLCanvasElement` or `OffscreenCanvas`. */
export interface AtlasCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): AtlasContext | null;
}

/** The parts of a 2D context the atlas and themes use. */
export type AtlasContext = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'fillRect'
  | 'fillText'
  | 'strokeText'
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'rect'
  | 'clip'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineJoin'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>;

export type CreateCanvas = (width: number, height: number) => AtlasCanvas;

/** A canvas from the document. */
export const createDomCanvas: CreateCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as AtlasCanvas;
};

/** Draws one look into a slot. The slot is clipped, so nothing spills into its neighbors. */
export type PaintSlot = (ctx: AtlasContext, key: string, rect: Rect) => void;

export class GlyphAtlas {
  private canvas: AtlasCanvas | null = null;
  private layout: AtlasLayout = atlasLayout(1, 1);
  private capacity = 0;
  private readonly keys: string[] = [];
  private readonly slots = new Map<string, number>();

  constructor(
    private readonly create: CreateCanvas,
    private readonly paint: PaintSlot,
  ) {}

  /** Empties the atlas and sets the slot size. Nothing is drawn until a slot is asked for. */
  reset(slotW: number, slotH: number): void {
    this.layout = atlasLayout(slotW, slotH);
    this.canvas = null;
    this.capacity = 0;
    this.keys.length = 0;
    this.slots.clear();
  }

  get size(): number {
    return this.keys.length;
  }

  /** The atlas canvas and the slot holding `key`, drawing it first if it is new. */
  slot(key: string): { canvas: AtlasCanvas; rect: Rect } {
    let index = this.slots.get(key);
    if (index === undefined) {
      index = this.keys.length;
      this.keys.push(key);
      this.slots.set(key, index);
      if (index >= this.capacity) this.grow(Math.max(ATLAS_START_SLOTS, this.capacity * 2));
      else this.draw(index);
    }
    return { canvas: this.canvas as AtlasCanvas, rect: slotRect(this.layout, index) };
  }

  /** A bigger canvas, with every slot drawn again. */
  private grow(capacity: number): void {
    const { width, height } = atlasSize(this.layout, capacity);
    this.canvas = this.create(width, height);
    this.capacity = capacity;
    for (let i = 0; i < this.keys.length; i++) this.draw(i);
  }

  private draw(index: number): void {
    const ctx = this.canvas?.getContext('2d');
    if (!ctx) return;
    const rect = slotRect(this.layout, index);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    this.paint(ctx, this.keys[index] as string, rect);
    ctx.restore();
  }
}
