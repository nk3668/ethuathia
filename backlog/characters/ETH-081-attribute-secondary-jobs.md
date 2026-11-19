---
id: ETH-081
title: Give each attribute a second job
type: feature
status: ready
priority: P2
milestone: M1
epic: characters
size: M
depends_on: [ETH-033]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Each attribute gains a second use: Wits helps identify items and spot traps, Grit resists statuses, Finesse helps disarm traps and flee, and Brawn forces stuck or locked doors.

## Why
Every attribute should matter to the AI and to builds. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] New derived stats with sources and tooltips: identify, trap spotting, status resistance, disarm, flee, force doors
- [ ] Grit-based status resistance applies now to timed statuses (ETH-057)
- [ ] Brawn force-door applies to stuck or locked doors when they exist; the other stats are read by ETH-044 (identify), ETH-046 (traps) and flee logic
- [ ] Codex and tooltip text for each new stat
- [ ] Unit tests for the formulas

## Notes
Keep the existing formulas in ATTRIBUTE_FORMULAS unchanged.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
