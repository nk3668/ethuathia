---
id: ETH-041
title: Named uniques and bosses
type: feature
status: idea
priority: P2
milestone: M2
epic: bestiary
size: M
depends_on: [ETH-040, ETH-065, ETH-117]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Hand-written unique monsters with names, abilities and Codex entries.

## Why
Memorable foes for the Slay contract and mini-bosses. See `CLAUDE.md` §6.

## Acceptance criteria
- [ ] Unique defs with abilities built from effects
- [ ] A unique appears at most once per run
- [ ] Codex entry unlocks on first sighting; kills are recorded

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Ethan, an extremely rare and very weak boss, is filed as ETH-109.
- 2026-11-19: Added ETH-117 (monster templates) to `depends_on`: build on the shared system instead of a parallel version.
