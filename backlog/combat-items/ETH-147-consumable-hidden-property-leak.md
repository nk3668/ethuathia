---
id: ETH-147
title: Known-type potions and scrolls stop giving away a hidden blessing or curse
type: bug
status: done
priority: P2
milestone: M1.6
epic: combat-items
size: S
depends_on: [ETH-142]
created: 2026-11-24
updated: 2026-11-23
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
- [x] Whether a potion or scroll instance reads as identified never depends on its blessed or cursed
      state, only on what the party has learned (type known, instance identified).
- [x] **Display (Nate, 2026-11-24: option 1, same as gear):** every copy of a known type looks the
      same until that copy is identified. It shows the type's real name (e.g. "Mending Draught") plus
      one shared "blessing unknown" note, whether it is plain, blessed or cursed. Using or reading it,
      an Identify scroll, or the once-per-instance Wits roll on pickup (ETH-142) reveals the blessing.
      Identifying a plain copy logs "no blessing or curse".
- [x] `clearPlainTypeFlags` no longer clears plain copies when a type becomes known; learning a type
      reveals what it is, never which copies are special.
- [x] The ETH-142 secrecy property guard is extended to consumables (plain and blessed/cursed variants
      give an identical snapshot flag, name and note).
- [x] **Stacking:** copies of a known type whose blessing is still unknown stack together regardless of
      their hidden blessing, so separate stacks can't give it away (check `canStack` and `addToStacks`).
      They split into separate stacks only once identified. Define what happens when one copy from a
      mixed stack is used or identified: which copy is taken, and how the rest stay secret. It must be
      deterministic and seeded.
- [x] The baseline AI stays blind to hidden blessings: quaff and read choices may not prefer a copy
      because it is secretly blessed.
- [x] Codex, tooltip and log text updated; `STATE_VERSION` bumped if state changes. `npm run check` passes.

## Notes
- ETH-044 documented the old behavior as intended; Nate chose option 1 on 2026-11-24, so update the
  ETH-044 notes in `docs/ARCHITECTURE.md` (identification section) to match.
- Found by the ETH-142 agent (out-of-scope list).

## Log
- 2026-11-24: Created from the ETH-142 review (Nate approved filing).
- 2026-11-24: Nate chose display option 1 (every copy of a known type looks the same until identified; mixed stacks). Marked ready.
- 2026-11-24: Implemented. Unidentified potions and scrolls stack whatever their blessing (ItemInstance.mix, STATE_VERSION 36); use and partial drop draw copies on the loot stream; identifying a mixed stack splits it by blessing; clearPlainTypeFlags removed. T1 compare (seeds 1-50): party 1 win 30.0% to 24.0%, party 4 46.0% to 40.0%; seeds 101-300 show -0.5 and +3.5 points, so the T1 dip was noise from the shifted loot stream (more Wits rolls).
- 2026-11-23: Reviewed and merged into m1.5-living-dungeon by the orchestrator (ff40589); npm run check green twice (105 files, 1238 tests). STATE_VERSION 36. T1 50-seed and 200-seed compares within noise.
