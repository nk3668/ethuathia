---
id: ETH-014
title: "Pause, speed controls and keyboard shortcuts"
type: feature
status: done
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
- [x] Buttons for pause, 1×, 2×, 4×, 8× and max change sim speed; the active one is marked visually and with `aria-pressed`
- [x] `Space` toggles pause and `1`–`5` select speeds, except while typing in an input
- [x] Key bindings live in one table that maps keys to actions
- [x] Floor and turn counters in the top bar update from the snapshot

## Notes
- Keys `1`–`5` map to 1×, 2×, 4×, 8× and max; pause is only on `Space`. Keys are matched by `KeyboardEvent.code` on the number row, so the numpad stays free for movement while possessed.
- Space pauses even when a button has focus (the button is not also pressed; Enter still presses it), so pausing works after clicking anything. Space keeps its own meaning on checkboxes, radios and switches.
- `Tab` to cycle adventurers (`CLAUDE.md` §8) and `P` / WASD for possession are not in this item: possession doesn't exist yet, and `Tab` clashes with keyboard focus navigation (ETH-020).

## Log
- 2026-11-16: Created.
- 2026-11-16: ETH-012 left the `speed-controls` slot in the top bar for this item, starts the app's run at 1x in `App.tsx`, and already shows floor and turn from the snapshot.
- 2026-11-16: Started.
- 2026-11-16: Done. `SpeedControls` in the top bar, speed in `simStore` (sent to the host `bindHost` connected), the keymap table in `src/ui/input/keymap.ts` and `useKeymap` on the in-run screen. Verified the floor and turn counters (ETH-012's) update from snapshots, with a test. The speed control also shows paused when the worker pauses itself after an error. Created ETH-020 (cycle adventurers key) and ETH-021 (show sim errors).
