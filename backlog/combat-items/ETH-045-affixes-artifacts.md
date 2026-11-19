---
id: ETH-045
title: Light affixes and named artifacts
type: feature
status: idea
priority: P2
milestone: M2
epic: combat-items
size: M
depends_on: [ETH-044, ETH-118]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Magic items roll one or two affixes from a small pool, and rare named artifacts have fixed, hand-written properties.

## Why
Loot variety without heavy loot-sorting for the AI. See the gear decision in `CLAUDE.md` §5.3.

## Acceptance criteria
- [ ] Affixes are data (bundles), each with a value range
- [ ] Magic items roll 1–2 affixes; names reflect them
- [ ] Artifacts are unique per run and have Codex entries
- [ ] The AI's item value score accounts for affixes

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-19: Added ETH-118 (item properties) to `depends_on`: build on the shared system instead of a parallel version.
