---
id: ETH-063
title: Upgrade engine and the Town screen with a Guild Hall
type: feature
status: ready
priority: P1
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-059]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
A generic upgrade-tree engine (nodes, costs, prerequisites, pick-one tiers, respec) and a Town tab showing one panel per building, starting with the Guild Hall.

## Why
Every building's tree uses the same engine. See `CLAUDE.md` §4 and `docs/ARCHITECTURE.md` §6.

## Acceptance criteria
- [ ] Upgrade node content defs: building, tier, cost per currency, prerequisites, exclusive group, grants (`bundle`, `unlock`, `capacity`), validated (no cycles, refs exist)
- [ ] Pure `purchase(profile, nodeId)` and `respec(profile, group)` with a respec fee; `canPurchase` returns the reason when not
- [ ] `profileGrants(profile)` collects active grants for `buildRunConfig` and the sim
- [ ] Town tab: building panels, Guild Hall tree drawn as a node graph; tooltips show cost, effect, prerequisites; locked nodes say what they need
- [ ] Guild Hall starter nodes: party size +1 (×3), roster size; numeric nodes share a tier with a capability option
- [ ] Unit tests for purchase, exclusivity, respec; a component test for the tree

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
