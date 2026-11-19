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
import { parseHex } from './color';
import type { GlyphTheme, MapContext } from './theme';

/** Colors the renderer draws itself, outside the theme: from the design tokens. */
export interface MapPalette {
  /** Unknown tiles and anything outside the floor (`--bg-app`). */
  background: string;
  /** The selected adventurer's ring (`--accent`). */
  selection: string;
  /** The hover outline (`--text`). */
  hover: string;
  /** Hit flash wash (`--danger`). */
  danger: string;
}

/** What to draw besides the snapshot. */
export interface MapView {
  mode: CameraMode;
  /** The selected adventurer: the one follow mode follows and the selection ring marks. */
  selected: EntityId | null;
  /** The tile under the pointer or the keyboard cursor. */
  hover: Pos | null;
  /**
   * A tile to show instead of following an adventurer, on the shown floor (a clicked or
   * auto-paused highlight). Follow mode centers on it; both modes frame it with corner brackets.
   */
  focus?: Pos | null;
  /**
   * The focus marker's pulse phase in [0, 1), or `null`/absent for a still marker (reduced
   * motion, or a focus the run isn't paused on). Each new phase redraws the marker.
   */
  pulse?: number | null;
  /** Tiles on the shown floor currently flashing from a hit (ETH-019). */
  flashes?: readonly Pos[];
}

/** How far out the focus brackets sit, in cells from the focus tile, at rest and at the pulse's tightest. */
export const FOCUS_SPREAD = { rest: 1, tight: 0.35 } as const;

