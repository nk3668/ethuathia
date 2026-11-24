---
id: ETH-036
title: Milestone-gated class and race unlocks bought at the Guild Hall
type: feature
status: idea
priority: P1
milestone: M2
epic: characters
size: M
depends_on: [ETH-034, ETH-063, ETH-121]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
Reaching a milestone in a run (find a spellbook, reach floor 10) makes a class or race available; the player then buys it at the Guild Hall.

## Why
Discovery plus a spending choice. See `CLAUDE.md` §4 (Guild Hall).

## Acceptance criteria
- [ ] Each class and race def has an optional unlock milestone
- [ ] Meeting a milestone logs it and shows it in the run summary
- [ ] The Guild Hall shows locked entries with their milestone and cost

## Notes
- Decided with Nate (2026-11-24): a milestone **reveals** a class or race, and the Guild Hall **sells** it for Renown. Some classes are unlocked through building trees, others through quests. Revealed but unbought classes sometimes appear as random recruits, as a teaser. Classes met as temporary dungeon companions are ETH-089.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Added ETH-121 (shared conditions) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Priority P2 to P1 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: reveal by milestone, buy at the Guild Hall; some unlocks come from building trees or quests; teaser recruits.
