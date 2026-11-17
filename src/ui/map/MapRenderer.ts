/**
 * The map renderer (docs/ARCHITECTURE.md §8.2): draws a snapshot's floor onto a canvas. It is
 * a plain class with no React in it; `MapCanvas` owns the canvas element and calls `draw`.
 *
 * Each frame works out the scene (one code per tile) and the view (cell size and scroll). When
 * the view is the same as last frame, only tiles whose code changed are drawn again; otherwise
 * the whole canvas is. Draw order within a cell: the glyph from the theme (terrain, feature or
 * actor, already fogged), then the overlays.
 */
import type { Pos } from '../../core';
import type { EntityId, Snapshot } from '../../sim';
import {
  FOLLOW_CELL_HEIGHT,
  fitView,
  followTarget,
  followView,
  sameView,
  tileAt,
  tileRect,
  visibleRange,
} from './camera';
import type { CameraMode, View, Viewport } from './camera';
import { buildScene, cellFog, cellGlyph, cellOverlay, changedTiles, Fog, GlyphTable, Overlay } from './scene';
import type { Scene } from './scene';
import type { GlyphTheme, MapContext } from './theme';

/** Colors the renderer draws itself, outside the theme: from the design tokens. */
export interface MapPalette {
  /** Unknown tiles and anything outside the floor (`--bg-app`). */
  background: string;
  /** The selected adventurer's ring (`--accent`). */
  selection: string;
  /** The hover outline (`--text`). */
  hover: string;
}

/** What to draw besides the snapshot. */
export interface MapView {
  mode: CameraMode;
  /** The selected adventurer: the one follow mode follows and the selection ring marks. */
  selected: EntityId | null;
  /** The tile under the pointer or the keyboard cursor. */
  hover: Pos | null;
  /**
   * A tile to show instead of following an adventurer, on the shown floor (a clicked highlight).
   * Follow mode centers on it; both modes mark it with a dashed ring.
   */
  focus?: Pos | null;
}

/** What one `draw` call did, for tests and frame timing. */
export interface DrawStats {
  /** True when the whole canvas was drawn, false when only changed tiles were. */
  full: boolean;
  /** Tiles drawn. */
  tiles: number;
}

/** The canvas the renderer needs: its backing size and a 2D context. */
export interface MapCanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d', options?: { alpha?: boolean }): MapContext | null;
}

export class MapRenderer {
  private readonly ctx: MapContext;
  private readonly glyphs = new GlyphTable();
  private viewport: Viewport = { width: 0, height: 0 };
  private dpr = 1;
  private view: View | null = null;
  private scene: Scene | null = null;
  private dirty = true;

  constructor(
    private readonly canvas: MapCanvasLike | HTMLCanvasElement,
    private readonly theme: GlyphTheme,
    private readonly palette: MapPalette,
  ) {
    const ctx = (canvas as MapCanvasLike).getContext('2d', { alpha: false });
    if (!ctx) throw new Error('The map canvas has no 2D context');
    this.ctx = ctx;
  }

  /**
   * Sets the canvas's backing size in device pixels and the pixel ratio (device pixels per CSS
   * pixel). The next `draw` redraws everything.
   */
  resize(width: number, height: number, dpr: number): void {
    const w = Math.max(0, Math.round(width));
    const h = Math.max(0, Math.round(height));
    if (w === this.viewport.width && h === this.viewport.height && dpr === this.dpr) return;
    this.viewport = { width: w, height: h };
    this.dpr = dpr;
    this.canvas.width = w;
    this.canvas.height = h;
    this.dirty = true;
  }

  /** Forgets cached glyphs (e.g. once the map font has loaded) and redraws everything next. */
  invalidate(): void {
    this.theme.invalidate();
    this.dirty = true;
  }

