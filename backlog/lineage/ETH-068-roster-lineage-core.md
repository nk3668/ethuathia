---
id: ETH-068
title: Persistent roster, graveyard and Graveyard tab
type: feature
status: idea
priority: P2
milestone: M7
epic: lineage
size: M
depends_on: [ETH-034, ETH-062, ETH-064, ETH-119, ETH-120, ETH-122]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
Adventurers persist between runs: survivors return to the roster with their XP and history; the fallen go to the graveyard with an epitaph.

## Why
See `CLAUDE.md` §7 (Roster, Graveyard tab) and principle 4 (Attachment).

## Acceptance criteria
- [ ] The roster lists active ETH-119 records: name, class, race, peak level, traits, titles, history; capacity from the Guild Hall
- [ ] The Prepare party panel picks from the roster; recruits join the roster
- [ ] `applyRunResult` returns survivors (levels reset to 1 each run) and moves the dead to the graveyard with floor, cause, killer, best item and a generated epitaph
- [ ] Graveyard tab: memorial list with epitaphs
- [ ] Tests for the roster round trip and graveyard entries

## Notes
Acceptance criteria to be refined against the real code before starting (planning gate).

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Rare dungeon recruits (ETH-089) join the roster if they survive.
- 2026-11-19: Added ETH-119 (adventurer records), ETH-120 (run chronicle), ETH-122 (seeded text generator) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M5 to M7 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: levels reset each run; survivors return with history, traits and titles only.
