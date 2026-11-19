import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEATURES, ITEMS, TERRAIN } from '../../src/content';
import { addEntity, createRun, moveEntity, newStatsPart, perceiveParty, placeItem, snapshot } from '../../src/sim';
import type { ActorPart, RunState, Snapshot } from '../../src/sim';
import {
  atlasLayout,
  atlasSize,
  AsciiTheme,
  buildScene,
  cellWidth,
  changedTiles,
  describeTile,
  fitView,
  Fog,
  FOLLOW_MARGIN,
  followTarget,
  followView,
  GlyphAtlas,
  glyphStyle,
  GlyphTable,
  lineTiles,
  MapRenderer,
  Overlay,
  PARTY_HUES,
  parseHex,
  rememberedColor,
  slotRect,
  tileAt,
  tileRect,
  toHex,
  visibleRange,
} from '../../src/ui/map';
import type { AtlasCanvas, CellState, GlyphTheme, MapContext, View } from '../../src/ui/map';
import { FOCUS_SPREAD, focusSpread } from '../../src/ui/map/MapRenderer';
import { cellFog, cellGlyph, cellOverlay, encodeCell, tileSubject } from '../../src/ui/map/scene';

// ---------------------------------------------------------------------------------------------
// Fixtures

// Two rooms joined by a closed door, with an open door and both stairs. The party starts in the
// west room and can't see past the closed door.
const ROOMS = [
  '############',
  "#@@.+.....'#",
  '#<..#...>..#',
  '############',
];

const PARTY = [
  { name: 'Mira', classId: 'class.vanguard', raceId: 'race.human' },
  { name: 'Oren', classId: 'class.vanguard', raceId: 'race.human' },
];

const STATUE: ActorPart = { energy: 0, hp: 5, mp: 0, faction: 'monster' };

function run(): RunState {
  return createRun({ party: PARTY, floorText: ROOMS }, 1);
}

const BG = '#0e1116';
const DOC = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'VISUAL-DESIGN.md'), 'utf8');

/** A recording 2D context: method calls are logged, property writes are kept. */
function fakeContext() {
  const calls: { name: string; args: unknown[]; fillStyle?: unknown; strokeStyle?: unknown; lineWidth?: unknown; font?: unknown }[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) =>
        calls.push({
          name: key,
          args,
          fillStyle: target.fillStyle,
          strokeStyle: target.strokeStyle,
          lineWidth: target.lineWidth,
          font: target.font,
        });
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as MapContext;
  return { ctx, calls };
}

function fakeCanvas(width = 0, height = 0) {
  const { ctx, calls } = fakeContext();
  const canvas = { width, height, getContext: () => ctx };
  return { canvas, calls };
}

/** A theme that records which glyph each cell got. */
class RecordingTheme implements GlyphTheme {
  readonly aspect = 0.6;
  cells: { x: number; y: number; glyph: string; state: CellState }[] = [];
  sizes: [number, number][] = [];
  setCellSize(w: number, h: number) {
    this.sizes.push([w, h]);
  }
  invalidations = 0;
  invalidate() {
    this.invalidations++;
  }
  drawCell(_ctx: MapContext, x: number, y: number, glyph: string, state: CellState) {
    this.cells.push({ x, y, glyph, state });
  }
}

const PALETTE = { background: BG, selection: '#e8a33d', hover: '#e3e8ee', danger: '#e3706b' };

// ---------------------------------------------------------------------------------------------

describe('glyphs', () => {
  it('come from the content defs, which match the table in docs/VISUAL-DESIGN.md §4.1', () => {
    const section = DOC.slice(DOC.indexOf('### 4.1 Glyphs'), DOC.indexOf('### 4.2'));
    const looks = [
      ...TERRAIN.all().map((d) => d.glyph),
      ...FEATURES.all().flatMap((d) => [d.glyph, ...Object.values(d.states ?? {})]),
      ...ITEMS.all().map((d) => d.glyph),
    ];
    for (const glyph of looks) {
      expect(section).toContain(`\`${glyph.ch}\``);
      expect(section.toLowerCase()).toContain(glyph.color);
    }
    for (const hue of PARTY_HUES) expect(section.toLowerCase()).toContain(hue);
    expect(glyphStyle('terrain.wall')).toMatchObject({ ch: '#', color: '#b9c2ce' });
    expect(glyphStyle('terrain.floor')).toMatchObject({ ch: '.', color: '#6f7a89' });
    expect(glyphStyle('feature.door.closed').ch).toBe('+');
    expect(glyphStyle('feature.door.open').ch).toBe("'");
    expect(glyphStyle('feature.stairs_up')).toEqual({ ch: '<', color: '#ffffff', bold: true });
    expect(glyphStyle('feature.stairs_down')).toEqual({ ch: '>', color: '#ffffff', bold: true });
  });

  it('give party members their slot hue and a slot number badge', () => {
    expect(glyphStyle('party.1')).toEqual({ ch: '@', color: PARTY_HUES[0], badge: '1' });
    expect(glyphStyle('party.4')).toEqual({ ch: '@', color: PARTY_HUES[3], badge: '4' });
    expect(glyphStyle('party.5')).toEqual({ ch: '@', color: PARTY_HUES[0], badge: '5' });
  });

  it('fall back for content without a glyph yet', () => {
    expect(glyphStyle('monster.cave_rat').ch).toBe('c');
    expect(glyphStyle('feature.mystery').ch).toBe('?');
  });
});

