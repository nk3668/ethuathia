---
id: ETH-090
title: Q and E cycle adventurers; diagonals while possessed
type: feature
status: ready
priority: P2
milestone: M1
epic: ui-shell
size: S
depends_on: [ETH-020]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Q and E select the previous and next adventurer. While an adventurer is possessed, Q and E move diagonally and `[` / `]` still cycle.

## Why
Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Keymap: Q/E and `[`/`]` cycle when nobody is possessed
- [ ] When ETH-066 lands, Q/E are up-left and up-right while possessed (WASD + QEZC)
- [ ] Tooltips and `aria-keyshortcuts` list both keys
- [ ] Component test

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
