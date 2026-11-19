---
id: ETH-030
title: Bounty encounters inside the dungeon
type: feature
status: idea
priority: P3
milestone: M4
epic: quests
size: M
depends_on: [ETH-029, ETH-114, ETH-116]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Some bounties are found during the run, such as a captive asking for rescue or a strange shrine with a request.

## Why
Surprises mid-run without setup. See `CLAUDE.md` §6 (Quests).

## Acceptance criteria
- [ ] Dungeon gen can place a bounty encounter feature, seeded
- [ ] Interacting with it adds a bounty to the run, with a log line
- [ ] Encounter bounties work the same as board bounties once added

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-19: Added ETH-114 (objective engine), ETH-116 (dungeon encounters) to `depends_on`: build on the shared system instead of a parallel version.