describe('colors', () => {
  it('round-trip hex', () => {
    expect(parseHex('#0e1116')).toEqual([14, 17, 22]);
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(toHex([14, 17, 22])).toBe('#0e1116');
    expect(() => parseHex('red')).toThrow();
  });

  it('dim and desaturate remembered glyphs, keeping them above the background', () => {
    const lum = (hex: string) => parseHex(hex).reduce((a, c) => a + c, 0);
    const spread = (hex: string) => Math.max(...parseHex(hex)) - Math.min(...parseHex(hex));
    for (const color of ['#b9c2ce', '#6f7a89', '#c08a4a', '#ffffff', ...PARTY_HUES]) {
      const dim = rememberedColor(color, BG);
      expect(lum(dim)).toBeLessThan(lum(color));
      expect(lum(dim)).toBeGreaterThan(lum(BG));
      if (spread(color) > 40) expect(spread(dim)).toBeLessThan(spread(color));
    }
    // About 40% of the way from the background to white.
    expect(parseHex(rememberedColor('#ffffff', BG))[0]).toBeCloseTo(14 + 0.4 * (255 - 14), 0);
  });
});

describe('scene', () => {
  it('packs glyph, fog and overlay into one code', () => {
    const code = encodeCell(1234, Fog.Remembered, Overlay.Hover | Overlay.Selected);
    expect([cellGlyph(code), cellFog(code), cellOverlay(code)]).toEqual([1234, Fog.Remembered, 3]);
    const all = Overlay.Hover | Overlay.Selected | Overlay.Focus | Overlay.Possessed | Overlay.HitFlash;
    const full = encodeCell(50000, Fog.Visible, all);
    expect([cellGlyph(full), cellFog(full), cellOverlay(full)]).toEqual([50000, Fog.Visible, 31]);
  });

  it('draws terrain, features and actors with fog: unknown tiles are blank', () => {
    const state = run();
    const snap = snapshot(state);
    const glyphs = new GlyphTable();
    const scene = buildScene(snap, { selected: null, hover: null }, glyphs);
    const at = (x: number, y: number) => {
      const code = scene.codes[y * scene.width + x] as number;
      return { glyph: glyphs.id(cellGlyph(code)), fog: cellFog(code) };
    };
    expect(at(0, 0)).toEqual({ glyph: 'terrain.wall', fog: Fog.Visible });
    expect(at(3, 1)).toEqual({ glyph: 'terrain.floor', fog: Fog.Visible });
    expect(at(1, 2)).toEqual({ glyph: 'feature.stairs_up', fog: Fog.Visible });
    expect(at(4, 1)).toEqual({ glyph: 'feature.door.closed', fog: Fog.Visible });
    expect(at(1, 1)).toEqual({ glyph: 'party.1', fog: Fog.Visible });
    expect(at(2, 1)).toEqual({ glyph: 'party.2', fog: Fog.Visible });
    // Behind the closed door: never seen.
    expect(at(8, 2)).toEqual({ glyph: '', fog: Fog.Unknown });
  });

  it('dims remembered tiles and forgets monsters out of view', () => {
    const state = run();
    addEntity(state, { def: 'monster.cave_rat', floor: 'd1', pos: { x: 3, y: 2 }, actor: { ...STATUE }, stats: newStatsPart({ hp: 5 }) });
    perceiveParty(state);
    const glyphs = new GlyphTable();
    const before = buildScene(snapshot(state), { selected: null, hover: null }, glyphs);
    expect(glyphs.id(cellGlyph(before.codes[2 * before.width + 3] as number))).toBe('monster.cave_rat');

    // Move the party past the closed door into the east room: the west room is out of sight
    // now, but remembered, and the rat in it is no longer shown.
    const [mira, oren] = state.party as [number, number];
    moveEntity(state, mira, 'd1', { x: 9, y: 1 });
    moveEntity(state, oren, 'd1', { x: 9, y: 2 });
    perceiveParty(state);
    const after = buildScene(snapshot(state), { selected: null, hover: null }, glyphs);
    const at = (x: number, y: number) => {
      const code = after.codes[y * after.width + x] as number;
      return { glyph: glyphs.id(cellGlyph(code)), fog: cellFog(code) };
    };
    expect(at(1, 1)).toEqual({ glyph: 'terrain.floor', fog: Fog.Remembered });
    expect(at(1, 2)).toEqual({ glyph: 'feature.stairs_up', fog: Fog.Remembered });
    expect(at(3, 2)).toEqual({ glyph: 'terrain.floor', fog: Fog.Remembered });
    expect(at(8, 2)).toEqual({ glyph: 'feature.stairs_down', fog: Fog.Visible });
    expect(at(9, 1)).toEqual({ glyph: 'party.1', fog: Fog.Visible });
    expect(describeTile(snapshot(state), { x: 3, y: 2 })?.fog).toBe('remembered');
  });

  it('marks the selected adventurer and the hovered tile', () => {
    const snap = snapshot(run());
    const [mira] = snap.party;
    const scene = buildScene(snap, { selected: mira?.id ?? null, hover: { x: 3, y: 2 } }, new GlyphTable());
    expect(cellOverlay(scene.codes[1 * scene.width + 1] as number)).toBe(Overlay.Selected);
    expect(cellOverlay(scene.codes[2 * scene.width + 3] as number)).toBe(Overlay.Hover);
    expect(cellOverlay(scene.codes[0] as number)).toBe(Overlay.None);
  });

  it('marks a map focus (a clicked highlight), alone or with the selection', () => {
    const snap = snapshot(run());
    const [mira] = snap.party;
    const scene = buildScene(snap, { selected: mira?.id ?? null, hover: null, focus: { x: 1, y: 1 } }, new GlyphTable());
    expect(cellOverlay(scene.codes[1 * scene.width + 1] as number)).toBe(Overlay.Selected | Overlay.Focus);
    const away = buildScene(snap, { selected: null, hover: null, focus: { x: 3, y: 2 } }, new GlyphTable());
    expect(cellOverlay(away.codes[2 * away.width + 3] as number)).toBe(Overlay.Focus);
  });

  it('marks living possessed party member without selection ring, and marks hit flashes in bounds', () => {
    const snap = snapshot(run());
    const [mira, oren] = snap.party as [Snapshot['party'][number], Snapshot['party'][number]];
    mira.possessed = true;
    const scene = buildScene(
      snap,
      { selected: mira.id, hover: null, flashes: [{ x: 3, y: 2 }, { x: 99, y: 99 }] },
      new GlyphTable(),
    );
    expect(cellOverlay(scene.codes[1 * scene.width + 1] as number)).toBe(Overlay.Possessed);
    expect(cellOverlay(scene.codes[2 * scene.width + 3] as number)).toBe(Overlay.HitFlash);

    // Dead or off-floor possessed member is not given the possession overlay.
    mira.alive = false;
    oren.possessed = true;
    oren.floor = 'd2';
    const inactive = buildScene(snap, { selected: null, hover: null }, new GlyphTable());
    expect(cellOverlay(inactive.codes[1 * inactive.width + 1] as number)).toBe(Overlay.None);
    expect(cellOverlay(inactive.codes[1 * inactive.width + 2] as number)).toBe(Overlay.None);
  });

  it('lists the tiles that changed between frames', () => {
    const state = run();
    const glyphs = new GlyphTable();
    const a = buildScene(snapshot(state), { selected: null, hover: null }, glyphs);
    expect(changedTiles(null, a)).toBeNull();
    expect(changedTiles(a, buildScene(snapshot(state), { selected: null, hover: null }, glyphs))).toEqual([]);
    const hovered = buildScene(snapshot(state), { selected: null, hover: { x: 3, y: 1 } }, glyphs);
    expect(changedTiles(a, hovered)).toEqual([1 * a.width + 3]);
    moveEntity(state, state.party[0] as number, 'd1', { x: 3, y: 2 });
    const moved = buildScene(snapshot(state), { selected: null, hover: null }, glyphs);
    expect(changedTiles(a, moved)).toEqual([1 * a.width + 1, 2 * a.width + 3]);
    expect(changedTiles(a, { ...moved, floor: 'd2' })).toBeNull();
  });

  it('describes what is on a tile', () => {
    const state = run();
    addEntity(state, { def: 'monster.cave_rat', floor: 'd1', pos: { x: 3, y: 2 }, actor: { ...STATUE }, stats: newStatsPart({ hp: 5 }) });
    perceiveParty(state);
    const snap = snapshot(state);
    expect(describeTile(snap, { x: 1, y: 1 })).toEqual({ pos: { x: 1, y: 1 }, fog: 'visible', things: ['Mira (party 1)', 'Floor'] });
    expect(describeTile(snap, { x: 3, y: 2 })?.things).toEqual(['Cave rat', 'Floor']);
    expect(describeTile(snap, { x: 4, y: 1 })?.things).toEqual(['Door (closed)', 'Floor']);
    expect(describeTile(snap, { x: 1, y: 2 })?.things).toEqual(['Stairs up', 'Floor']);
    expect(describeTile(snap, { x: 0, y: 0 })?.things).toEqual(['Wall']);
    expect(describeTile(snap, { x: 8, y: 2 })).toEqual({ pos: { x: 8, y: 2 }, fog: 'unknown', things: ['Unexplored'] });
    expect(describeTile(snap, { x: -1, y: 0 })).toBeNull();
  });

  it('draws, names and explains items lying on a tile (ETH-061)', () => {
    const state = run();
    placeItem(state, 'd1', { x: 2, y: 2 }, { def: 'item.trail_biscuit', qty: 3 });
    placeItem(state, 'd1', { x: 2, y: 2 }, { def: 'item.mending_draught', qty: 1 });
    const snap = snapshot(state);
    const glyphs = new GlyphTable();
    const scene = buildScene(snap, { selected: null, hover: null }, glyphs);
    expect(glyphs.id(cellGlyph(scene.codes[2 * scene.width + 2] as number))).toBe('item.mending_draught');
    expect(describeTile(snap, { x: 2, y: 2 })?.things).toEqual(['Mending draught', 'Trail biscuit ×3', 'Floor']);
    expect(tileSubject(snap, { x: 2, y: 2 })).toBe('item.mending_draught');
  });
});

