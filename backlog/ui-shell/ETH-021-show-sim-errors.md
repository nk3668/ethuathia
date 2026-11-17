---
id: ETH-021
title: "Tell the player when the sim stops on an error"
type: feature
status: done
priority: P2
milestone: M1
epic: ui-shell
size: S
depends_on: [ETH-014]
created: 2026-11-16
updated: 2026-11-17
---

## Summary
When the sim worker reports an error and pauses, show it in the UI (a banner or log entry) instead of only in the dev console.

## Why
`WorkerHost.onError` fires when the worker gets a bad message or the sim throws, and the worker pauses the run. Since ETH-014 the speed control switches to Pause when that happens, but nothing says why, so the player sees a run that stopped for no reason. See `CLAUDE.md` §1 (readable) and `docs/ARCHITECTURE.md` §7.

## Acceptance criteria
- [x] A worker error shows a visible, plain-language message with the error text, and the speed control shows paused
- [x] Resuming after an error is either possible or clearly disabled, with a tooltip saying why
- [x] A component test drives a `WorkerHost` error and checks the message

## Notes
`SimHost` has no `onError`; only `WorkerHost` does. Consider adding it to the interface (InlineHost would just never call it).

## Log
- 2026-11-16: Created while doing ETH-014.
- 2026-11-17: Started.
- 2026-11-17: Done. `onError` is on `SimHost` (InlineHost never calls it); `bindHost` feeds it into `simStore.hostFailed`, which records `error` and pauses. A `SimErrorBanner` over the map shows the message; the speed buttons go `aria-disabled` with a tooltip saying why. The worker now also pauses on a bad request, so it is always paused when it reports an error.
- 2026-11-17: (default) Resuming after an error is disabled rather than allowed, since a thrown step may leave the run half-updated; the banner says to restart the game. Alternatives: allow resuming anyway, or add a "Start a new run" button to the banner.
