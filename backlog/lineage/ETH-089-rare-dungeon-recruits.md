---
id: ETH-089
title: Rare adventurers met in the dungeon who join the party
type: feature
status: idea
priority: P3
milestone: M7
epic: lineage
size: M
depends_on: [ETH-068, ETH-116, ETH-119, ETH-122, ETH-123]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
Very rarely, a lost adventurer is found in the dungeon and joins the party at a lower level than the main adventurer. They may exceed the party cap. If they survive the run they join the roster permanently, with a backstory line ("Found shackled on floor 6").

## Why
A rare, exciting find that can bring a class or race not yet unlocked. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] Spawn chance in content, extremely rare (tuned with the sim)
- [ ] Recruit level below the party's highest level
- [ ] Survivors join the roster; the spec decides what happens when the roster is full
- [ ] Log, highlight and Codex text

## Notes
Spec gate.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-116 (dungeon encounters), ETH-119 (adventurer records), ETH-122 (seeded text generator), ETH-123 (allied creatures) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M5 to M7 in the backlog reorganization by theme.
