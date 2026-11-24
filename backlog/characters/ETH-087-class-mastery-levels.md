---
id: ETH-087
title: Class Mastery XP: every run banks XP toward a guild-wide level per class
type: feature
status: idea
priority: P1
milestone: M2
epic: characters
size: M
depends_on: [ETH-034, ETH-119]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
Each class has one guild-wide Mastery level, and from M2 on every run adds Mastery XP to it. Adventurer levels reset each run, so Mastery is the lasting power a run earns for a class. The talent points it grants are spent in M4 (ETH-088); until then they bank up.

## Why
With levels resetting (Nate, 2026-11-24), each run has to leave something behind for its classes. Counting from M2 means runs played before the trees arrive still count. See `CLAUDE.md` §4 (Class Mastery and talents).

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] Profile slice with Mastery XP per class, and a save migration
- [ ] Mastery XP for a run = each member's in-run XP (the fallen included) plus a run-end bonus that grows with depth reached and objectives completed
- [ ] Same-class diminishing returns within one run: the 1st to 4th adventurer of a class contribute 100% / 75% / 50% / 25%, ordered by XP earned
- [ ] Temporary companions contribute 50% (hook only; companions arrive with ETH-089)
- [ ] An endless level curve: a solid run that completes every objective earns about 5 levels' worth at the start, and less as the curve rises (the curve is one tunable table)
- [ ] The run summary shows Mastery XP gained and levels reached per class, and the Guild Hall shows each class's Mastery level and banked points
- [ ] Tests: living and fallen contributions, diminishing returns, run-end bonus, migration

## Notes
Spec gate: write detailed criteria against the real code and get Nate's approval first. The curve's targets get checked by ETH-161 (economy pacing).

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-119 (adventurer records) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M2 to M4 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: levels reset each run and Mastery XP starts counting in M2, so this item moves back to M2 as XP tracking only. The trees and spending stay in M4 (ETH-088). Added diminishing returns, run-end bonus, companion share; dropped the ETH-086 dependency.
