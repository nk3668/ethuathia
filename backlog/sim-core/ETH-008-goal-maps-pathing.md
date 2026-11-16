---
id: ETH-008
title: "Goal maps (Dijkstra) and pathing"
type: feature
status: done
priority: P0
milestone: M0
epic: sim-core
size: S
depends_on: [ETH-002]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
`buildGoalMap` over a floor grid, with helpers to step toward or away from goals.

## Why
One pathing tool serves exploring, fleeing, stairs, regrouping and monster chase. See `docs/ARCHITECTURE.md` §2.5.

## Acceptance criteria
- [x] Distances are correct on hand-built maps, including multiple goals and unreachable tiles
- [x] A "next step toward" helper returns a neighbor with lower distance, with deterministic tie-breaking
- [x] The passability rule is a parameter (e.g. treat closed doors as passable at extra cost)
- [x] A 80×40 floor builds a map fast enough to do every turn (benchmark recorded in the item Log)

## Notes
Caching and invalidation can wait until profiling shows a need.

Step rules must match the move action, or the AI will plan paths it can't walk. Reuse
`stepBlocker` from `src/sim/actions.ts` (walls, closed doors, no diagonal steps into or out of a
doorway), or a fast equivalent tested against it. Closed doors are the passability parameter's
main case: the AI opens them on the way.

As built (`src/sim/goalMap.ts`, details in `docs/ARCHITECTURE.md` §2.5):

- The passability rule is a `PathGrid` (per-tile step cost, 0 = blocked, plus a doorway mask)
  built by `floorPathGrid` (the real floor) or `memoryPathGrid` (what the party remembers, which
  is what ETH-009 should use). Both take `{ closedDoorCost }`, `null` by default.
- `canStep` is the fast equivalent of `stepBlocker`. A test compares them for every tile and all
  eight directions on a hand-built map and six generated floors, with doors blocking and with a
  door cost. Removing the doorway rule from `canStep` fails four tests.
- Maps are `i32` grids rather than the `i16` the doc first said, so weighted costs can't overflow.
- `stepToward` picks the cheapest route (neighbor value + step cost), not just the lowest
  neighbor; with a costly door the two differ, and a test covers it.
- "Step away" is `buildFleeMap` (scale by -1.2 and relax again) rather than naive uphill, which
  walks into dead ends; a test shows the difference.
- `npm run bench` runs `test/sim/goalMap.bench.ts` (Vitest 5's `bench` test-context fixture;
  `npm test` skips it).

## Log
- 2026-11-16: Created.
- 2026-11-16: Started and finished. Benchmark on an 80×40 floor (mean per call, Node 24, dev
  machine): open room `buildGoalMap` 0.36 ms, with `floorPathGrid` 0.37 ms, `buildFleeMap`
  0.60 ms; rooms-and-corridors floor with `floorPathGrid` 0.077 ms, with `memoryPathGrid`
  0.028 ms (only the start room known). Well under a millisecond, so maps can be rebuilt every
  turn and there is no cache.
