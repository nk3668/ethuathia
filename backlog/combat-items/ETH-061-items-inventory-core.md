---
id: ETH-061
title: Items on the floor, inventory, pickup and drop, and in-run gold
type: feature
status: done
priority: P0
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-057]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Items exist as entities on the floor and in inventories. Adventurers pick up useful items and drop the least valuable when overloaded. Gold is a per-run amount used later by merchants.

## Why
Gear, consumables, relics, Gather targets, heirlooms and merchants all need an item model. See `CLAUDE.md` §5.3 (Inventory).

## Acceptance criteria
- [x] Item content defs (glyph, category, weight, value, optional bundle/use-effect, tags such as `junk`), validated; a few original starter items including a healing potion
- [x] Item instances are plain data (def id + per-instance fields such as quantity), on the floor as entities or inside an actor's `inventory` part; serialize round-trip
- [x] Actions `pickup`, `drop`, `use` (consumables apply their bundle effect); events + log text
- [x] A loot gen step places items by depth with the loot RNG stream; gold piles add to the party's run gold
- [x] Baseline: path to and pick up seen non-junk items when cheap, never corpses or junk; drop the lowest-value item when over `carry`; quaff healing at low HP
- [x] Item value score function in one place (later extended by enchantments and affixes)
- [x] Snapshot shows the selected member's inventory; inspecting a floor item shows its name
- [x] Hand-map sim tests for pickup, overload drop and use

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Started.
- 2026-11-18: Done. Items domain in `src/sim/items/` (instances, inventory, pickup/drop/use, `gen.loot` on its own per-floor loot RNG, party item memory, `itemValue` with value hooks), eight starter items, baseline quaff-healing / drop-lowest / pick-up rules, map glyphs, pack on the selected party card, Codex renderer and log text. Capacity is the `carry` stat from attributes (ETH-033). `wantsItem` simulates the drop order, so the AI never picks up what it would drop or drops what it would pick up again. STATE_VERSION 11. Fills ETH-072's `carriesHealingPotion` seam from the pack; the fountain rule sits after the potion rule. 50-seed sim vs main: all runs still finish, no stuck events, about +5% turns from item detours. In-run gold is not added to at-risk currency: it is for merchants, not a meta currency.
