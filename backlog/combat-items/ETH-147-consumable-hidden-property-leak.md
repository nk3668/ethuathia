---
id: ETH-147
title: Known-type potions and scrolls stop giving away a hidden blessing or curse
type: bug
status: ready
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
- [ ] **Display (Nate, 2026-11-24: option 1, same as gear):** every copy of a known type looks the
      same until that copy is identified. It shows the type's real name (e.g. "Mending Draught") plus
      one shared "blessing unknown" note, whether it is plain, blessed or cursed. Using or reading it,
      an Identify scroll, or the once-per-instance Wits roll on pickup (ETH-142) reveals the blessing.
      Identifying a plain copy logs "no blessing or curse".
- [ ] `clearPlainTypeFlags` no longer clears plain copies when a type becomes known; learning a type
      reveals what it is, never which copies are special.
- [ ] The ETH-142 secrecy property guard is extended to consumables (plain and blessed/cursed variants
      give an identical snapshot flag, name and note).
- [ ] **Stacking:** copies of a known type whose blessing is still unknown stack together regardless of
      their hidden blessing, so separate stacks can't give it away (check `canStack` and `addToStacks`).
      They split into separate stacks only once identified. Define what happens when one copy from a
      mixed stack is used or identified: which copy is taken, and how the rest stay secret. It must be
      deterministic and seeded.
- [ ] The baseline AI stays blind to hidden blessings: quaff and read choices may not prefer a copy
      because it is secretly blessed.
- [ ] Codex, tooltip and log text updated; `STATE_VERSION` bumped if state changes. `npm run check` passes.

## Notes
- ETH-044 documented the old behavior as intended; Nate chose option 1 on 2026-11-24, so update the
  ETH-044 notes in `docs/ARCHITECTURE.md` (identification section) to match.
- Found by the ETH-142 agent (out-of-scope list).

## Log
- 2026-11-24: Created from the ETH-142 review (Nate approved filing).
- 2026-11-24: Nate chose display option 1 (every copy of a known type looks the same until identified; mixed stacks). Marked ready.
