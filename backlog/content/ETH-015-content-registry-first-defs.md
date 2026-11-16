---
id: ETH-015
title: "Content registry with validation and first definitions"
type: feature
status: ready
priority: P1
milestone: M0
epic: content
size: S
depends_on: [ETH-002]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
`define*` helpers and Zod schemas for terrain, features, classes and races, load-time validation, and just enough definitions for M0.

## Why
Establishes the content pattern before there is much content, so M1's monsters and items follow it. See `docs/ARCHITECTURE.md` §5.

## Acceptance criteria
- [ ] Terrain and feature defs (wall, floor, door, stairs) carry the glyph and color used by the map
- [ ] One class and one race are defined and used to create the M0 adventurer
- [ ] A malformed def and a reference to an unknown id each fail validation with a message naming the def
- [ ] A validation command runs as part of `npm test`

## Notes
All names and text are original (clean-room rule in `CLAUDE.md` §9).

## Log
- 2026-11-16: Created.
