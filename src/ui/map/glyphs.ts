/**
 * Map glyphs (docs/VISUAL-DESIGN.md §4.1): which character and color each thing on the map is
 * drawn with.
 *
 * A glyph id names one look: a content id such as `terrain.wall`, a content id with a state
 * (`feature.door.open`), or `party.N` for the adventurer in party slot N. Terrain and features
 * take their look from their content definitions (`findGlyph`); party members from their slot.
 */
import { findGlyph } from '../../content';
import type { ActorView, FeatureView } from '../../sim';

export interface GlyphStyle {
  /** The character drawn, one code point. */
  ch: string;
  /** `#rrggbb`, in full view. Remembered tiles are drawn dimmed (see `rememberedColor`). */
  color: string;
  /** Drawn in the bold weight, e.g. stairs. */
  bold?: boolean;
  /** A small label at the cell's corner, e.g. a party member's slot number. */
  badge?: string;
}

/** Party hues by slot (§4.1). A fifth member and beyond reuse them in order. */
export const PARTY_HUES: readonly string[] = ['#f2c14e', '#5cc2c7', '#e07fb0', '#8fd16a'];

/** Monsters until their definitions carry a glyph and color (M1). */
export const MONSTER_COLOR = '#e3706b';

/** Anything without a look of its own. */
export const UNKNOWN_GLYPH: GlyphStyle = { ch: '?', color: '#e3e8ee' };

/** The glyph id of the adventurer in party slot `slot` (1-based). */
export function partyGlyphId(slot: number): string {
  return `party.${slot}`;
}

/** The glyph id a remembered or visible feature is drawn with: its def id and its state. */
export function featureGlyphId(feature: FeatureView): string {
  if (feature.feature.kind === 'door') return `${feature.def}.${feature.feature.open ? 'open' : 'closed'}`;
  return feature.def;
}

/**
 * The glyph id an actor is drawn with. `partySlot` is its 1-based slot when it is a party
 * member, otherwise `null`.
 */
export function actorGlyphId(actor: ActorView, partySlot: number | null): string {
  return partySlot === null ? actor.def : partyGlyphId(partySlot);
}

/** How a glyph id is drawn. Never fails: ids with no look of their own get a fallback. */
export function glyphStyle(id: string): GlyphStyle {
  const glyph = findGlyph(id);
  if (glyph) return glyph.bold ? { ch: glyph.ch, color: glyph.color, bold: true } : { ch: glyph.ch, color: glyph.color };
  const party = /^party\.(\d+)$/.exec(id);
  if (party) {
    const slot = Number(party[1]);
    const hue = PARTY_HUES[(Math.max(slot, 1) - 1) % PARTY_HUES.length] as string;
    return { ch: '@', color: hue, badge: String(slot) };
  }
  if (id.startsWith('monster.')) {
    // A placeholder letter from the monster's name until it has a family glyph.
    const name = id.slice(id.lastIndexOf('.') + 1);
    return { ch: name.charAt(0) || 'm', color: MONSTER_COLOR };
  }
  return UNKNOWN_GLYPH;
}
