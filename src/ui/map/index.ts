// The map renderer (docs/ARCHITECTURE.md §8.2). Everything but the two components is plain
// TypeScript with no React, and everything but `MapRenderer` and `AsciiTheme` works without a
// canvas.
export { atlasLayout, atlasSize, GlyphAtlas, slotRect } from './atlas';
export type { AtlasCanvas, AtlasContext, AtlasLayout, CreateCanvas, Rect } from './atlas';
export {
  CAMERA_MODES,
  cellWidth,
  fitView,
  FOLLOW_CELL_HEIGHT,
  FOLLOW_MARGIN,
  followTarget,
  followView,
  isCameraMode,
  tileAt,
  tileRect,
  visibleRange,
} from './camera';
export type { CameraMode, View, Viewport } from './camera';
export { parseHex, rememberedColor, toHex } from './color';
export { actorGlyphId, featureGlyphId, glyphStyle, PARTY_HUES, partyGlyphId } from './glyphs';
export type { GlyphStyle } from './glyphs';
export { MapCanvas } from './MapCanvas';
export { MapControls } from './MapControls';
export { MapRenderer } from './MapRenderer';
export type { DrawStats, MapCanvasLike, MapPalette, MapView } from './MapRenderer';
export { buildScene, changedTiles, describeTile, Fog, GlyphTable, Overlay, tileSubject } from './scene';
export type { Scene, SceneOptions, TileInfo } from './scene';
export { ASCII_ASPECT, AsciiTheme } from './theme';
export type { CellState, GlyphTheme, MapContext } from './theme';
