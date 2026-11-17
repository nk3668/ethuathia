---
id: ETH-058
title: Multiple floors: stairs, lazily generated floors and a baseline descend rule
type: feature
status: ready
priority: P0
milestone: M1
epic: sim-core
size: M
depends_on: [ETH-055]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
The dungeon grows beyond one floor. A `stairs` action moves an actor between floors; floors are generated when first reached; the baseline AI descends once a floor is explored.

## Why
Almost every M1 item (contracts, return trip, depth rewards) needs depth. See `CLAUDE.md` §5.3 and `docs/ARCHITECTURE.md` §3.6.

## Acceptance criteria
- [ ] A run has a dungeon depth (default 10, in the run config). The dungeon graph is a straight line of that length; floor N+1 is generated with the dungeon RNG stream the first time someone reaches it, and floors keep layout and memory
- [ ] `stairs` action (up/down) on a matching stairs tile moves the actor to the linked stairs on the other floor; events + log text
- [ ] Party stays together: the baseline only takes the stairs when the party is gathered (or regroups first); a split party still works in the scheduler
- [ ] Baseline rules: descend when the floor is explored or exploration value is gone, with a per-floor turn cap as a safety net; on the bottom floor, wait (until quests/run-end replace this)
- [ ] Snapshot and top bar show "Floor x/N"; the map follows the selected adventurer's floor
- [ ] Headless harness: report per-floor turns and max depth; a run ends when the party is idle on the bottom floor or hits the cap
- [ ] Fixed-seed sim tests: descend, arrive at the right stairs, revisit a floor unchanged

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
