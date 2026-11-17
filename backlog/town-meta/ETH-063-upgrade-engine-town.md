---
id: ETH-063
title: Upgrade engine and the Town screen with a Guild Hall
type: feature
status: done
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
- [x] Upgrade node content defs: building, tier, cost per currency, prerequisites, exclusive group, grants (`bundle`, `unlock`, `capacity`), validated (no cycles, refs exist)
- [x] Pure `purchase(profile, nodeId)` and `respec(profile, group)` with a respec fee; `canPurchase` returns the reason when not
- [x] `profileGrants(profile)` collects active grants for `buildRunConfig` and the sim
- [x] Town tab: building panels, Guild Hall tree drawn as a node graph; tooltips show cost, effect, prerequisites; locked nodes say what they need
- [x] Guild Hall starter nodes: party size +1 (×3), roster size; numeric nodes share a tier with a capability option
- [x] Unit tests for purchase, exclusivity, respec; a component test for the tree

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-17: Started.
- 2026-11-17: Done. Content kinds `building` and `upgrade` (`src/content/upgrades.ts`, buildings under `src/content/town/`), engine in `src/meta/upgrades.ts`, `upgrades` profile slice, Town tab in `src/ui/town/`. Bundle grants use a placeholder `GrantBundle` until ETH-057 lands.
- 2026-11-17: (default) A respec refunds the full price of every node it gives up (the chosen node plus owned nodes that need it) and keeps a fee of 50% of the chosen node's cost, rounded up — alternatives: no refund and a flat fee; a fee per building.
- 2026-11-17: (default) Guild Hall costs are Renown only (50 / 80 / 120 / 250 / 400 / 600) — to be tuned once runs earn Renown.
