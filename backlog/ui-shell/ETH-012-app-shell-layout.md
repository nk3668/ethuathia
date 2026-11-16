---
id: ETH-012
title: "App shell layout: top bar, party column, map area, tabs and log"
type: feature
status: ready
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
- [ ] The layout matches the mock-up at desktop width, with a draggable log height that is remembered
- [ ] Under about 1000px wide, the tab panel becomes a drawer and party cards go compact
- [ ] `simStore`, `profileStore` and `uiStore` exist; components read narrow slices
- [ ] The log region lists events from `simStore` as plain text; tabs switch between empty panels

## Notes
Party cards and log filters get their real content in M1.

## Log
- 2026-11-16: Created.
