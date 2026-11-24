---
id: ETH-026
title: Slay-named-foe contract
type: feature
status: idea
priority: P2
milestone: M6
epic: quests
size: M
depends_on: [ETH-024, ETH-041, ETH-114]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
A contract to find and kill a named unique on a specific floor.

## Why
A combat-focused goal with a memorable target. See `CLAUDE.md` §6 (Quests).

## Acceptance criteria
- [ ] The contract names its target unique and floor, shown on the Prepare screen and in the party cards' intent
- [ ] Dungeon gen guarantees the unique on that floor
- [ ] Killing it completes the contract, with a log line and a run-summary entry
- [ ] The AI goes to the target floor and treats the unique as an objective when seen

## Notes
- Should the unique drop a trophy item that must also be carried out? Decide when the item is made ready.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-19: Added ETH-114 (objective engine) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M2 to M6 in the backlog reorganization by theme.