describe('camera', () => {
  const floor = { width: 80, height: 40 };

  it('fits the whole floor at the largest whole cell size, centered', () => {
    const view = fitView(floor, { width: 1000, height: 700 }, 0.6);
    expect(view.cellH).toBe(17);
    expect(view.cellW).toBe(cellWidth(17, 0.6));
    expect(view.cellW * floor.width).toBeLessThanOrEqual(1000);
    expect(view.cellH * floor.height).toBeLessThanOrEqual(700);
    // One size up would not fit.
    expect(cellWidth(18, 0.6) * floor.width > 1000 || 18 * floor.height > 700).toBe(true);
    expect(view.originX).toBe(Math.floor((1000 - view.cellW * 80) / 2));
    expect(view.originY).toBe(Math.floor((700 - view.cellH * 40) / 2));
  });

  it('follow keeps the target in view wherever it is', () => {
    const viewport = { width: 600, height: 400 };
    let prev: View | null = null;
    for (let y = 0; y < floor.height; y += 3) {
      for (let x = 0; x < floor.width; x += 7) {
        const view: View = followView(floor, viewport, 20, 0.6, { x, y }, prev);
        const r = tileRect(view, { x, y });
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(viewport.width);
        expect(r.y + r.h).toBeLessThanOrEqual(viewport.height);
        // Never scrolls past the floor's edges.
        expect(view.originX).toBeLessThanOrEqual(0);
        expect(view.originX).toBeGreaterThanOrEqual(viewport.width - view.cellW * floor.width);
        prev = view;
      }
    }
  });

  it('follow scrolls only near the edges', () => {
    const viewport = { width: 600, height: 400 };
    const start = followView(floor, viewport, 20, 0.6, { x: 40, y: 20 }, null);
    // Centered on the target to begin with.
    expect(Math.abs(tileRect(start, { x: 40, y: 20 }).x + 6 - 300)).toBeLessThanOrEqual(6);
    // A step that stays clear of the margins doesn't move the camera.
    expect(followView(floor, viewport, 20, 0.6, { x: 41, y: 20 }, start)).toEqual(start);
    // Walking right far enough scrolls, keeping the target at the margin.
    let view = start;
    for (let x = 41; x < 60; x++) view = followView(floor, viewport, 20, 0.6, { x, y: 20 }, view);
    const r = tileRect(view, { x: 59, y: 20 });
    expect(r.x + r.w).toBe(viewport.width - Math.floor(viewport.width * FOLLOW_MARGIN));
  });

  it('follow centers a floor smaller than the view', () => {
    const view = followView({ width: 10, height: 5 }, { width: 600, height: 400 }, 20, 0.6, { x: 0, y: 0 }, null);
    expect(view).toEqual({ cellW: 12, cellH: 20, originX: 240, originY: 150 });
  });

  it('follows the selected adventurer, else the first living one', () => {
    const snap: Snapshot = snapshot(run());
    const [mira, oren] = snap.party as [Snapshot['party'][number], Snapshot['party'][number]];
    expect(followTarget(snap, oren.id)?.id).toBe(oren.id);
    expect(followTarget(snap, null)?.id).toBe(mira.id);
    mira.alive = false;
    expect(followTarget(snap, mira.id)?.id).toBe(oren.id);
    oren.alive = false;
    expect(followTarget(snap, null)).toBeNull();
  });

  it('maps points to tiles and back', () => {
    const view: View = { cellW: 12, cellH: 20, originX: -30, originY: 10 };
    expect(tileAt(view, floor, 0, 10)).toEqual({ x: 2, y: 0 });
    expect(tileAt(view, floor, 0, 9)).toBeNull();
    const r = tileRect(view, { x: 5, y: 3 });
    expect(tileAt(view, floor, r.x, r.y)).toEqual({ x: 5, y: 3 });
    expect(tileAt(view, floor, r.x + r.w - 1, r.y + r.h - 1)).toEqual({ x: 5, y: 3 });
    expect(visibleRange(view, floor, { width: 120, height: 100 })).toEqual({ x0: 2, y0: 0, x1: 13, y1: 5 });
  });
});