  draw(snap: Snapshot, view: MapView): DrawStats {
    const { width: vw, height: vh } = this.viewport;
    if (vw === 0 || vh === 0) return { full: false, tiles: 0 };
    const floor = snap.floor;

    const next = this.nextView(snap, view);
    const scene = buildScene(snap, { selected: view.selected, hover: view.hover, focus: view.focus ?? null }, this.glyphs);
    const changed = this.dirty || !sameView(this.view, next) ? null : changedTiles(this.scene, scene);
    if (!sameView(this.view, next)) this.theme.setCellSize(next.cellW, next.cellH);
    this.view = next;
    this.scene = scene;
    this.dirty = false;

    const range = visibleRange(next, floor, this.viewport);
    const ctx = this.ctx;
    let tiles = 0;
    if (changed === null) {
      ctx.fillStyle = this.palette.background;
      ctx.fillRect(0, 0, vw, vh);
      for (let y = range.y0; y < range.y1; y++) {
        for (let x = range.x0; x < range.x1; x++) {
          this.drawTile(x, y, scene.codes[y * floor.width + x] as number, true);
          tiles++;
        }
      }
      return { full: true, tiles };
    }
    for (const i of changed) {
      const x = i % floor.width;
      const y = (i - x) / floor.width;
      if (x < range.x0 || x >= range.x1 || y < range.y0 || y >= range.y1) continue;
      this.drawTile(x, y, scene.codes[i] as number, false);
      tiles++;
    }
    return { full: false, tiles };
  }

  /** The tile under a point given in CSS pixels from the canvas's top-left, if any. */
  tileAt(x: number, y: number): Pos | null {
    if (!this.view || !this.scene) return null;
    return tileAt(this.view, this.scene, x * this.dpr, y * this.dpr);
  }

  /** A tile's rectangle in CSS pixels from the canvas's top-left, or `null` before the first frame. */
  tileRect(pos: Pos): { x: number; y: number; w: number; h: number } | null {
    if (!this.view) return null;
    const r = tileRect(this.view, pos);
    return { x: r.x / this.dpr, y: r.y / this.dpr, w: r.w / this.dpr, h: r.h / this.dpr };
  }

  /** The view the last frame was drawn with. */
  get currentView(): View | null {
    return this.view;
  }

  private nextView(snap: Snapshot, view: MapView): View {
    const floor = snap.floor;
    if (view.mode === 'fit') return fitView(floor, this.viewport, this.theme.aspect);
    const cellH = Math.max(1, Math.round(FOLLOW_CELL_HEIGHT * this.dpr));
    // Centered on the focus tile, as far as the floor's edges allow.
    if (view.focus) return followView(floor, this.viewport, cellH, this.theme.aspect, view.focus, null);
    const target = followTarget(snap, view.selected);
    // A different floor starts the camera afresh, centered on the target.
    const prev = this.scene?.floor === floor.id ? this.view : null;
    return followView(floor, this.viewport, cellH, this.theme.aspect, target?.pos ?? null, prev);
  }

  private drawTile(x: number, y: number, code: number, cleared: boolean): void {
    const view = this.view as View;
    const ctx = this.ctx;
    const px = view.originX + x * view.cellW;
    const py = view.originY + y * view.cellH;
    const fog = cellFog(code);
    if (fog === Fog.Unknown) {
      if (!cleared) {
        ctx.fillStyle = this.palette.background;
        ctx.fillRect(px, py, view.cellW, view.cellH);
      }
    } else {
      const glyph = this.glyphs.id(cellGlyph(code));
      this.theme.drawCell(ctx, px, py, glyph, fog === Fog.Visible ? 'visible' : 'remembered');
    }

    const overlay = cellOverlay(code);
    if (overlay === Overlay.None) return;
    // Rings sit inside the cell so a tile never draws over its neighbors.
    const line = Math.max(1, Math.round(this.dpr));
    const inset = line / 2;
    ctx.lineWidth = line;
    if (overlay & Overlay.Selected) {
      ctx.setLineDash([]);
      ctx.strokeStyle = this.palette.selection;
      ctx.strokeRect(px + inset, py + inset, view.cellW - line, view.cellH - line);
    }
    if (overlay & Overlay.Focus) {
      // Dashed accent ring, a little inside the selection ring, so it never reads as a selection.
      const extra = overlay & Overlay.Selected ? line * 2 : 0;
      ctx.setLineDash([line * 3, line * 2]);
      ctx.strokeStyle = this.palette.selection;
      ctx.strokeRect(px + inset + extra, py + inset + extra, view.cellW - line - 2 * extra, view.cellH - line - 2 * extra);
      ctx.setLineDash([]);
    }
    if (overlay & Overlay.Hover) {
      // Dashed when it shares the cell with the selection ring, so both stay visible.
      ctx.setLineDash(overlay & Overlay.Selected ? [line * 2, line * 2] : []);
      ctx.strokeStyle = this.palette.hover;
      const extra = overlay & Overlay.Selected ? line : 0;
      ctx.strokeRect(px + inset + extra, py + inset + extra, view.cellW - line - 2 * extra, view.cellH - line - 2 * extra);
      ctx.setLineDash([]);
    }
  }
}
