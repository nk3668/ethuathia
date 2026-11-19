---
id: ETH-019
title: "Map overlays: goal line, possession frame and hit flash"
type: feature
status: pending-review
priority: P2
milestone: M1
epic: map-renderer
size: S
depends_on: [ETH-013, ETH-066]
assignee: antigravity
created: 2026-11-16
updated: 2026-11-19
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
- [x] The snapshot carries each party member's goal tile, and the selected adventurer has a dotted line to it
- [x] A possessed adventurer's cell has a solid accent frame instead of the ring
- [x] A hit flashes the cell for 120ms, with no flash under reduced motion

## Notes
The goal line crosses many cells, so it can't be part of a tile's scene code like the other
overlays. Draw it in a pass after the tiles and treat its cells (old and new) as dirty in the
frame diff. The flash needs a time-based redraw, so the renderer would schedule frames while a
flash is running.

## Log
- 2026-11-16: Created while building ETH-013.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Assigned to Antigravity as a low-risk item; acceptance criteria already written, so status ready.
- 2026-11-19: Implemented by Gemini (Antigravity); marked pending-review. `Intent.goal` / `Resolved.goal` added (STATE_VERSION 26), set by `followMap`, attack, flee, fall back, bolt, mend, bolster and wander. (default) Goal line is a `[2, 3]`-line dash in `--accent`, center to center; hit flash is a 45% `--danger` wash; the possession frame is a 2-line solid `--accent` frame; the `core.aiMemory` invariant only checks that a goal has non-negative whole coordinates, since an intent can outlive a floor change.
