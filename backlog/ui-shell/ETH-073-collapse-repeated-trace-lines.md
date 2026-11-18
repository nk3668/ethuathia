---
id: ETH-073
title: Collapse repeated identical AI trace lines in the log
type: feature
status: done
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
- [x] Consecutive identical `ruleFired` lines for one actor collapse into one line with "×N" and the turn range in a tooltip
- [x] Any other line in between breaks the run; filters still work
- [x] Component tests

## Log
- 2026-11-18: Created from an ETH-058 follow-up.
- 2026-11-18: Started.
- 2026-11-18: Done. `logLines` (`ui/shell/text.ts`) already left out decisions that continue an adventurer's goal; it now counts the ones identical to the last shown line (same rule, rule action and detail, nothing shown since) on that line as `repeat: { count, lastTurn }`. `LogPanel` shows a muted `×N` with a tooltip and screen-reader text "Repeated N times, turns A to B." Tests in `test/ui/logRepeat.test.tsx`.
- 2026-11-18: (default) Another adventurer's shown line ends the run, but their left-out (unchanged-goal) decisions don't — alternatives: count per adventurer regardless of other lines.
- 2026-11-18: (default) A same-goal decision with a different detail is still left out (as before) and ends the count; a later identical one isn't counted — alternatives: show detail changes as new lines.
