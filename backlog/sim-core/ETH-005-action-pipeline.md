---
id: ETH-005
title: "Action pipeline: move, wait and open door"
type: feature
status: ready
priority: P0
milestone: M0
epic: sim-core
size: S
depends_on: [ETH-004]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The `ActionDef` registry with validate and execute, and the first three actions.

## Why
Actions are the only way the world changes, shared by AI, rules, monsters and possession. See `docs/ARCHITECTURE.md` §2.3.

## Acceptance criteria
- [ ] An action request is validated before it runs; an invalid one returns a reason and changes nothing
- [ ] Move respects walls, closed doors and occupied tiles, and emits `moved`
- [ ] Open door changes the door feature and emits an event; wait only spends energy
- [ ] Each action has an energy cost that the scheduler charges

## Notes
None yet.

## Log
- 2026-11-16: Created.
