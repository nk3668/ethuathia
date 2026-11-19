---
id: ETH-043
title: Equipment slots and base item types
type: feature
status: done
priority: P1
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-033, ETH-061]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Adds equipment slots and fixed base item types (a longsword, chain armor) with stats that apply as modifiers.

## Why
The base of the gear model: roguelike base items plus light affixes. See `CLAUDE.md` §5.3 (Inventory).

## Acceptance criteria
- [x] Item defs in `src/content/` with slot, type and base stats, validated at load time
- [x] Equipping applies the item's modifiers; unequipping removes them
- [x] Auto-equip picks clear upgrades, with a trace line
- [x] Inspect tooltips show item stats

## Notes
- Design in docs/ARCHITECTURE.md, Contracts, "Equipment (ETH-043)".
- Slots: main hand, off hand, head, body, hands, feet. A def's `gear.type` (`GEAR_TYPE_INFO`) names its slot; base stats are its `bundle.modifiers`; `scalesWith` is declared for ETH-082.
- A "clear upgrade" is at least as good in every stat and better in one (`compareGear`). Tradeoffs and gear with triggers are never auto-equipped.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Each base weapon type will name the attribute its damage scales with (ETH-082); leave room for a `scalesWith` field.
- 2026-11-18: Started (in-progress).
- 2026-11-18: (default) Six slots, one item each: main hand, off hand, head, body, hands, feet. No two-handed weapons, rings or amulets yet — alternatives: two ring slots and a neck slot now, or a `twoHanded` flag that blocks the off hand.
- 2026-11-18: (default) Auto-equip takes only Pareto upgrades (no stat worse); tradeoffs like the Flanged mace (+3 damage, −1 accuracy) are left to rules or possession — alternative: a weighted gear score.
- 2026-11-18: (default) Worn gear doesn't count against Carry (only the pack does): counting it crowded potions out (sim compare: −24% pickups, a wipe) — alternatives: count it fully, or at half weight.
- 2026-11-18: Done. Ten new gear defs plus the hatchet and jerkin as gear; `equip`/`unequip` actions; `items.equipped` bundle source; `act.equip_upgrade` in the baseline; Worn/Stats fields in the item Codex and Explain tooltips; worn gear on the party card. STATE_VERSION 15.
