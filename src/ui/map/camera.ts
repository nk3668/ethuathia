/**
 * Camera and viewport math (docs/VISUAL-DESIGN.md §4.4), with no canvas involved.
 *
 * Everything is in device pixels, and cell sizes and offsets are whole numbers, so every
 * glyph lands on the pixel grid and stays sharp at any pixel ratio.
 */
import type { Pos } from '../../core';
import type { EntityId, Snapshot } from '../../sim';

/** `follow` keeps one adventurer in view at a fixed cell size; `fit` shows the whole floor. */
export type CameraMode = 'follow' | 'fit';
export const CAMERA_MODES: readonly CameraMode[] = ['follow', 'fit'];

export function isCameraMode(value: unknown): value is CameraMode {
  return (CAMERA_MODES as readonly unknown[]).includes(value);
}

/** Cell height in CSS pixels in follow mode. */
export const FOLLOW_CELL_HEIGHT = 20;

/**
 * Follow mode scrolls only when the followed tile comes within this fraction of the view's
 * width or height from an edge, so the map doesn't shift on every step.
 */
export const FOLLOW_MARGIN = 0.25;

/** The canvas's size in device pixels. */
export interface Viewport {
  width: number;
  height: number;
}

/** Where the floor is drawn: the cell size and the position of tile (0, 0)'s top-left corner. */
export interface View {
  cellW: number;
  cellH: number;
  originX: number;
  originY: number;
}

/** A cell `cellH` device pixels high, with the width the theme's aspect gives it. */
export function cellWidth(cellH: number, aspect: number): number {
  return Math.max(1, Math.round(cellH * aspect));
}

/** Centers `size` pixels of map in `space` pixels of view. */
function centered(space: number, size: number): number {
  return Math.floor((space - size) / 2);
}

/** The whole floor, at the largest whole cell size that fits, centered. */
export function fitView(floor: { width: number; height: number }, viewport: Viewport, aspect: number): View {
  let cellH = Math.max(1, Math.floor(viewport.height / Math.max(floor.height, 1)));
  while (cellH > 1 && cellWidth(cellH, aspect) * floor.width > viewport.width) cellH--;
  const cellW = cellWidth(cellH, aspect);
  return {
    cellW,
    cellH,
    originX: centered(viewport.width, cellW * floor.width),
    originY: centered(viewport.height, cellH * floor.height),
  };
}

/** One axis of follow mode: the new offset of the floor's first tile. */
function followAxis(view: number, cell: number, tiles: number, target: number | null, prev: number | null): number {
  const map = cell * tiles;
  if (map <= view) return centered(view, map);
  if (target === null) return prev ?? centered(view, map);

  const center = (target + 0.5) * cell;
  let origin = prev ?? Math.round(view / 2 - center);
  // Keep the target's cell out of the margins, then keep the floor's edges at the view's edges.
  const margin = Math.min(Math.floor(view * FOLLOW_MARGIN), Math.floor((view - cell) / 2));
  const low = origin + target * cell;
  const high = low + cell;
  if (low < margin) origin += margin - low;
  else if (high > view - margin) origin -= high - (view - margin);
  return Math.min(0, Math.max(view - map, origin));
}

/**
 * Follow mode: `cellH` device pixels per row, scrolled so `target` is in view. The camera keeps
 * its place (`prev`) while the target stays away from the edges, and a floor smaller than the
 * view is centered.
 */
export function followView(
  floor: { width: number; height: number },
  viewport: Viewport,
  cellH: number,
  aspect: number,
  target: Pos | null,
  prev: View | null,
): View {
  const cellW = cellWidth(cellH, aspect);
  const same = prev !== null && prev.cellW === cellW && prev.cellH === cellH;
  return {
    cellW,
    cellH,
    originX: followAxis(viewport.width, cellW, floor.width, target?.x ?? null, same ? prev.originX : null),
    originY: followAxis(viewport.height, cellH, floor.height, target?.y ?? null, same ? prev.originY : null),
  };
}

/**
 * Who follow mode follows: the selected adventurer when it is alive on the shown floor,
 * otherwise the first living party member there, otherwise nobody.
 */
export function followTarget(snap: Snapshot, selected: EntityId | null): { id: EntityId; pos: Pos } | null {
  const here = snap.party.filter((m) => m.alive && m.floor === snap.floor.id);
  const member = here.find((m) => m.id === selected) ?? here[0];
  return member ? { id: member.id, pos: member.pos } : null;
}

/** The tile under a point in device pixels, or `null` if the point is off the floor. */
export function tileAt(view: View, floor: { width: number; height: number }, x: number, y: number): Pos | null {
  const tx = Math.floor((x - view.originX) / view.cellW);
  const ty = Math.floor((y - view.originY) / view.cellH);
  if (tx < 0 || ty < 0 || tx >= floor.width || ty >= floor.height) return null;
  return { x: tx, y: ty };
}

/** A tile's rectangle in device pixels. */
export function tileRect(view: View, pos: Pos): { x: number; y: number; w: number; h: number } {
  return { x: view.originX + pos.x * view.cellW, y: view.originY + pos.y * view.cellH, w: view.cellW, h: view.cellH };
}

/** The range of tiles at least partly inside the viewport, as `[first, end)` on each axis. */
export function visibleRange(
  view: View,
  floor: { width: number; height: number },
  viewport: Viewport,
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, Math.floor(-view.originX / view.cellW)),
    y0: Math.max(0, Math.floor(-view.originY / view.cellH)),
    x1: Math.min(floor.width, Math.ceil((viewport.width - view.originX) / view.cellW)),
    y1: Math.min(floor.height, Math.ceil((viewport.height - view.originY) / view.cellH)),
  };
}

export function sameView(a: View | null, b: View): boolean {
  return a !== null && a.cellW === b.cellW && a.cellH === b.cellH && a.originX === b.originX && a.originY === b.originY;
}
