---
id: ETH-008
title: "Goal maps (Dijkstra) and pathing"
type: feature
status: ready
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
- [ ] Distances are correct on hand-built maps, including multiple goals and unreachable tiles
- [ ] A "next step toward" helper returns a neighbor with lower distance, with deterministic tie-breaking
- [ ] The passability rule is a parameter (e.g. treat closed doors as passable at extra cost)
- [ ] A 80×40 floor builds a map fast enough to do every turn (benchmark recorded in the item Log)

## Notes
Caching and invalidation can wait until profiling shows a need.

## Log
- 2026-11-16: Created.
