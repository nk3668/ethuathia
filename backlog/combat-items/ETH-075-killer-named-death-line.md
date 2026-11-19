---
id: ETH-075
title: Name the killer in the death log line and the wipe summary
type: feature
status: ready
priority: P2
milestone: M1
epic: combat-items
size: S
depends_on: [ETH-060, ETH-062]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
When an adventurer dies, the log says what killed them, and the run summary of a wipe names the killer of each fallen adventurer.

## Why
Design principle 3 in `CLAUDE.md` §1: every death has a clear cause in the log. Follow-up from ETH-060.

## Acceptance criteria
- [ ] The `fell` event (or the death event) carries the killer's id, name and kind (monster, trap, status)
- [ ] The log line reads e.g. "Mira is slain by a cave hound on floor 4"
- [ ] The wipe run summary lists each fallen adventurer with their killer
- [ ] Sim test with a fixed seed and hand-built map checks the event and the text

## Notes
Status deaths (poison) should name the source of the status when known.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
