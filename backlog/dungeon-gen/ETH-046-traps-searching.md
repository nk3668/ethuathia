---
id: ETH-046
title: Traps and searching
type: feature
status: idea
priority: P3
milestone: M6
epic: dungeon-gen
size: M
depends_on: [ETH-057, ETH-058, ETH-060]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
Hidden traps on floors, a search action, and trap knowledge from the Cartographer.

## Why
More dungeon risk the player can plan around. See `CLAUDE.md` §4 (Cartographer).

## Acceptance criteria
- [ ] Trap defs (effect, detection difficulty) in content, placed by floor gen
- [ ] Found traps are remembered and avoided by pathing
- [ ] A search action and a rule action to search
- [ ] Log, Codex and tooltip text for each trap

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Trap spotting reads Wits and disarming reads Finesse (ETH-081).
- 2026-11-24: Moved from M4 to M6 in the backlog reorganization by theme.
