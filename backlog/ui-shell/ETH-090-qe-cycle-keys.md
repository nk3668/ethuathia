---
id: ETH-090
title: Q and E cycle adventurers; diagonals while possessed
type: feature
status: pending-review
priority: P2
milestone: M1
epic: ui-shell
size: S
depends_on: [ETH-020]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-19
---

## Summary
Q and E select the previous and next adventurer. While an adventurer is possessed, Q and E move diagonally and `[` / `]` still cycle.

## Why
Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [x] Keymap: Q/E and `[`/`]` cycle when nobody is possessed
- [x] When ETH-066 lands, Q/E are up-left and up-right while possessed (WASD + QEZC)
- [x] Tooltips and `aria-keyshortcuts` list both keys
- [x] Component test

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Assigned to Antigravity as a low-risk item.
- 2026-11-19: **Gemini** implemented ETH-090 (`KeyContext` expanded with `'unpossessed'`, `KeyQ`/`KeyE` bound to `cycleSelection` when unpossessed and diagonal `bump` when possessed while `[`/`]` cycle in both states, `docs/ARCHITECTURE.md` §8.3 and UI tests updated) and marked `pending-review`. (default) Listed `Q`/`E` before `[`/`]` in `KEYMAP` so cycle button tooltips read `Key: Q or [` / `Key: E or ]` and `aria-keyshortcuts` reads `Q [` / `E ]`.
