---
id: ETH-006
title: "Dungeon gen pipeline: rooms-and-corridors floor"
type: feature
status: done
priority: P0
milestone: M0
epic: dungeon-gen
size: M
depends_on: [ETH-002]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The `GenStep` pipeline and the steps for a classic rooms-and-corridors floor with doors and stairs.

## Why
M0 needs one real floor to explore, and the pipeline is how every later floor type is built. See `docs/ARCHITECTURE.md` §3.6.

## Acceptance criteria
- [x] A floor type is a list of step ids with parameters; steps come from a registry
- [x] Steps exist for room layout, corridor connection, door placement and stairs placement
- [x] Every generated floor is fully connected: a test floods from the up stairs across 200 seeds and reaches every floor tile and the down stairs
- [x] The same seed produces the same floor; generation uses only the `dungeon` RNG stream

## Notes
Print floors as text in tests for easy eyeballing.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. Floor types are content in `src/content/floors.ts` (first: `floor.halls`). The steps `gen.rooms`, `gen.corridors`, `gen.doors` and `gen.stairs` live in the sim's `GEN_STEPS` registry, built with `defineGenStep` so their params are checked before anything runs. `createRun` now generates the first floor from the `dungeon` stream and the built-in `M0_FLOOR` is gone (`floorText` still takes a hand-built floor). `planToText` prints generated floors, and seed 1's floor is pinned in `test/sim/gen.test.ts`.
