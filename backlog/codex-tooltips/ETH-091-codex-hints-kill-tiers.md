---
id: ETH-091
title: Codex hints for undiscovered entries and kill-count tiers
type: feature
status: ready
priority: P2
milestone: M2
epic: codex-tooltips
size: M
depends_on: [ETH-065]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Undiscovered entries show their glyph and a riddle-like hint instead of full details. Monster entries reveal more as the player kills more of them: basics at 1 kill, full stats at 10, lore and drops at 50.

## Why
Makes the Codex a collection to fill in. Decided in Nate's interview answers (2026-11-18). Replaces ETH-065's default of full details for ??? entries.

## Acceptance criteria
- [ ] Content definitions get a `hint` text, validated at load
- [ ] Explain tooltips for undiscovered entries show only glyph and hint
- [ ] Kill counts per monster kind in the profile; tiers at 1/10/50
- [ ] Tests for each tier

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
