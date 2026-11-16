---
id: ETH-014
title: "Pause, speed controls and keyboard shortcuts"
type: feature
status: ready
priority: P1
milestone: M0
epic: ui-shell
size: S
depends_on: [ETH-010, ETH-012]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
The pause and speed control in the top bar, wired to the SimHost, and the keymap table with `Space` and `1`–`5`.

## Why
The last piece of M0: the player can watch the run at their own pace. See `CLAUDE.md` §5.4 and §8, and `docs/ARCHITECTURE.md` §8.3.

## Acceptance criteria
- [ ] Buttons for pause, 1×, 2×, 4×, 8× and max change sim speed; the active one is marked visually and with `aria-pressed`
- [ ] `Space` toggles pause and `1`–`5` select speeds, except while typing in an input
- [ ] Key bindings live in one table that maps keys to actions
- [ ] Floor and turn counters in the top bar update from the snapshot

## Notes
None yet.

## Log
- 2026-11-16: Created.
- 2026-11-16: ETH-012 left the `speed-controls` slot in the top bar for this item, starts the app's run at 1x in `App.tsx`, and already shows floor and turn from the snapshot.
