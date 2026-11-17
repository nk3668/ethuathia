---
id: ETH-015
title: "Content registry with validation and first definitions"
type: feature
status: done
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
- [x] Terrain and feature defs (wall, floor, door, stairs) carry the glyph and color used by the map
- [x] One class and one race are defined and used to create the M0 adventurer
- [x] A malformed def and a reference to an unknown id each fail validation with a message naming the def
- [x] A validation command runs as part of `npm test`

## Notes
All names and text are original (clean-room rule in `CLAUDE.md` §9).

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. Added Zod (bundled) and `src/content` kinds for terrain, features, classes, races and floor types, each a registry, schema and `define*` helper; `checkKinds` reports shape errors and unknown ids naming the def and field. First defs: wall, floor, door, stairs up/down (glyphs now drawn from them), class Vanguard, race Human; `createRun` takes HP, MP and speed from class and race. The sim's `validateGame` adds generation steps, step params, sim ids and baseline rules, runs at app start-up, and `tools/validate-content` runs it in `npm test` (and `npm run validate:content`). Party cards and map tooltips now use def names. Replaced the NetHack class name in the design doc mock-ups and kit gallery.
