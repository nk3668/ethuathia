---
id: ETH-070
title: Patron deities with a blessing, a taboo and Favor
type: feature
status: idea
priority: P2
milestone: M8
epic: deities
size: M
depends_on: [ETH-064, ETH-067, ETH-114, ETH-115, ETH-116, ETH-121]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
The player can choose a patron deity before a run. The patron grants a blessing, imposes a taboo, and earns Favor for that deity.

## Why
See `CLAUDE.md` §6 (Deities). ETH-051 (patron boon at graves) needs patrons.

## Acceptance criteria
- [ ] Deity defs: blessing bundle, taboo (a conduct id from ETH-067), Favor rules; two original starter deities
- [ ] Prepare patron panel (optional choice); the patron is stored on the run and on each adventurer's history
- [ ] Breaking the taboo logs it and costs Favor; honoring the patron earns Favor for that deity
- [ ] `pray` action and rule action with a cooldown and a small effect
- [ ] Codex, tooltip and log text; tests for the blessing, taboo and Favor

## Notes
Acceptance criteria to be refined against the real code before starting (planning gate). Altars, sacrifice and devotion trees stay out of scope.

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-19: Added ETH-114 (objective engine), ETH-115 (run-wide modifiers), ETH-116 (dungeon encounters), ETH-121 (shared conditions) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M6 to M8 in the backlog reorganization by theme.
