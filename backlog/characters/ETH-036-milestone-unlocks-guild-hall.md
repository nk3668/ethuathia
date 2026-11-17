---
id: ETH-036
title: Milestone-gated class and race unlocks bought at the Guild Hall
type: feature
status: idea
priority: P2
milestone: M2
epic: characters
size: M
depends_on: [ETH-034, ETH-063]
created: 2026-11-17
updated: 2026-11-17
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
- CLAUDE.md §4 says unlocks start random, then become selectable. Reconcile that text when this item is made ready.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
