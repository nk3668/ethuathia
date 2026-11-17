---
id: ETH-019
title: "Map overlays: goal line, possession frame and hit flash"
type: feature
status: idea
priority: P2
milestone: M1
epic: map-renderer
size: S
depends_on: [ETH-013]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The rest of the map overlays in `docs/VISUAL-DESIGN.md` §4.3: a dotted line from the selected
adventurer to its current goal tile, a solid accent frame on a possessed adventurer, and a
120ms `--danger` hit flash (off under `prefers-reduced-motion`).

## Why
ETH-013 drew the selection ring, hover outline and slot badges. The other three need data the
snapshot doesn't carry yet: the goal tile (the AI `Intent` has the rule and reason but not the
target), possession (no possession command yet) and hits (no combat yet).

## Acceptance criteria
- [ ] The snapshot carries each party member's goal tile, and the selected adventurer has a dotted line to it
- [ ] A possessed adventurer's cell has a solid accent frame instead of the ring
- [ ] A hit flashes the cell for 120ms, with no flash under reduced motion

## Notes
The goal line crosses many cells, so it can't be part of a tile's scene code like the other
overlays. Draw it in a pass after the tiles and treat its cells (old and new) as dirty in the
frame diff. The flash needs a time-based redraw, so the renderer would schedule frames while a
flash is running.

## Log
- 2026-11-16: Created while building ETH-013.
