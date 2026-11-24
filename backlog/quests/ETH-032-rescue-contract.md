---
id: ETH-032
title: Rescue contract
type: feature
status: idea
priority: P3
milestone: M7
epic: quests
size: M
depends_on: [ETH-024, ETH-068, ETH-069, ETH-114]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
A contract to bring back a lost adventurer, or to recover a fallen adventurer's heirloom from their grave.

## Why
Ties quests into Lineage. See `CLAUDE.md` §6 (Quests) and §7.

## Acceptance criteria
- [ ] Offered only when the roster or graveyard has a valid target
- [ ] Rescued adventurers return to the roster; recovered heirlooms return to the Ossuary
- [ ] Log and run-summary text name the adventurer

## Notes
- Depends on the roster and gravestone items (M5), which don't exist yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Added ETH-114 (objective engine) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M5 to M7 in the backlog reorganization by theme.
