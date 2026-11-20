---
id: ETH-091
title: Codex hints for undiscovered entries and kill-count tiers
type: feature
status: pending-review
priority: P2
milestone: M2
epic: codex-tooltips
size: M
depends_on: [ETH-065]
created: 2026-11-18
updated: 2026-11-23
---

## Summary
Undiscovered entries show their glyph and a riddle-like hint instead of full details. Monster entries reveal more as the player kills more of them: basics at 1 kill, full stats at 10, lore and drops at 50.

## Why
Makes the Codex a collection to fill in. Decided in Nate's interview answers (2026-11-18). Replaces ETH-065's default of full details for ??? entries.

## Acceptance criteria
- [x] Content definitions get a `hint` text, validated at load
- [x] Explain tooltips for undiscovered entries show only glyph and hint
- [x] Kill counts per monster kind in the profile; tiers at 1/10/50
- [x] Tests for each tier

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Implemented by Gemini (`hint` field on `Def` and `defShape` with load-time `checkDefHints` validation across all discoverable content defs; `KILLS_TRACKER.byMonster` and `codexSlice` v2 `kills` with v1→v2 migration; `Explain` tooltips and `CodexPanel` showing only map glyph and riddle hint for undiscovered entries; monster kill-count tiers at 1/10/50 in `src/ui/codex/renderers/monster.tsx`; bumped `STATE_VERSION` to 27). Pending review.
- 2026-11-23: Rebased onto main (STATE_VERSION 30; added Codex hints for ETH-044 scrolls and enchantments) and merged to main (PR #79); PENDING REVIEW.
