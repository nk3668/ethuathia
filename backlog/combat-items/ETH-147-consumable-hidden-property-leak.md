---
id: ETH-147
title: Known-type potions and scrolls stop giving away a hidden blessing or curse
type: bug
status: idea
priority: P2
milestone: M1.6
epic: combat-items
size: S
depends_on: [ETH-142]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Once a potion or scroll type is known, a plain copy counts as identified while a blessed or cursed
copy stays flagged unidentified. The flag itself gives away the hidden property. Close the leak the
way ETH-142 did for gear.

## Why
ETH-142 made all gear start `identified: false` whatever it rolled, so the flag no longer means
"this one is special". Consumables still follow the older rule from ETH-044 (`clearPlainTypeFlags`
in `src/sim/items/identify.ts` clears the flag on plain copies once the type is known), which the
ETH-131 secrecy guards were meant to rule out. `CLAUDE.md` §1 ("Readable") and the §11.6 secrecy
criteria in `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [ ] Whether a potion or scroll instance reads as identified never depends on its blessed or cursed
      state, only on what the party has learned (type known, instance identified).
- [ ] Decide and document what a known-type, not-yet-identified copy shows: its type name plus "of
      unknown blessing", say, for every copy alike.
- [ ] The ETH-142 secrecy property guard is extended to consumables (plain and blessed/cursed variants
      give an identical snapshot flag, name and note).
- [ ] Stacking still works: copies that differ only in hidden state must not reveal it by refusing to
      stack (check `canStack`).
- [ ] Codex, tooltip and log text updated; `STATE_VERSION` bumped if state changes. `npm run check` passes.

## Notes
- ETH-044 documents the current behavior as intended, so confirm the desired display with Nate first.
- Found by the ETH-142 agent (out-of-scope list).

## Log
- 2026-11-24: Created from the ETH-142 review (Nate approved filing).
