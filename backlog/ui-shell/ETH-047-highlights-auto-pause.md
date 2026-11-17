---
id: ETH-047
title: Highlights feed and optional auto-pause
type: feature
status: done
priority: P2
milestone: M2
epic: ui-shell
size: M
depends_on: [ETH-055]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
A feed of notable moments (boss engaged, near death, heirloom found, contract complete), with optional auto-pause on chosen kinds.

## Why
In an idle game the player shouldn't miss the big moments. See `CLAUDE.md` §1 (Readable).

## Acceptance criteria
- [x] Sim events are tagged as highlights by kind
- [x] A Highlights log filter, and clicking an entry centers the map where it happened
- [x] Options let the player pick which kinds auto-pause the game; all are off by default

## Notes
- Highlights are tagged on log-text entries (`highlight: <HighlightKind>`, optional
  `highlightWhen`), declared with `defineHighlight` in each domain's `ui/shell/logText/<domain>.ts`.
  `HIGHLIGHT_KINDS` is collected from `LOG_TEXT`, so later items only tag their events
  (docs/ARCHITECTURE.md, Contracts, "Log text").
- A highlighted event must carry `floor` and `pos` (enforced by the type of `highlight`). The
  `stuck` event gained both; it is the only highlight kind so far.
- Auto-pause choices live in `uiStore.autoPause` (localStorage) until the profile's settings
  slice exists (follow-up; ETH-059 shipped without one).

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-17: Started.
- 2026-11-17: (default) Highlight kinds are declared next to the log text, not in the sim — alternative: a `highlight` field on the sim events themselves.
- 2026-11-17: (default) Only `stuck` is a highlight for now; door openings, failed actions and rejected commands are not — alternative: also tag failed actions.
- 2026-11-17: (default) Auto-pause also centers the map on the moment and shows "Auto-paused: (kind)" in the log header until resumed — alternative: pause only.
- 2026-11-17: (default) Auto-pause choices persist in `uiStore` (localStorage); ETH-059 landed without a settings slice, so moving them to a profile settings slice is a follow-up — alternative: add that slice here.
- 2026-11-17: Done. Log filter All / Highlights, clickable highlight lines that center and mark the map, Options auto-pause checkboxes (all off), `watchAutoPause` bound in `App`.
