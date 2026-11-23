/**
 * The scene: what each tile of the shown floor looks like this frame, worked out from a
 * snapshot with no canvas involved. Each tile is one integer code (its glyph, fog state and
 * overlays), so two frames can be compared tile by tile to redraw only what changed.
 */
import type { Pos } from '../../core';
import { TERRAIN_IDS } from '../../sim';
import type { EntityId, Snapshot } from '../../sim';
import { contentName } from '../shell/text';
import { actorGlyphId, featureGlyphId } from './glyphs';

/** How much the party knows of a tile (§4.2). */
export const Fog = { Unknown: 0, Remembered: 1, Visible: 2 } as const;
export type Fog = (typeof Fog)[keyof typeof Fog];

/** Overlays drawn over a tile's glyph (§4.3), as bit flags. */
export const Overlay = { None: 0, Hover: 1, Selected: 2, Focus: 4, Possessed: 8, HitFlash: 16 } as const;

const FOG_BITS = 2;
const OVERLAY_BITS = 5;
const GLYPH_SHIFT = FOG_BITS + OVERLAY_BITS;

/** Packs a tile's look into one integer. Glyph 0 means nothing is drawn. */
export function encodeCell(glyph: number, fog: Fog, overlay: number): number {
  return (glyph << GLYPH_SHIFT) | (overlay << FOG_BITS) | fog;
}

export function cellGlyph(code: number): number {
  return code >>> GLYPH_SHIFT;
}

export function cellFog(code: number): Fog {
  return (code & 0b11) as Fog;
}

export function cellOverlay(code: number): number {
  return (code >>> FOG_BITS) & 0b11111;
}

/**
 * Glyph ids interned as small integers, so scene codes stay numbers. Index 0 is reserved for
 * "nothing". One table lives as long as its renderer, so codes compare across frames.
 */
export class GlyphTable {
  private readonly ids: string[] = [''];
  private readonly index = new Map<string, number>();

  intern(id: string): number {
    let i = this.index.get(id);
    if (i === undefined) {
      i = this.ids.length;
      this.ids.push(id);
      this.index.set(id, i);
    }
    return i;
  }

  /** The glyph id behind an index, or `''` for 0 or an index never handed out. */
  id(index: number): string {
    return this.ids[index] ?? '';
  }
}

export interface Scene {
  floor: string;
  width: number;
  height: number;
  /** One code per tile, row by row (`y * width + x`). */
  codes: Int32Array;
}

export interface SceneOptions {
  /** The selected adventurer; its tile gets the selection ring (unless possessed). */
  selected: EntityId | null;
  /** The tile under the pointer or the keyboard cursor; it gets the hover outline. */
  hover: Pos | null;
  /** A tile the map was asked to show (a clicked highlight); it gets the focus ring. */
  focus?: Pos | null;
  /** Tiles on the shown floor currently flashing from a hit (ETH-019). */
  flashes?: readonly Pos[];
}

/** 1-based party slot of each party member, by entity id. */
export function partySlots(snap: Snapshot): Map<EntityId, number> {
  return new Map(snap.party.map((m, i) => [m.id, i + 1]));
}

/**
 * Each tile's look: terrain, then a feature on top of it, then items, then an actor on top of that. Actors
 * are only in the snapshot on tiles in view, so monsters are never remembered. Party members
 * are drawn over anything else on their tile, and dead ones are not drawn.
 */
export function buildScene(snap: Snapshot, options: SceneOptions, glyphs: GlyphTable): Scene {
  const { width, height, terrain, visible } = snap.floor;
  const size = width * height;
  const glyph = new Int32Array(size);

  for (let i = 0; i < size; i++) {
    const t = terrain[i] as number;
    if (t !== 0) glyph[i] = glyphs.intern(TERRAIN_IDS[t - 1] ?? `terrain.${t - 1}`);
  }
  for (const f of snap.floor.features) {
    glyph[f.pos.y * width + f.pos.x] = glyphs.intern(featureGlyphId(f));
  }
  // Items lie over features; the last listed on a tile is on top.
  for (const item of snap.domains.items.floor) glyph[item.pos.y * width + item.pos.x] = glyphs.intern(item.def);

  const slots = partySlots(snap);
  const alive = new Set(snap.party.filter((m) => m.alive).map((m) => m.id));
  // Others first, so a party member wins a shared tile.
  const actors = [...snap.floor.actors].sort((a, b) => Number(slots.has(a.id)) - Number(slots.has(b.id)));
  for (const a of actors) {
    const slot = slots.get(a.id) ?? null;
    if (slot !== null && !alive.has(a.id)) continue;
    glyph[a.pos.y * width + a.pos.x] = glyphs.intern(actorGlyphId(a, slot));
  }

  const overlay = new Uint8Array(size);
  const inside = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const mark = (pos: Pos, flag: number) => {
    const i = pos.y * width + pos.x;
    overlay[i] = (overlay[i] as number) | flag;
  };
  const possessed = snap.party.find((m) => m.alive && m.possessed && m.floor === snap.floor.id);
  if (possessed && inside(possessed.pos)) mark(possessed.pos, Overlay.Possessed);
  const selected = options.selected === null ? undefined : snap.floor.actors.find((a) => a.id === options.selected);
  if (selected && alive.has(selected.id) && !(possessed && selected.pos.x === possessed.pos.x && selected.pos.y === possessed.pos.y)) {
    mark(selected.pos, Overlay.Selected);
  }
  const { hover, focus, flashes } = options;
  if (hover && inside(hover)) mark(hover, Overlay.Hover);
  if (focus && inside(focus)) mark(focus, Overlay.Focus);
  if (flashes) for (const pos of flashes) if (inside(pos)) mark(pos, Overlay.HitFlash);

  const codes = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    const fog: Fog = terrain[i] === 0 ? Fog.Unknown : visible[i] === 1 ? Fog.Visible : Fog.Remembered;
    codes[i] = encodeCell(fog === Fog.Unknown ? 0 : (glyph[i] as number), fog, overlay[i] as number);
  }
  return { floor: snap.floor.id, width, height, codes };
}

