---
id: ETH-004
title: "Energy scheduler and step loop with commands and events"
type: feature
status: done
priority: P0
milestone: M0
epic: sim-core
size: M
depends_on: [ETH-003]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
Implement `step(state, commands)`: apply commands, advance actors by energy, and return the events produced.

## Why
This is the sim's heartbeat and its only input and output channel. See `docs/ARCHITECTURE.md` §3.3 and §3.5, and `CLAUDE.md` §5.1.

## Acceptance criteria
- [x] Actors gain energy by speed and act at the threshold; a faster actor acts proportionally more often in a test
- [x] One `step` advances until each party member has acted once
- [x] `SimEvent` and `Command` are typed unions; unknown commands are rejected with an event, not a throw
- [x] Actor decisions come from a pluggable `decide` function (a stub that waits is enough here)

## Notes
Keep the event list as a plain array returned from `step`; no global bus.

**Decisions:** `RunState.turn` counts ticks, so it is game time (a speed-100 actor acts once per
turn) rather than a count of steps. A step stops right after the last party member acts, so
actors later in the id order act at the start of the next step. Only floors with a party member
on them are scheduled.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. `src/sim/step.ts` has `step`, the energy scheduler and the pluggable `Decide`
  (default `waitDecide`). `events.ts` has the `SimEvent` union, each event stamped with `turn`.
  `commands.ts` has the `Command` union with `playerAction` (queues an action in place of the
  actor's next decision) and run-time checks that reject bad commands with `commandRejected`.
  `actions.ts` is a minimal stand-in (wait only) for ETH-005 to replace; an action that can't be
  done emits `actionFailed` and costs a wait, so the loop can't stall. Recorded in ARCHITECTURE
  §3.3 and §3.5.
