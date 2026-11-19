---
id: ETH-034
title: XP, leveling and per-class attribute growth
type: feature
status: done
priority: P1
milestone: M1
epic: characters
size: M
depends_on: [ETH-033, ETH-060]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Adventurers gain XP from kills and depth, level up, and gain attributes according to their class.

## Why
Growth within a run and across runs for roster adventurers. See `CLAUDE.md` §7.

## Acceptance criteria
- [x] Each class defines attribute gains per level
- [x] Level-up emits an event and a log line, and party cards show level and XP
- [x] Leveling is deterministic for a given seed
- [x] Sim test: a fixed-seed fight levels an adventurer with the expected stats

## Notes
- As built: `src/sim/stats/leveling.ts`, `ClassDef.growth`, the `growth` entity part, events
  `xpGained` / `leveledUp`, the `track.xp` tracker (per actor and per class, for ETH-087 Mastery
  and ETH-068 roster). docs/ARCHITECTURE.md Contracts, "Stats", has the API.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Adventurer XP also feeds the guild-wide class Mastery level (ETH-087).
- 2026-11-18: Started (in-progress).
- 2026-11-18: (default) Growth is fixed per class, with fractional rates (`floor(rate × (L − 1))`), no random rolls — alternatives: a seeded roll per level, or weighted random points.
- 2026-11-18: (default) Kill XP goes only to the adventurer who strikes the killing blow (4 × threat) — alternatives: split across the party, or everyone on the floor.
- 2026-11-18: (default) Depth XP is 5 × depth to every living member on each new deepest floor; level L → L + 1 costs 15 × L; max level 20 — numbers to tune.
- 2026-11-18: (default) A level-up raises current HP/MP by what the maximum gained, no full heal — alternative: full heal on level-up.
- 2026-11-18: Done. Level growth is an attribute part credited to the class ("Level N") rather than written into `stats.attributes`; no separate stat provider was needed.
