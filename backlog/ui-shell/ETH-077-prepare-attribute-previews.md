---
id: ETH-077
title: Show attribute previews in the Prepare screen's class and race selects
type: feature
status: pending-review
priority: P3
milestone: M2
epic: ui-shell
size: S
depends_on: [ETH-064, ETH-033]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-19
---

## Summary
Choosing a class or race on the Prepare screen shows the resulting attributes and derived stats before the run starts.

## Why
Readability (`CLAUDE.md` §1). Follow-up from ETH-064.

## Acceptance criteria
- [x] Each class and race option shows its attribute modifiers
- [x] A preview line shows the four attributes and HP/MP for the current pick
- [x] Component test for the preview

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Assigned to Antigravity as a low-risk item.
- 2026-11-19: **Gemini** implemented and marked `pending-review`. `(default)` choices: (a) partial/Random selections show class-only `(before race)`, race-only `(before class)`, or `"Attributes rolled on descent"` when both are Random instead of resolving single-option pools; (b) preview displays base class + race HP/MP without town upgrades (which appear in the adjacent Town panel).
