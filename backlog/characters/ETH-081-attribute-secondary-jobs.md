---
id: ETH-081
title: Give each attribute a second job
type: feature
status: done
priority: P2
milestone: M1
epic: characters
size: M
depends_on: [ETH-033]
created: 2026-11-18
updated: 2026-11-19
---

## Summary
Each attribute gains a second use: Wits helps identify items and spot traps, Grit resists statuses, Finesse helps disarm traps and flee, and Brawn forces stuck or locked doors.

## Why
Every attribute should matter to the AI and to builds. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [x] New derived stats with sources and tooltips: identify, trap spotting, status resistance, disarm, flee, force doors
- [x] Grit-based status resistance applies now to timed statuses (ETH-057)
- [x] Brawn force-door applies to stuck or locked doors when they exist; the other stats are read by ETH-044 (identify), ETH-046 (traps) and flee logic
- [x] Codex and tooltip text for each new stat
- [x] Unit tests for the formulas

## Notes
Keep the existing formulas in ATTRIBUTE_FORMULAS unchanged.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Started. The six skills become stat ids (`identify`, `trapSpot`, `statusResist`, `disarm`, `flee`, `forceDoor`), derived by new `ATTRIBUTE_FORMULAS` rows (existing rows unchanged), so gear and statuses can raise them and tooltips get sources for free.
- 2026-11-19: (default) Skill numbers, in percent, base + attribute × per point, capped at 95: Identify 0 + 3×Wits, Trap spotting 10 + 3×Wits, Status resistance 0 + 2×Grit (cap 75), Disarm 20 + 3×Finesse, Flee 40 + 3×Finesse, Force doors 0 + 4×Brawn. A Human Vanguard has 15 / 25 / 28 / 50 / 70 / 48. — any other curve; tune in `ATTRIBUTE_FORMULAS` and `STAT_INFO`.
- 2026-11-19: (default) Status resistance shortens a harmful status by its share of the turns (rounded, at least 1 turn left), with no roll — alternative: a chance to shrug the whole status off.
- 2026-11-19: (default) Flee: breaking away from an adjacent enemy takes a Flee check (one combat-stream draw); failing loses the turn (`fleeFailed`). Fleeing from enemies further off, and creatures without attributes (monsters), always succeed — alternatives: a parting blow instead of a lost turn, or monsters rolling too.
- 2026-11-19: Done. Identify, trap spotting, disarm and force doors have no consumer yet; ETH-044, ETH-046 and stuck/locked doors read them with `statValue`.
