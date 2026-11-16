---
id: ETH-012
title: "App shell layout: top bar, party column, map area, tabs and log"
type: feature
status: done
priority: P1
milestone: M0
epic: ui-shell
size: M
depends_on: [ETH-011]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The in-run screen as a CSS grid with its five regions, the Zustand stores, and placeholder content in each region.

## Why
Gives every later feature a place to live. See `docs/VISUAL-DESIGN.md` §3 and `CLAUDE.md` §8.

## Acceptance criteria
- [x] The layout matches the mock-up at desktop width, with a draggable log height that is remembered
- [x] Under about 1000px wide, the tab panel becomes a drawer and party cards go compact
- [x] `simStore`, `profileStore` and `uiStore` exist; components read narrow slices
- [x] The log region lists events from `simStore` as plain text; tabs switch between empty panels

## Notes
Party cards and log filters get their real content in M1.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. Shell in `src/ui/shell/`, stores in `src/ui/stores/` (Zustand added). The app starts a demo run on a `WorkerHost` at 1x until ETH-014. The top bar already shows floor and turn from the snapshot. The log hides moves and waits and repeats of the same AI goal (see `docs/VISUAL-DESIGN.md` §3.3).
