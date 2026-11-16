---
id: ETH-004
title: "Energy scheduler and step loop with commands and events"
type: feature
status: ready
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
- [ ] Actors gain energy by speed and act at the threshold; a faster actor acts proportionally more often in a test
- [ ] One `step` advances until each party member has acted once
- [ ] `SimEvent` and `Command` are typed unions; unknown commands are rejected with an event, not a throw
- [ ] Actor decisions come from a pluggable `decide` function (a stub that waits is enough here)

## Notes
Keep the event list as a plain array returned from `step`; no global bus.

## Log
- 2026-11-16: Created.
