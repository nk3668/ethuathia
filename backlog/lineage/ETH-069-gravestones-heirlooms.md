---
id: ETH-069
title: Gravestones and heirlooms in the dungeon
type: feature
status: idea
priority: P2
milestone: M5
epic: lineage
size: M
depends_on: [ETH-068, ETH-058, ETH-043]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
A fallen adventurer's grave appears on the floor where they died in later runs, holding their heirloom (best item).

## Why
See `CLAUDE.md` §7 (Gravestones). ETH-051 and ETH-032 build on it.

## Acceptance criteria
- [ ] Graveyard entries record the dungeon depth and heirloom item instance
- [ ] A gen step places graves (feature) on matching depths, a capped number per floor, seeded
- [ ] Interacting with a grave takes the heirloom; the Ossuary heirloom-slot count limits how many heirlooms persist
- [ ] Map glyph, inspect tooltip, Codex and log text
- [ ] Hand-map sim tests for placement and taking the heirloom

## Notes
Acceptance criteria to be refined against the real code before starting (planning gate). Ghosts stay out of scope.

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
