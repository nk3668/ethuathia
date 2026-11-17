---
id: ETH-062
title: Run end (victory, retreat, wipe), run trackers, run summary and auto-restart
type: feature
status: ready
priority: P0
milestone: M1
epic: sim-core
size: M
depends_on: [ETH-058, ETH-059]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Runs end. The sim reports an outcome and a `RunResult`, the UI shows the run summary and waits, and an optional auto-restart starts the next run.

## Why
See `CLAUDE.md` §2 (Ending a run, Core loop).

## Acceptance criteria
- [ ] `outcome` slice in `RunState`: `null` while running, then `victory | retreat | wipe` with turn and cause; an `runEnded` event; `step` does nothing after the run ends
- [ ] `retreat` command (and `act.retreat_run` rule action) sends the party to the exit; reaching the top exit ends the run as retreat. Victory conditions are a pluggable check list (contracts add theirs in ETH-024); with no checks, walking out is a retreat
- [ ] `RunTracker<S>{init, reduce(event)}` framework from ARCHITECTURE §2.4; trackers for depth reached, turns, kills and deaths feed `rewards.atRisk` and the `RunResult`
- [ ] Host emits a run-ended message with the `RunResult`; the UI applies it to the Profile via `applyRunResult` and shows the run summary modal (cause of death, currency breakdown, epitaph placeholder)
- [ ] Waiting for the player is the default; an auto-restart toggle (Options and the summary) restarts with the previous config after a short timer
- [ ] Tests: each outcome, trackers reducing events, headless harness reports outcomes

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
