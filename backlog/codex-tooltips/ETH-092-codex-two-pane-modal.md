---
id: ETH-092
title: Codex as a wide two-pane modal
type: feature
status: done
priority: P2
milestone: M2
epic: codex-tooltips
size: M
depends_on: [ETH-065]
created: 2026-11-18
updated: 2026-11-19
---

## Summary
The Codex opens as a wide modal: categories and search on the left, the entry page on the right, like a field journal.

## Why
The single column is cramped. Decided in Nate's interview answers (2026-11-18). Matches the original `docs/VISUAL-DESIGN.md` §5.3 design.

## Acceptance criteria
- [x] Modal with list and detail panes; keyboard navigation and focus return
- [x] Tablet width collapses to one pane with a back button
- [x] Room for lore, stats and kill/death counts
- [x] Update `docs/VISUAL-DESIGN.md` §5.3

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Implemented by Gemini (`CodexModal`, `CodexTab` and two-pane `CodexPanel` in `src/ui/codex/CodexPanel.tsx` with Up/Down/Home/End list keyboard navigation, focus return on modal dismissal, single-pane tablet collapse under `NARROW_QUERY` with a `Back to list` button, and field-journal detail page showing large map-colored glyph, lore, encounter record with kill/death counts, and full stat table). Updated `docs/VISUAL-DESIGN.md` §5.3. Pending review.
- 2026-11-20: Review fixes (post-run double-count guard via `simStore.banked`, inert drawer behind the modal, legacy death-line fallback scoped to old records) landed; reviewed by Nate and Claude and merged as PR #78. Done.
