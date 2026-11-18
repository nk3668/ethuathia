---
id: ETH-062
title: Run end (victory, retreat, wipe), run trackers, run summary and auto-restart
type: feature
status: done
priority: P0
milestone: M1
epic: sim-core
size: M
depends_on: [ETH-058, ETH-059]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Runs end. The sim reports an outcome and a `RunResult`, the UI shows the run summary and waits, and an optional auto-restart starts the next run.

## Why
See `CLAUDE.md` §2 (Ending a run, Core loop).

## Acceptance criteria
- [x] `outcome` slice in `RunState`: `null` while running, then `victory | retreat | wipe` with turn and cause; an `runEnded` event; `step` does nothing after the run ends
- [x] `retreat` command (and `act.retreat_run` rule action) sends the party to the exit; reaching the top exit ends the run as retreat. Victory conditions are a pluggable check list (contracts add theirs in ETH-024); with no checks, walking out is a retreat
- [x] `RunTracker<S>{init, reduce(event)}` framework from ARCHITECTURE §2.4; trackers for depth reached, turns, kills and deaths feed `rewards.atRisk` and the `RunResult`
- [x] Host emits a run-ended message with the `RunResult`; the UI applies it to the Profile via `applyRunResult` and shows the run summary modal (cause of death, currency breakdown, epitaph placeholder)
- [x] Waiting for the player is the default; an auto-restart toggle (Options and the summary) restarts with the previous config after a short timer
- [x] Tests: each outcome, trackers reducing events, headless harness reports outcomes

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Started.
- 2026-11-18: Done. The slice field is `state.domains.run.end` (`RunEnd { outcome, turn, cause, depth }`), beside `leaving`, `fallen`, `started` and the tracker states; `STATE_VERSION` 9. Trackers gain optional `rewards(state)` (summed into `rewards.atRisk` after every step) and `extras(state)` (default: the state, into `RunResult.extras[id]`). Victory checks are `SimDomain.victoryChecks` → `VICTORY_CHECKS`. The party leaves together through the first floor's up stairs (`leftDungeon`); the baseline turns back on the bottom floor (`cond.bottom_floor → act.retreat_run`). A `runStarted` event lets the Codex discover the party's classes and races. Hosts call `onRunEnded(report)`; the profile gained a `settings` slice with `autoRestart`.
- 2026-11-18: (default) Base reward constants: 10 Renown per floor reached below the first, 1 Renown per 50 game turns — alternatives: Renown growing with depth (triangular), or per turn on the deepest floor only.
- 2026-11-18: (default) Auto-restart waits 5 s and starts the same config with a new seed (a fixed seed counts up) — alternatives: the same seed again; a shorter or configurable timer.
- 2026-11-18: (default) The party leaves the dungeon together: the exit is refused until every living member is gathered at it — alternatives: members leave one at a time and the run ends when the last living one is out.
- 2026-11-18: (default) The run domain emits `fell` for any party member whose HP reaches 0, whatever the cause, so wipe detection doesn't depend on combat — alternative: combat's own death event (ETH-060) drives it.
- 2026-11-18: Skipped moving the ETH-047 auto-pause choices into the profile's `settings` slice (optional); left as a follow-up.
