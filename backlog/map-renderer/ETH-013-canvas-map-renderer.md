---
id: ETH-013
title: "Canvas map renderer: glyph atlas, fog and camera follow"
type: feature
status: done
priority: P0
milestone: M0
epic: map-renderer
size: M
depends_on: [ETH-010, ETH-012]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The `MapRenderer` class and `GlyphTheme` interface, drawing the snapshot's floor with visible, remembered and unknown tiles, and follow and fit camera modes.

## Why
This is the first time the game is visible, and completes the M0 loop on screen. See `docs/VISUAL-DESIGN.md` §4 and `docs/ARCHITECTURE.md` §8.2.

## Acceptance criteria
- [x] The floor renders with the glyphs and colors in the design doc; remembered tiles are dimmed and unknown tiles are blank
- [x] Glyphs are sharp on high pixel-ratio displays and when the window is resized
- [x] Follow mode keeps the adventurer in view; fit mode shows the whole floor; a control switches between them
- [x] Hovering a tile shows a tooltip naming what is there
- [x] At max sim speed the UI stays responsive (no dropped input) on an 80×40 floor

## Notes
Renderer has no React imports; a thin component owns the canvas element and calls `draw`.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started on branch `eth-013-canvas-map-renderer`.
- 2026-11-16: Done. `MapRenderer`, `GlyphTheme` and `AsciiTheme` in `src/ui/map/`, with the scene,
  camera, atlas and color logic pure and unit-tested; `MapCanvas` and `MapControls` fill the map
  area's slots. Checked in Chrome at pixel ratios 1, 1.5 and 2: at max speed on an 80×40 floor,
  frames held 60fps, a draw took at most 2ms and there were no long tasks. The goal line,
  possession frame and hit flash need data the snapshot lacks yet: ETH-019.