/**
 * The tiles whose code differs between two scenes of the same floor, or `null` when everything
 * must be drawn: there is no previous scene, or it was of another floor or size.
 */
export function changedTiles(prev: Scene | null, next: Scene): number[] | null {
  if (!prev || prev.floor !== next.floor || prev.width !== next.width || prev.height !== next.height) return null;
  const changed: number[] = [];
  const a = prev.codes;
  const b = next.codes;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) changed.push(i);
  return changed;
}

/** What the hover tooltip says about one tile (§4.3). */
export interface TileInfo {
  pos: Pos;
  fog: 'unknown' | 'remembered' | 'visible';
  /** What is there, top to bottom: actors, then items, then the feature, then the terrain. */
  things: string[];
}

/**
 * The content id the hover tooltip explains for a tile (ETH-065): the topmost thing on it that is
 * not a party member, an actor before an item before a feature. `null` on an empty, unknown or off-floor tile;
 * terrain is left out, since every tile has some.
 */
export function tileSubject(snap: Snapshot, pos: Pos): string | null {
  const { width, height, terrain } = snap.floor;
  if (pos.x < 0 || pos.y < 0 || pos.x >= width || pos.y >= height || terrain[pos.y * width + pos.x] === 0) return null;
  const party = new Set(snap.party.map((m) => m.id));
  const actor = snap.floor.actors.find((a) => a.pos.x === pos.x && a.pos.y === pos.y && !party.has(a.id));
  if (actor) return actor.def;
  const items = snap.domains.items.floor.filter((i) => i.pos.x === pos.x && i.pos.y === pos.y);
  if (items.length > 0) {
    const top = items[items.length - 1] as (typeof items)[number];
    return top.typeUnknown === true ? null : top.def;
  }
  return snap.floor.features.find((f) => f.pos.x === pos.x && f.pos.y === pos.y)?.def ?? null;
}

/** Names what the party knows to be on a tile, or `null` if it is off the floor. */
export function describeTile(snap: Snapshot, pos: Pos): TileInfo | null {
  const { width, height, terrain, visible } = snap.floor;
  if (pos.x < 0 || pos.y < 0 || pos.x >= width || pos.y >= height) return null;
  const i = pos.y * width + pos.x;
  const t = terrain[i] as number;
  if (t === 0) return { pos, fog: 'unknown', things: ['Unexplored'] };

  const things: string[] = [];
  const members = new Map(snap.party.map((m, slot) => [m.id, { member: m, slot: slot + 1 }]));
  for (const a of snap.floor.actors) {
    if (a.pos.x !== pos.x || a.pos.y !== pos.y) continue;
    const party = members.get(a.id);
    if (party) {
      if (party.member.alive) things.push(`${party.member.name} (party ${party.slot})`);
    } else {
      things.push(contentName(a.def));
    }
  }
  const items = snap.domains.items.floor.filter((it) => it.pos.x === pos.x && it.pos.y === pos.y);
  for (const it of [...items].reverse()) {
    const label = it.name ?? contentName(it.def);
    things.push(it.qty === 1 ? label : `${label} ×${it.qty}`);
  }
  const feature = snap.floor.features.find((f) => f.pos.x === pos.x && f.pos.y === pos.y);
  if (feature) {
    const f = feature.feature;
    const state = f.kind === 'door' ? (f.open ? 'open' : 'closed') : f.kind === 'fountain' ? (f.draughts.length > 0 ? 'flowing' : 'dry') : null;
    things.push(state === null ? contentName(feature.def) : `${contentName(feature.def)} (${state})`);
  }
  things.push(contentName(TERRAIN_IDS[t - 1] ?? 'terrain.unknown'));
  return { pos, fog: visible[i] === 1 ? 'visible' : 'remembered', things };
}
