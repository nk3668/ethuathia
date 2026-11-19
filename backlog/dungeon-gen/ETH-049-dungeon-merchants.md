---
id: ETH-049
title: Dungeon merchants
type: feature
status: idea
priority: P3
milestone: M6
epic: dungeon-gen
size: M
depends_on: [ETH-043, ETH-061, ETH-116]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Occasional merchants inside the dungeon who trade items for gold found in the run.

## Why
Gives in-run loot a use beyond equipping. See `CLAUDE.md` §6 (Floor variety).

## Acceptance criteria
- [ ] Floor gen can place a merchant with seeded stock
- [ ] A rule action and baseline behavior for buying (best upgrade within budget) and selling junk
- [ ] Log text for trades

## Notes
- Needs an in-run gold item, which doesn't exist yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Added ETH-116 (dungeon encounters) to `depends_on`: build on the shared system instead of a parallel version.