/** The focus brackets' spread for a pulse phase: out at rest, in at mid-phase, smoothly. */
export function focusSpread(pulse: number | null | undefined): number {
  if (pulse === null || pulse === undefined) return FOCUS_SPREAD.rest;
  const t = (1 - Math.cos(2 * Math.PI * pulse)) / 2; // 0 → 1 → 0 over a period
  return FOCUS_SPREAD.rest - (FOCUS_SPREAD.rest - FOCUS_SPREAD.tight) * t;
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
  /** The focus tile the last frame marked, so its brackets can be cleared when it goes. */
  private lastFocus: Pos | null = null;
  /** Tiles crossed by the goal line drawn on the last frame, so trails can be cleared. */
  private lastGoalLine: readonly Pos[] = [];
  private readonly dangerWash: string;

  constructor(
    private readonly canvas: MapCanvasLike | HTMLCanvasElement,
    private readonly theme: GlyphTheme,
    private readonly palette: MapPalette,
  ) {
    const ctx = (canvas as MapCanvasLike).getContext('2d', { alpha: false });
    if (!ctx) throw new Error('The map canvas has no 2D context');
    this.ctx = ctx;
    const [r, g, b] = parseHex(palette.danger);
    this.dangerWash = `rgba(${r}, ${g}, ${b}, 0.45)`;
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
    const scene = buildScene(
      snap,
      { selected: view.selected, hover: view.hover, focus: view.focus ?? null, flashes: view.flashes },
      this.glyphs,
    );
    const changed = this.dirty || !sameView(this.view, next) ? null : changedTiles(this.scene, scene);
    if (!sameView(this.view, next)) this.theme.setCellSize(next.cellW, next.cellH);
    this.view = next;
    this.scene = scene;
    this.dirty = false;

    const range = visibleRange(next, floor, this.viewport);
    const ctx = this.ctx;
    const focus = view.focus && inFloor(floor, view.focus) ? view.focus : null;
    const lastFocus = this.lastFocus;
    this.lastFocus = focus;
    const goal = goalTarget(snap, view.selected);
    const nextGoalLine = goal ? lineTiles(goal.from, goal.to, floor) : [];
    const lastGoalLine = this.lastGoalLine;
    this.lastGoalLine = nextGoalLine;
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
      if (goal) this.drawGoalLine(goal.from, goal.to);
      if (focus) this.drawFocus(focus, floor, view.pulse);
      return { full: true, tiles };
    }
    // The goal line and focus brackets cross tile boundaries, so their old and new cells are
    // redrawn whenever present or just cleared to prevent trails and double-stroking.
    const redraw = new Set(changed);
    for (const p of lastGoalLine) redraw.add(p.y * floor.width + p.x);
    for (const p of nextGoalLine) redraw.add(p.y * floor.width + p.x);
    if (focus) for (const i of neighborhood(floor, focus)) redraw.add(i);
    if (lastFocus) for (const i of neighborhood(floor, lastFocus)) redraw.add(i);
    for (const i of redraw) {
      const x = i % floor.width;
      const y = (i - x) / floor.width;
      if (x < range.x0 || x >= range.x1 || y < range.y0 || y >= range.y1) continue;
      this.drawTile(x, y, scene.codes[i] as number, false);
      tiles++;
    }
    if (goal) this.drawGoalLine(goal.from, goal.to);
    if (focus) this.drawFocus(focus, floor, view.pulse);
    return { full: false, tiles };
  }

  /** Dotted accent line from the selected adventurer's tile center to its current goal tile center. */
  private drawGoalLine(from: Pos, to: Pos): void {
    const view = this.view as View;
    const ctx = this.ctx;
    const line = Math.max(1, Math.round(this.dpr));
    ctx.save();
    ctx.strokeStyle = this.palette.selection;
    ctx.lineWidth = line;
    ctx.setLineDash([line * 2, line * 3]);
    ctx.beginPath();
    ctx.moveTo(view.originX + (from.x + 0.5) * view.cellW, view.originY + (from.y + 0.5) * view.cellH);
    ctx.lineTo(view.originX + (to.x + 0.5) * view.cellW, view.originY + (to.y + 0.5) * view.cellH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Corner brackets around the focus tile: a shape no other overlay uses, so it reads without
   * its color. They sit `focusSpread(pulse)` cells out, kept inside the floor and the 3×3 block
   * that `draw` redraws.
   */
  private drawFocus(focus: Pos, floor: { width: number; height: number }, pulse: number | null | undefined): void {
    const view = this.view as View;
    const ctx = this.ctx;
    const line = Math.max(1, Math.round(this.dpr));
    const width = line * 2;
    const spreadX = Math.round(focusSpread(pulse) * view.cellW);
    const spreadY = Math.round(focusSpread(pulse) * view.cellH);
    const half = width / 2;
    // Clamped to the floor, so a marker at an edge never paints the off-floor background.
    const fx0 = view.originX;
    const fy0 = view.originY;
    const fx1 = view.originX + floor.width * view.cellW;
    const fy1 = view.originY + floor.height * view.cellH;
    const x0 = Math.max(fx0, view.originX + focus.x * view.cellW - spreadX) + half;
    const y0 = Math.max(fy0, view.originY + focus.y * view.cellH - spreadY) + half;
    const x1 = Math.min(fx1, view.originX + (focus.x + 1) * view.cellW + spreadX) - half;
    const y1 = Math.min(fy1, view.originY + (focus.y + 1) * view.cellH + spreadY) - half;
    const arm = Math.max(line * 2, Math.round(Math.min(x1 - x0, y1 - y0) / 3));
    ctx.setLineDash([]);
    ctx.lineWidth = width;
    ctx.strokeStyle = this.palette.selection;
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * arm);
      ctx.stroke();
    }
    ctx.lineWidth = line;
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
    if (overlay & Overlay.HitFlash) {
      ctx.fillStyle = this.dangerWash;
      ctx.fillRect(px, py, view.cellW, view.cellH);
    }
    // Rings sit inside the cell so a tile never draws over its neighbors.
    const line = Math.max(1, Math.round(this.dpr));
    const inset = line / 2;
    ctx.lineWidth = line;
    if (overlay & Overlay.Possessed) {
      ctx.setLineDash([]);
      ctx.lineWidth = line * 2;
      ctx.strokeStyle = this.palette.selection;
      ctx.strokeRect(px + line, py + line, view.cellW - line * 2, view.cellH - line * 2);
    } else if (overlay & Overlay.Selected) {
      ctx.setLineDash([]);
      ctx.strokeStyle = this.palette.selection;
      ctx.strokeRect(px + inset, py + inset, view.cellW - line, view.cellH - line);
    }
    // `Overlay.Focus` is drawn once per frame by `drawFocus`, after every tile, since it reaches
    // into the neighboring cells.
    if (overlay & Overlay.Hover) {
      const framed = (overlay & (Overlay.Selected | Overlay.Possessed)) !== 0;
      // Dashed when it shares the cell with the selection ring or possession frame, so both stay visible.
      ctx.lineWidth = line;
      ctx.setLineDash(framed ? [line * 2, line * 2] : []);
      ctx.strokeStyle = this.palette.hover;
      const extra = overlay & Overlay.Possessed ? line * 2 : overlay & Overlay.Selected ? line : 0;
      ctx.strokeRect(px + inset + extra, py + inset + extra, view.cellW - line - 2 * extra, view.cellH - line - 2 * extra);
      ctx.setLineDash([]);
    }
  }
}