describe('glyph atlas', () => {
  it('lays slots out in rows', () => {
    const layout = atlasLayout(10, 20, 35);
    expect(layout.columns).toBe(3);
    expect(slotRect(layout, 4)).toEqual({ x: 10, y: 20, w: 10, h: 20 });
    expect(atlasSize(layout, 7)).toEqual({ width: 30, height: 60 });
    expect(atlasSize(layout, 2)).toEqual({ width: 20, height: 20 });
  });

  it('paints each look once, and again after growing or a reset', () => {
    const painted: string[] = [];
    const canvases: AtlasCanvas[] = [];
    const atlas = new GlyphAtlas(
      (width, height) => {
        const canvas = { width, height, getContext: () => fakeContext().ctx };
        canvases.push(canvas);
        return canvas;
      },
      (_ctx, key) => painted.push(key),
    );
    atlas.reset(12, 20);
    const a = atlas.slot('a');
    expect(atlas.slot('a')).toEqual(a);
    atlas.slot('b');
    expect(painted).toEqual(['a', 'b']);
    for (let i = 0; i < 70; i++) atlas.slot(`k${i}`);
    expect(atlas.size).toBe(72);
    // Grew once past 64 slots, repainting what it had.
    expect(canvases).toHaveLength(2);
    expect(painted.filter((k) => k === 'a')).toHaveLength(2);
    atlas.reset(24, 40);
    expect(atlas.size).toBe(0);
    expect(atlas.slot('a').rect).toEqual({ x: 0, y: 0, w: 24, h: 40 });
  });
});

