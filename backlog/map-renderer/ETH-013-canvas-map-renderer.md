---
id: ETH-013
title: "Canvas map renderer: glyph atlas, fog and camera follow"
type: feature
status: ready
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
- [ ] The floor renders with the glyphs and colors in the design doc; remembered tiles are dimmed and unknown tiles are blank
- [ ] Glyphs are sharp on high pixel-ratio displays and when the window is resized
- [ ] Follow mode keeps the adventurer in view; fit mode shows the whole floor; a control switches between them
- [ ] Hovering a tile shows a tooltip naming what is there
- [ ] At max sim speed the UI stays responsive (no dropped input) on an 80×40 floor

## Notes
Renderer has no React imports; a thin component owns the canvas element and calls `draw`.

## Log
- 2026-11-16: Created.
