/**
 * Glyph themes (docs/ARCHITECTURE.md §8.2): how one cell is drawn. The map renderer decides
 * what goes in each cell and where; the theme draws it. `AsciiTheme` draws colored monospace
 * characters from a glyph atlas. A tileset later is a second theme.
 */
import { createDomCanvas, GlyphAtlas } from './atlas';
import type { AtlasContext, CreateCanvas, Rect } from './atlas';
import { rememberedColor } from './color';
import { glyphStyle } from './glyphs';

/** A cell's fog state, for cells that are drawn at all (unknown tiles are left blank). */
export type CellState = 'visible' | 'remembered';

/** The parts of a 2D context the renderer and themes draw on the map with. */
export type MapContext = AtlasContext & Pick<CanvasRenderingContext2D, 'drawImage' | 'strokeRect' | 'setLineDash'>;

export interface GlyphTheme {
  /** A cell's width over its height. */
  readonly aspect: number;
  /** Sets the cell size in device pixels. Cached drawings of another size are dropped. */
  setCellSize(w: number, h: number): void;
  /** Drops cached drawings, e.g. once the map font has loaded. */
  invalidate(): void;
  /** Draws a glyph into the cell whose top-left corner is (x, y), covering the whole cell. */
  drawCell(ctx: MapContext, x: number, y: number, glyphId: string, state: CellState): void;
}

/** JetBrains Mono's advance width is 0.6 of its size, so cells are 0.6 as wide as high. */
export const ASCII_ASPECT = 0.6;

/** The glyph's font size as a fraction of the cell height. */
export const GLYPH_SCALE = 0.9;

/** Slot badges are drawn only in cells at least this many device pixels high. */
export const BADGE_MIN_CELL = 14;

export interface AsciiThemeOptions {
  /** A CSS font family list for the glyphs, e.g. the `--font-mono` token. */
  fontFamily: string;
  /** `#rrggbb` under every glyph: the map background (`--bg-app`). */
  background: string;
  /** Text color of slot badges. */
  badgeColor: string;
  createCanvas?: CreateCanvas;
}

/** Colored monospace characters, pre-rendered into an atlas at the current cell size. */
export class AsciiTheme implements GlyphTheme {
  readonly aspect = ASCII_ASPECT;
  private readonly atlas: GlyphAtlas;
  private cellW = 0;
  private cellH = 0;

  constructor(private readonly options: AsciiThemeOptions) {
    this.atlas = new GlyphAtlas(options.createCanvas ?? createDomCanvas, (ctx, key, rect) => this.paint(ctx, key, rect));
  }

  setCellSize(w: number, h: number): void {
    if (w === this.cellW && h === this.cellH) return;
    this.cellW = w;
    this.cellH = h;
    this.atlas.reset(w, h);
  }

  invalidate(): void {
    this.atlas.reset(this.cellW, this.cellH);
  }

  /** How many looks are in the atlas now. */
  get atlasSize(): number {
    return this.atlas.size;
  }

  drawCell(ctx: MapContext, x: number, y: number, glyphId: string, state: CellState): void {
    const { canvas, rect } = this.atlas.slot(`${state}|${glyphId}`);
    ctx.drawImage(canvas as unknown as CanvasImageSource, rect.x, rect.y, rect.w, rect.h, x, y, rect.w, rect.h);
  }

  private paint(ctx: AtlasContext, key: string, rect: Rect): void {
    const bar = key.indexOf('|');
    const state = key.slice(0, bar) as CellState;
    const style = glyphStyle(key.slice(bar + 1));
    const { fontFamily, background, badgeColor } = this.options;

    ctx.fillStyle = background;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const size = Math.max(1, Math.round(rect.h * GLYPH_SCALE));
    ctx.font = `${style.bold ? 700 : 400} ${size}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = state === 'visible' ? style.color : rememberedColor(style.color, background);
    ctx.fillText(style.ch, rect.x + rect.w / 2, rect.y + rect.h / 2);

    if (style.badge !== undefined && rect.h >= BADGE_MIN_CELL) {
      const badge = Math.max(6, Math.round(rect.h * 0.42));
      ctx.font = `700 ${badge}px ${fontFamily}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, Math.round(rect.h / 8));
      ctx.strokeStyle = background;
      ctx.strokeText(style.badge, rect.x + rect.w, rect.y + rect.h);
      ctx.fillStyle = badgeColor;
      ctx.fillText(style.badge, rect.x + rect.w, rect.y + rect.h);
    }
  }
}
