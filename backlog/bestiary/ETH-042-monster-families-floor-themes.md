---
id: ETH-042
title: Monster families and floor themes
type: feature
status: idea
priority: P2
milestone: M5
epic: bestiary
size: M
depends_on: [ETH-040, ETH-065, ETH-117]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
Monsters belong to families (vermin, undead, beasts, cultists…) and floors pick a themed mix.

## Why
Floors feel distinct and the Codex groups well. See `CLAUDE.md` §6 (Floor variety).

## Acceptance criteria
- [ ] Family is data on monster defs
- [ ] Floor gen picks spawns weighted by the floor's theme
- [ ] Codex groups monsters by family

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Added ETH-117 (monster templates) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M2 to M5 in the backlog reorganization by theme.
