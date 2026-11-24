---
id: ETH-162
title: Rules editor and the rule data model
type: feature
status: idea
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-009, ETH-121]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Player-ordered Condition → Action rules per adventurer, evaluated before the baseline AI, with an editor in the Rules tab.

## Why
Behavior rules are the main progression system (`CLAUDE.md` §5.2), and no item built them yet. See `docs/VISUAL-DESIGN.md` §5.1.

## Acceptance criteria
- [ ] The sim evaluates rules top to bottom; the first rule that is true and valid fires, otherwise the baseline runs (`CLAUDE.md` §5.1)
- [ ] The editor offers condition and action dropdowns, an enable toggle and drag to reorder
- [ ] Each row shows a last-fired indicator and a hit count
- [ ] Rules can be edited mid-run; the AI log line names the rule that fired
- [ ] Rule sets are saved with the profile

## Notes
Needs decomposing before work starts: likely sim model and evaluation, vocabulary, editor UI, and persistence.

## Log
- 2026-11-24: Created in the backlog reorganization by theme (gap: no item built the editor).
