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
Very rarely, a lost adventurer is found in the dungeon and joins the party for the rest of the run at a lower level than the party's best. They may exceed the party cap and may be of a class the guild has not unlocked. They earn 50% Mastery XP for their class (ETH-087). They leave after the run, unless their class is unlocked during that run, in which case they join the roster with a backstory line ("Found shackled on floor 6").

## Why
A rare, exciting find that can bring a class or race not yet unlocked. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] Spawn chance in content, extremely rare (tuned with the sim)
- [ ] Recruit level below the party's highest level
- [ ] Companions leave after the run unless their class was unlocked during it; then they join the roster (the spec decides what happens when the roster is full)
- [ ] Companions add 50% Mastery XP to their class
- [ ] Log, highlight and Codex text

## Notes
Spec gate.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-116 (dungeon encounters), ETH-119 (adventurer records), ETH-122 (seeded text generator), ETH-123 (allied creatures) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M5 to M7 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: companions leave after the run unless their class is unlocked during it; they earn 50% Mastery XP; they can be of a locked class.
