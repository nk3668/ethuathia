---
id: ETH-020
title: "Key to cycle the selected adventurer"
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
Add a keymap binding that selects the next living adventurer (and the previous one with a modifier), so the map's follow camera and the party cards move with it.

## Why
`CLAUDE.md` §8 lists `Tab` to cycle adventurers. ETH-014 built the keymap table (`src/ui/input/keymap.ts`) with only `Space` and `1`–`5`, as its item asked. `Tab` is also how keyboard users move focus, so binding it globally would break keyboard navigation of the whole screen (`docs/VISUAL-DESIGN.md` §7).

## Acceptance criteria
- [x] A key in the keymap table selects the next living party member, wrapping around; another selects the previous one
- [x] Keyboard focus navigation still works everywhere, and the key is shown in a tooltip and `aria-keyshortcuts`
- [x] Component tests cover cycling, skipping dead members and the empty party

## Notes
Open question for the user: keep `Tab` (only while the map has focus, where Tab would otherwise just leave it?) or pick another key such as `[` / `]` or `` ` ``. Possession (`P`) and movement while possessed join the same table later.

## Log
- 2026-11-16: Created while doing ETH-014.
- 2026-11-17: Started.
- 2026-11-17: (default) `]` selects the next living adventurer and `[` the previous one; `Tab` stays unbound so it keeps moving focus — alternatives: `Tab` / `Shift+Tab` only while the map has focus, or `` ` `` / `Shift+` `` ` ``.
- 2026-11-17: Done. `cycleSelection` action in the keymap, the pure `cycleSelection()` in `uiStore.ts`, and `‹` / `›` buttons in the Party heading whose tooltips and `aria-keyshortcuts` name the keys. `CLAUDE.md` §8 and both design docs updated. Tests in `test/ui/cycleSelection.test.tsx`.
