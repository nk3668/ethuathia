---
epic: sim-core
title: Simulation core
status: active
milestones: [M0, M1, M2]
---

## Goal
A deterministic, serializable turn-based simulation that runs the same in a worker, in tests and headless.

## Scope
**In:**
- Core utilities: RNG, Grid, Registry
- Run state, entities, scheduler, commands and events
- Action pipeline, FOV, goal maps
- SimHost (worker and inline)

**Out (later or elsewhere):**
- Decision making (see `adventurer-ai`)
- Floor generation (see `dungeon-gen`)
- Combat and items (see `combat-items`)

## Design refs
- `CLAUDE.md` §5.1: Simulation model
- `docs/ARCHITECTURE.md` §2, §3, §7

## Items
- [x] [ETH-002 Core utilities: seeded RNG streams, Grid and Registry](ETH-002-core-utilities.md)
- [x] [ETH-003 Run state and entity model with serialize round-trip](ETH-003-run-state-entities.md)
- [x] [ETH-004 Energy scheduler and step loop with commands and events](ETH-004-scheduler-step-loop.md)
- [x] [ETH-005 Action pipeline: move, wait and open door](ETH-005-action-pipeline.md)
- [x] [ETH-007 FOV and map memory](ETH-007-fov-map-memory.md)
- [x] [ETH-008 Goal maps (Dijkstra) and pathing](ETH-008-goal-maps-pathing.md)
- [x] [ETH-010 SimHost: inline and Web Worker hosts, snapshot protocol and speed](ETH-010-sim-host.md)
- [x] [ETH-055 Extension seams so feature work lands in per-domain files](ETH-055-extension-seams.md)
- [x] [ETH-058 Multiple floors: stairs, lazily generated floors and a baseline descend rule](ETH-058-multi-floor-descent.md)
- [x] [ETH-062 Run end (victory, retreat, wipe), run trackers, run summary and auto-restart](ETH-062-run-end-summary.md)
- [x] [ETH-079 runStarted carries the first floor's type](ETH-079-run-started-floor-type.md)
- [x] [ETH-120 Run chronicle: a durable list of a run's notable events, kept apart from the event buffer](ETH-120-run-chronicle.md)
- [x] [ETH-113 A creature that never moves on the stairs soft-locks the run](ETH-113-stairs-blocker-softlock.md)
