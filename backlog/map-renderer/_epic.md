---
epic: map-renderer
title: Map renderer
status: active
milestones: [M0, M1]
---

## Goal
A sharp, fast glyph map with fog of war that the player can follow, inspect and click.

## Scope
**In:**
- Canvas renderer and glyph atlas
- Fog and memory
- Camera modes
- Selection, hover and possession overlays
- GlyphTheme interface

**Out (later or elsewhere):**
- A tileset theme (later)

## Design refs
- `CLAUDE.md` §8: Map
- `docs/VISUAL-DESIGN.md` §4
- `docs/ARCHITECTURE.md` §8.2

## Items
- [ ] [ETH-013 Canvas map renderer: glyph atlas, fog and camera follow](ETH-013-canvas-map-renderer.md)
