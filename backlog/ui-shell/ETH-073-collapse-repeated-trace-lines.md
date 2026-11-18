---
id: ETH-073
title: Collapse repeated identical AI trace lines in the log
type: feature
status: ready
priority: P2
milestone: M1
epic: ui-shell
size: S
depends_on: []
created: 2026-11-18
updated: 2026-11-18
---

## Summary
When the same actor fires the same rule with the same detail on consecutive turns (e.g. waiting), the log shows one line with a repeat count instead of a line per turn.

## Why
Waiting on the bottom floor floods the log (found in ETH-058). See `CLAUDE.md` §8 (Log).

## Acceptance criteria
- [ ] Consecutive identical `ruleFired` lines for one actor collapse into one line with "×N" and the turn range in a tooltip
- [ ] Any other line in between breaks the run; filters still work
- [ ] Component tests

## Log
- 2026-11-18: Created from an ETH-058 follow-up.
