---
id: ETH-043
title: Equipment slots and base item types
type: feature
status: idea
priority: P1
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-033, ETH-061]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Adds equipment slots and fixed base item types (a longsword, chain armor) with stats that apply as modifiers.

## Why
The base of the gear model: roguelike base items plus light affixes. See `CLAUDE.md` §5.3 (Inventory).

## Acceptance criteria
- [ ] Item defs in `src/content/` with slot, type and base stats, validated at load time
- [ ] Equipping applies the item's modifiers; unequipping removes them
- [ ] Auto-equip picks clear upgrades, with a trace line
- [ ] Inspect tooltips show item stats

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