describe('AsciiTheme', () => {
  /** A theme whose atlas canvases record into `atlasCalls`. */
  function theme() {
    const atlasCalls: ReturnType<typeof fakeContext>['calls'] = [];
    const t = new AsciiTheme({
      fontFamily: 'Mono',
      background: BG,
      badgeColor: '#e3e8ee',
      createCanvas: (width, height) => {
        const { ctx, calls } = fakeContext();
        return {
          width,
          height,
          getContext: () =>
            new Proxy(ctx, {
              get(target, key) {
                const value = Reflect.get(target, key) as unknown;
                if (typeof value !== 'function') return value;
                return (...args: unknown[]) => {
                  (value as (...a: unknown[]) => void)(...args);
                  atlasCalls.push(calls[calls.length - 1] as (typeof calls)[number]);
                };
              },
            }),
        };
      },
    });
    return { t, atlasCalls };
  }

  it('draws glyphs in their color, dims remembered ones and copies from the atlas', () => {
    const { t, atlasCalls } = theme();
    t.setCellSize(12, 20);
    const { ctx, calls } = fakeContext();
    t.drawCell(ctx, 24, 40, 'terrain.wall', 'visible');
    t.drawCell(ctx, 36, 40, 'terrain.wall', 'visible');
    t.drawCell(ctx, 48, 40, 'terrain.wall', 'remembered');
    t.drawCell(ctx, 60, 40, 'feature.stairs_down', 'visible');
    t.drawCell(ctx, 72, 40, 'party.2', 'visible');

    const painted = atlasCalls
      .filter((c) => c.name === 'fillText')
      .map((c) => ({ ch: c.args[0], color: c.fillStyle, font: c.font }));
    expect(painted).toEqual([
      { ch: '#', color: '#b9c2ce', font: '400 18px Mono' },
      { ch: '#', color: rememberedColor('#b9c2ce', BG), font: '400 18px Mono' },
      { ch: '>', color: '#ffffff', font: '700 18px Mono' },
      { ch: '@', color: PARTY_HUES[1], font: '400 18px Mono' },
      { ch: '2', color: '#e3e8ee', font: '700 8px Mono' },
    ]);
    const copies = calls.filter((c) => c.name === 'drawImage');
    expect(copies).toHaveLength(5);
    // Whole device pixels, one cell each, at the asked-for place.
    expect(copies[0]?.args.slice(1)).toEqual([0, 0, 12, 20, 24, 40, 12, 20]);
    expect(copies[1]?.args.slice(1)).toEqual([0, 0, 12, 20, 36, 40, 12, 20]);
    expect(t.atlasSize).toBe(4);
  });

  it('starts a new atlas when the cell size changes or fonts load', () => {
    const { t } = theme();
    const { ctx } = fakeContext();
    t.setCellSize(12, 20);
    t.drawCell(ctx, 0, 0, 'terrain.wall', 'visible');
    t.setCellSize(12, 20);
    expect(t.atlasSize).toBe(1);
    t.setCellSize(24, 40);
    expect(t.atlasSize).toBe(0);
    t.drawCell(ctx, 0, 0, 'terrain.wall', 'visible');
    t.invalidate();
    expect(t.atlasSize).toBe(0);
  });
});

