---
id: ETH-037
title: A signature ability per class
type: feature
status: idea
priority: P2
milestone: M4
epic: characters
size: M
depends_on: [ETH-034, ETH-057]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
Each class gets one active ability (a taunt, a heal, a volley, a spell), usable by rules and the baseline AI.

## Why
Gives each class a clear role in a fight. See `CLAUDE.md` §5.2.

## Acceptance criteria
- [ ] Abilities are data built from effects, with costs and cooldowns
- [ ] A rule action can use a class ability
- [ ] Codex, tooltip and log text for each ability

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-24: Moved from M3 to M4 in the backlog reorganization by theme.
