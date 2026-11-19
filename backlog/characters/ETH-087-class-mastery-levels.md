---
id: ETH-087
title: Class Mastery: a shared level per class that earns tree points
type: feature
status: idea
priority: P2
milestone: M2
epic: characters
size: M
depends_on: [ETH-034, ETH-086, ETH-119]
created: 2026-11-18
updated: 2026-11-19
---

## Summary
Each class has one guild-wide Mastery level. Every adventurer of that class earns Mastery XP for it during runs, the fallen included. Each Mastery level grants about one point for that class's Tactics tree.

## Why
Gives each class its own progression that survives permadeath. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] Mastery XP per class in the profile, with a save migration
- [ ] Mastery levels and points show in the Guild Hall and the run summary
- [ ] Tests for XP from living and fallen adventurers

## Notes
Spec gate: write detailed acceptance criteria against the real code and get Nate's approval before an agent builds it.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-119 (adventurer records) to `depends_on`: build on the shared system instead of a parallel version.