describe('MapRenderer', () => {
  function setup(width = 600, height = 400, dpr = 1) {
    const { canvas, calls } = fakeCanvas();
    const theme = new RecordingTheme();
    const renderer = new MapRenderer(canvas, theme, PALETTE);
    renderer.resize(width, height, dpr);
    return { canvas, calls, theme, renderer };
  }

  it('sizes the canvas in device pixels', () => {
    const { canvas } = setup(1201, 801, 2);
    expect([canvas.width, canvas.height]).toEqual([1201, 801]);
  });

  it('draws every known tile in full, with its fog state, and leaves unknown tiles blank', () => {
    const { renderer, theme, calls } = setup();
    const snap = snapshot(run());
    const stats = renderer.draw(snap, { mode: 'follow', selected: null, hover: null });
    expect(stats.full).toBe(true);
    expect(calls[0]).toMatchObject({ name: 'fillRect', args: [0, 0, 600, 400], fillStyle: BG });
    const known = [...snap.floor.terrain].filter((t) => t !== 0).length;
    expect(theme.cells).toHaveLength(known);
    expect(theme.cells.every((c) => c.state === 'visible')).toBe(true);
    expect(theme.cells.map((c) => c.glyph)).toContain('party.1');
    // Follow mode cell size: 20 CSS pixels high.
    expect(theme.sizes).toEqual([[12, 20]]);
  });

  it('redraws only the tiles that changed', () => {
    const { renderer, theme } = setup();
    const state = run();
    renderer.draw(snapshot(state), { mode: 'follow', selected: null, hover: null });
    theme.cells = [];
    expect(renderer.draw(snapshot(state), { mode: 'follow', selected: null, hover: null })).toEqual({ full: false, tiles: 0 });
    moveEntity(state, state.party[0] as number, 'd1', { x: 3, y: 1 });
    expect(renderer.draw(snapshot(state), { mode: 'follow', selected: null, hover: null })).toEqual({ full: false, tiles: 2 });
    expect(theme.cells.map((c) => c.glyph).sort()).toEqual(['party.1', 'terrain.floor']);
  });

  it('draws the selection ring and hover outline inside the cell', () => {
    const { renderer, calls } = setup();
    const snap = snapshot(run());
    renderer.draw(snap, { mode: 'follow', selected: null, hover: null });
    calls.length = 0;
    const stats = renderer.draw(snap, { mode: 'follow', selected: snap.party[0]?.id ?? null, hover: { x: 3, y: 2 } });
    expect(stats).toEqual({ full: false, tiles: 2 });
    const rings = calls.filter((c) => c.name === 'strokeRect');
    expect(rings).toHaveLength(2);
    const view = renderer.currentView as View;
    const mira = tileRect(view, { x: 1, y: 1 });
    expect(rings[0]?.args).toEqual([mira.x + 0.5, mira.y + 0.5, mira.w - 1, mira.h - 1]);
  });

  it('draws a solid 2*line possession frame instead of the ring, keeping hover inset cleanly', () => {
    const { renderer, calls } = setup();
    const snap = snapshot(run());
    const mira = snap.party[0] as Snapshot['party'][number];
    mira.possessed = true;
    mira.intent = { rule: { set: 'baseline', index: 0 }, action: 'act.explore', detail: 'Explore', goal: { x: 3, y: 2 } };
    renderer.draw(snap, { mode: 'follow', selected: mira.id, hover: null });
    calls.length = 0;

    // Hovering the possessed cell redraws only that tile and keeps hover dashed inside the frame.
    const stats = renderer.draw(snap, { mode: 'follow', selected: mira.id, hover: { x: 1, y: 1 } });
    expect(stats).toEqual({ full: false, tiles: 1 });
    // No goal line while possessed.
    expect(calls.filter((c) => c.name === 'stroke')).toHaveLength(0);

    const view = renderer.currentView as View;
    const cell = tileRect(view, { x: 1, y: 1 });
    const rects = calls.filter((c) => c.name === 'strokeRect');
    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({
      lineWidth: 2,
      strokeStyle: PALETTE.selection,
      args: [cell.x + 1, cell.y + 1, cell.w - 2, cell.h - 2],
    });
    expect(rects[1]).toMatchObject({
      lineWidth: 1,
      strokeStyle: PALETTE.hover,
      args: [cell.x + 2.5, cell.y + 2.5, cell.w - 5, cell.h - 5],
    });
    const dashes = calls.filter((c) => c.name === 'setLineDash').map((c) => c.args[0]);
    expect(dashes).toContainEqual([2, 2]);
    expect(dashes.at(-1)).toEqual([]);
  });

  it('draws a semi-transparent danger wash for hit flashes', () => {
    const { renderer, calls } = setup();
    const snap = snapshot(run());
    renderer.draw(snap, { mode: 'follow', selected: null, hover: null });
    calls.length = 0;
    const stats = renderer.draw(snap, { mode: 'follow', selected: null, hover: null, flashes: [{ x: 3, y: 2 }] });
    expect(stats).toEqual({ full: false, tiles: 1 });
    const view = renderer.currentView as View;
    const cell = tileRect(view, { x: 3, y: 2 });
    const fills = calls.filter((c) => c.name === 'fillRect');
    expect(fills).toEqual([
      expect.objectContaining({ fillStyle: 'rgba(227, 112, 107, 0.45)', args: [cell.x, cell.y, cell.w, cell.h] }),
    ]);
  });

  it('computes lineTiles including corner-touching tiles, clamped to floor', () => {
    expect(lineTiles({ x: 1, y: 1 }, { x: 3, y: 1 }, { width: 6, height: 4 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
    expect(lineTiles({ x: 2, y: 0 }, { x: 2, y: 2 }, { width: 6, height: 4 })).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
    // Diagonal crossing corner (1,1) includes neighboring corner tiles so dashes never leave trails.
    expect(lineTiles({ x: 0, y: 0 }, { x: 1, y: 1 }, { width: 4, height: 4 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    // Reversed endpoints produce the same tile set, clipped to floor bounds.
    expect(lineTiles({ x: 3, y: 1 }, { x: 1, y: 1 }, { width: 3, height: 3 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it('draws a dotted goal line for the selected adventurer and clears it without trails', () => {
    const { renderer, calls, theme } = setup();
    const snap = snapshot(run());
    const mira = snap.party[0] as Snapshot['party'][number];
    mira.intent = { rule: { set: 'baseline', index: 0 }, action: 'act.explore', detail: 'Explore', goal: { x: 3, y: 1 } };
    renderer.draw(snap, { mode: 'follow', selected: null, hover: null });

    // Enabling selection draws tiles on the line, then the dotted line center-to-center before focus.
    calls.length = 0;
    theme.cells = [];
    const withGoal = renderer.draw(snap, { mode: 'follow', selected: mira.id, hover: null, focus: { x: 3, y: 2 } });
    expect(withGoal.full).toBe(false);
    const view = renderer.currentView as View;
    const fromRect = tileRect(view, mira.pos);
    const toRect = tileRect(view, { x: 3, y: 1 });
    const dashCall = calls.find((c) => c.name === 'setLineDash' && (c.args[0] as number[]).length === 2);
    expect(dashCall?.args[0]).toEqual([2, 3]);
    const moves = calls.filter((c) => c.name === 'moveTo');
    const lines = calls.filter((c) => c.name === 'lineTo');
    // Goal line is first (before the four focus bracket strokes).
    expect(moves[0]?.args).toEqual([fromRect.x + fromRect.w / 2, fromRect.y + fromRect.h / 2]);
    expect(lines[0]?.args).toEqual([toRect.x + toRect.w / 2, toRect.y + toRect.h / 2]);
    const strokes = calls.filter((c) => c.name === 'stroke');
    expect(strokes).toHaveLength(5);
    expect(strokes[0]).toMatchObject({ strokeStyle: PALETTE.selection, lineWidth: 1 });

    // Goal equal to actor position or off-floor suppresses the line and clears the previous line tiles.
    calls.length = 0;
    theme.cells = [];
    mira.intent = { rule: { set: 'baseline', index: 0 }, action: 'act.explore', detail: 'Explore', goal: { x: 1, y: 1 } };
    const cleared = renderer.draw(snap, { mode: 'follow', selected: mira.id, hover: null });
    expect(cleared.full).toBe(false);
    expect(calls.filter((c) => c.name === 'stroke')).toHaveLength(0);
    // Every tile from the old goal line (1,1), (2,1), (3,1) was redrawn to erase dashes.
    const redrawn = new Set(theme.cells.map((c) => `${c.x},${c.y}`));
    for (const p of lineTiles(mira.pos, { x: 3, y: 1 }, snap.floor)) {
      const r = tileRect(view, p);
      expect(redrawn.has(`${r.x},${r.y}`)).toBe(true);
    }

    // Subsequent frame with no goal line redraws 0 tiles.
    expect(renderer.draw(snap, { mode: 'follow', selected: mira.id, hover: null })).toEqual({ full: false, tiles: 0 });
  });

  it('frames a focus tile with four corner brackets, and clears them when it goes', () => {
    const { renderer, calls } = setup();
    const snap = snapshot(run());
    renderer.draw(snap, { mode: 'follow', selected: null, hover: null });
    calls.length = 0;
    // The small floor already fits the view, so only the focus tile's 3×3 block is drawn again.
    const focused = renderer.draw(snap, { mode: 'follow', selected: null, hover: null, focus: { x: 3, y: 2 } });
    expect(focused).toEqual({ full: false, tiles: 9 });
    expect(calls.filter((c) => c.name === 'stroke')).toHaveLength(4);
    expect(calls.filter((c) => c.name === 'strokeRect')).toHaveLength(0);
    const view = renderer.currentView as View;
    const cell = tileRect(view, { x: 3, y: 2 });
    // At rest the brackets sit one cell out: the first corner starts at the top-left of the 3×3 block.
    const corner = calls.find((c) => c.name === 'lineTo');
    expect(corner?.args).toEqual([cell.x - cell.w + 1, cell.y - cell.h + 1]);

    // A still frame with the same focus redraws the 3×3 block under the brackets and the brackets.
    calls.length = 0;
    const again = renderer.draw(snap, { mode: 'follow', selected: null, hover: null, focus: { x: 3, y: 2 }, pulse: 0.5 });
    expect(again).toEqual({ full: false, tiles: 9 });
    expect(calls.filter((c) => c.name === 'stroke')).toHaveLength(4);

    // Dropping the focus redraws the block once more, to clear the brackets, and draws none.
    calls.length = 0;
    const gone = renderer.draw(snap, { mode: 'follow', selected: null, hover: null });
    expect(gone.full).toBe(false);
    expect(gone.tiles).toBe(9);
    expect(calls.filter((c) => c.name === 'stroke')).toHaveLength(0);
  });

  it('pulses the focus brackets in and out, still when there is no pulse', () => {
    expect(focusSpread(null)).toBe(FOCUS_SPREAD.rest);
    expect(focusSpread(undefined)).toBe(FOCUS_SPREAD.rest);
    expect(focusSpread(0)).toBe(FOCUS_SPREAD.rest);
    expect(focusSpread(0.5)).toBeCloseTo(FOCUS_SPREAD.tight);
    expect(focusSpread(0.25)).toBeCloseTo((FOCUS_SPREAD.rest + FOCUS_SPREAD.tight) / 2);
  });

  it('redraws everything when resized or switched to fit, and fits the floor', () => {
    const { renderer, theme } = setup();
    const snap = snapshot(run());
    renderer.draw(snap, { mode: 'follow', selected: null, hover: null });
    renderer.resize(800, 300, 1);
    expect(renderer.draw(snap, { mode: 'follow', selected: null, hover: null }).full).toBe(true);
    const fit = renderer.draw(snap, { mode: 'fit', selected: null, hover: null });
    expect(fit.full).toBe(true);
    expect(renderer.currentView).toEqual(fitView(snap.floor, { width: 800, height: 300 }, theme.aspect));
    renderer.invalidate();
    expect(theme.invalidations).toBe(1);
    expect(renderer.draw(snap, { mode: 'fit', selected: null, hover: null }).full).toBe(true);
  });

  it('scales cells by the pixel ratio and hit-tests in CSS pixels', () => {
    const { renderer, theme } = setup(1200, 800, 2);
    const snap = snapshot(run());
    renderer.draw(snap, { mode: 'follow', selected: null, hover: null });
    expect(theme.sizes).toEqual([[24, 40]]);
    const rect = renderer.tileRect({ x: 4, y: 2 });
    expect(rect?.w).toBe(12);
    expect(rect?.h).toBe(20);
    expect(renderer.tileAt((rect?.x ?? 0) + 1, (rect?.y ?? 0) + 1)).toEqual({ x: 4, y: 2 });
  });

  it('keeps up with an 80×40 floor: a full frame and a diff frame are cheap', () => {
    const rows = [
      '#'.repeat(80),
      ...Array.from({ length: 38 }, (_, y) => `#${(y === 0 ? '@' : '.').padEnd(78, '.')}#`),
      '#'.repeat(80),
    ];
    const state = createRun({ party: [PARTY[0] as (typeof PARTY)[number]], floorText: rows }, 1);
    const { renderer } = setup(1600, 1000, 1);
    const view = { mode: 'fit' as const, selected: null, hover: null };
    const snap = snapshot(state);
    const start = performance.now();
    const full = renderer.draw(snap, view);
    for (let i = 0; i < 100; i++) renderer.draw(snapshot(state), { ...view, hover: { x: i % 80, y: 5 } });
    const elapsed = performance.now() - start;
    expect(full.tiles).toBe(80 * 40);
    // 101 frames including snapshots, far under one 16ms frame each even on a slow machine.
    expect(elapsed / 101).toBeLessThan(8);
  });
});

describe('monster tints (ETH-117)', () => {
  it('draws a tinted monster in its template color, keeping its glyph', () => {
    const plain = glyphStyle('monster.gloam_rat');
    expect(glyphStyle('monster.gloam_rat@#a6e22e')).toEqual({ ...plain, color: '#a6e22e' });
    expect(glyphStyle('monster.gloam_rat@nonsense')).toEqual(plain);
  });
});