const LINE_PAD = 0.15;

/**
 * Every floor tile crossed by (or grazed within `LINE_PAD` cells of) the center-to-center segment
 * between `from` and `to`. Padding includes corner-touching tiles so incremental redraws never
 * leave stray dash pixels at vertices or edges.
 */
export function lineTiles(from: Pos, to: Pos, floor: { width: number; height: number }): Pos[] {
  if (floor.width <= 0 || floor.height <= 0) return [];
  const x0 = from.x + 0.5;
  const y0 = from.y + 0.5;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const minX = Math.max(0, Math.min(from.x, to.x));
  const maxX = Math.min(floor.width - 1, Math.max(from.x, to.x));
  const minY = Math.max(0, Math.min(from.y, to.y));
  const maxY = Math.min(floor.height - 1, Math.max(from.y, to.y));
  const tiles: Pos[] = [];
  for (let x = minX; x <= maxX; x++) {
    let tMin = 0;
    let tMax = 1;
    if (dx !== 0) {
      const tA = (x - LINE_PAD - x0) / dx;
      const tB = (x + 1 + LINE_PAD - x0) / dx;
      tMin = Math.max(0, Math.min(tA, tB));
      tMax = Math.min(1, Math.max(tA, tB));
      if (tMin > tMax) continue;
    }
    const ya = y0 + tMin * dy;
    const yb = y0 + tMax * dy;
    const yLo = Math.min(ya, yb);
    const yHi = Math.max(ya, yb);
    const yStart = Math.max(minY, Math.ceil(yLo - 1 - LINE_PAD));
    const yEnd = Math.min(maxY, Math.floor(yHi + LINE_PAD));
    for (let y = yStart; y <= yEnd; y++) tiles.push({ x, y });
  }
  return tiles;
}

function goalTarget(snap: Snapshot, selectedId: EntityId | null): { from: Pos; to: Pos } | null {
  if (selectedId === null) return null;
  const actor = snap.party.find((m) => m.id === selectedId);
  if (!actor || !actor.alive || actor.possessed || actor.floor !== snap.floor.id) return null;
  const goal = actor.intent?.goal;
  if (!goal || !inFloor(snap.floor, actor.pos) || !inFloor(snap.floor, goal)) return null;
  if (goal.x === actor.pos.x && goal.y === actor.pos.y) return null;
  return { from: actor.pos, to: goal };
}

function inFloor(floor: { width: number; height: number }, pos: Pos): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < floor.width && pos.y < floor.height;
}

/** The tile indices of the 3×3 block centered on `pos`, cut to the floor. */
function neighborhood(floor: { width: number; height: number }, pos: Pos): number[] {
  const out: number[] = [];
  for (let y = pos.y - 1; y <= pos.y + 1; y++) {
    for (let x = pos.x - 1; x <= pos.x + 1; x++) {
      if (inFloor(floor, { x, y })) out.push(y * floor.width + x);
    }
  }
  return out;
}
