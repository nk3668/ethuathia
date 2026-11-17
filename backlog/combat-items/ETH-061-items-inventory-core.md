---
id: ETH-061
title: Items on the floor, inventory, pickup and drop, and in-run gold
type: feature
status: ready
priority: P0
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-057]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Items exist as entities on the floor and in inventories. Adventurers pick up useful items and drop the least valuable when overloaded. Gold is a per-run amount used later by merchants.

## Why
Gear, consumables, relics, Gather targets, heirlooms and merchants all need an item model. See `CLAUDE.md` §5.3 (Inventory).

## Acceptance criteria
- [ ] Item content defs (glyph, category, weight, value, optional bundle/use-effect, tags such as `junk`), validated; a few original starter items including a healing potion
- [ ] Item instances are plain data (def id + per-instance fields such as quantity), on the floor as entities or inside an actor's `inventory` part; serialize round-trip
- [ ] Actions `pickup`, `drop`, `use` (consumables apply their bundle effect); events + log text
- [ ] A loot gen step places items by depth with the loot RNG stream; gold piles add to the party's run gold
- [ ] Baseline: path to and pick up seen non-junk items when cheap, never corpses or junk; drop the lowest-value item when over `carry`; quaff healing at low HP
- [ ] Item value score function in one place (later extended by enchantments and affixes)
- [ ] Snapshot shows the selected member's inventory; inspecting a floor item shows its name
- [ ] Hand-map sim tests for pickup, overload drop and use

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
