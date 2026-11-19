---
id: ETH-027
title: Gather and Delve contracts
type: feature
status: idea
priority: P2
milestone: M2
epic: quests
size: M
depends_on: [ETH-024, ETH-114]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Gather: collect N magical items of a set type spread across the floors. Delve: reach depth N and get back out.

## Why
More contract variety, each rewarding a different playstyle. See `CLAUDE.md` §6 (Quests).

## Acceptance criteria
- [ ] Gather places at least N of the target item across reachable floors, and progress counts items carried (dropping one lowers it)
- [ ] Delve completes on reaching the target depth
- [ ] Progress shows as "2/5" in the HUD and party cards, with a tooltip
- [ ] The AI picks up gather targets and does not drop them when overloaded

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-19: Added ETH-114 (objective engine) to `depends_on`: build on the shared system instead of a parallel version.
