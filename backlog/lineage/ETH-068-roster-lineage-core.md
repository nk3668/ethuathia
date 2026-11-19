---
id: ETH-068
title: Persistent roster, graveyard and Graveyard tab
type: feature
status: idea
priority: P2
milestone: M5
epic: lineage
size: M
depends_on: [ETH-034, ETH-062, ETH-064]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Adventurers persist between runs: survivors return to the roster with their XP and history; the fallen go to the graveyard with an epitaph.

## Why
See `CLAUDE.md` §7 (Roster, Graveyard tab) and principle 4 (Attachment).

## Acceptance criteria
- [ ] Profile roster entries: name, class, race, level, XP, traits, history (runs, deepest floor, kills); capacity from the Guild Hall
- [ ] The Prepare party panel picks from the roster; recruits join the roster
- [ ] `applyRunResult` returns survivors with XP and moves the dead to the graveyard with floor, cause, killer, best item and a generated epitaph
- [ ] Graveyard tab: memorial list with epitaphs
- [ ] Tests for the roster round trip and graveyard entries

## Notes
Acceptance criteria to be refined against the real code before starting (planning gate).

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Rare dungeon recruits (ETH-089) join the roster if they survive.
