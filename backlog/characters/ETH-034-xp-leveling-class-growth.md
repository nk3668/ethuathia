---
id: ETH-034
title: XP, leveling and per-class attribute growth
type: feature
status: idea
priority: P1
milestone: M1
epic: characters
size: M
depends_on: [ETH-033]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Adventurers gain XP from kills and depth, level up, and gain attributes according to their class.

## Why
Growth within a run and across runs for roster adventurers. See `CLAUDE.md` §7.

## Acceptance criteria
- [ ] Each class defines attribute gains per level
- [ ] Level-up emits an event and a log line, and party cards show level and XP
- [ ] Leveling is deterministic for a given seed
- [ ] Sim test: a fixed-seed fight levels an adventurer with the expected stats

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
