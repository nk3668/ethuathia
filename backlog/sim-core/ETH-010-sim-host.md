---
id: ETH-010
title: "SimHost: inline and Web Worker hosts, snapshot protocol and speed"
type: feature
status: done
priority: P0
milestone: M0
epic: sim-core
size: M
depends_on: [ETH-004]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The `SimHost` interface with an inline implementation and a Web Worker implementation, plus `snapshot()` for the UI.

## Why
Keeps the UI responsive at any sim speed and gives tests, the harness and time-away a headless way to run. See `docs/ARCHITECTURE.md` §3.5 and §7.

## Acceptance criteria
- [x] InlineHost runs a given number of steps synchronously and delivers events and a snapshot
- [x] WorkerHost runs the sim off the main thread and supports pause and 1×, 2×, 4×, 8× and max
- [x] Snapshots are sent at most about 30 times per second at any speed; events arrive in order, batched
- [x] A snapshot contains only what the party knows (fog applied) and no reference to `RunState`
- [x] Both hosts produce identical event sequences for the same seed and commands

## Notes
- The pure parts (`SimSession`, `InlineHost`, `PacedRunner` and the message protocol) live in `src/sim/host/`. Only the worker entry, `serveSim` and `WorkerHost` are in `src/ui/host/`, because they need timers and worker globals.
- 1× is 5 party turns a second (`TURNS_PER_SECOND`, a provisional default).
- Node has no Web Workers, so tests connect `WorkerHost` and `serveSim` over a `MessageChannel`. Checked by hand in a production build (`vite preview`): the worker bundles and runs under the CSP at about 5,000 turns/s at max, and the page held 144 fps while it ran.

## Log
- 2026-11-16: Created.
- 2026-11-16: Started.
- 2026-11-16: Done. Added the snapshot, inline and worker hosts and the paced runner, with tests for pacing, fog, state isolation and identical events.
