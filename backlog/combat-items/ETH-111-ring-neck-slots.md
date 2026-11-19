---
id: ETH-111
title: Ring and neck equipment slots
type: feature
status: done
priority: P1
milestone: M1
epic: combat-items
size: S
depends_on: [ETH-043]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Adds two ring slots and a neck slot to the equipment from ETH-043, with ring and amulet base types, a few items of each and auto-equip that handles both ring slots.

## Why
Nate's answer to the ETH-043 slot question: he wants rings and a neck slot now. Rings and amulets give small, stat-only upgrades that make loot more varied (`CLAUDE.md` §5.3, Inventory).

## Acceptance criteria
- [x] `EQUIP_SLOTS` gains `neck`, `ring1` and `ring2`, with slot labels and tooltip text
- [x] Ring and amulet gear types (a ring fits either ring slot) and items with original names, in the loot table, validated at load time
- [x] Auto-equip fills an empty ring slot first, otherwise replaces the weaker ring, with a trace line naming the slot
- [x] The party card, snapshot, Codex and Explain tooltips show the new slots; ARCHITECTURE "Equipment" updated

## Notes
- A gear type now lists `slots` (not one `slot`); `gearSlots(def)` replaces `gearSlot(def)`.
- `equip` takes an optional `slot`; without one it fills the first empty slot the item fits.
- New item category `jewelry` (`=` ring, `"` amulet). Rings and amulets weigh nothing.
- No save migration: run states are not saved between sessions, and old `equipped` data stays valid. STATE_VERSION bumped for the wider slot set.
- No two-handed flag (not asked for).

## Log
- 2026-11-18: Created from Nate's answers to the ETH-043 questions, and started (in-progress).
- 2026-11-18: (default) Slot names `ring1` / `ring2`, shown as "Left ring" / "Right ring" — alternative: one `rings` slot holding a list of two.
- 2026-11-18: (default) Ring and amulet items: Copper band, Garnet signet, Owl-eye ring, Knotwork pendant, Hearthstone amulet, each with loot weight 0.5 — alternative: more or rarer jewelry.
- 2026-11-18: Fixed a churn found by the sim compare (seed 8 hit stuck detection): an overloaded adventurer dropped things, put on the new jerkin (freeing the pack) and picked them all up again. Now a clear upgrade is always wanted, and while overloaded the baseline equips an upgrade before dropping anything.
- 2026-11-18: Done. STATE_VERSION 17.
