---
epic: combat-items
title: Combat, items and statuses
status: active
milestones: [M1, M2, later]
---

## Goal
Fights, gear and consumables that are all built from the same modifiers, effects and triggers.

## Scope
**In:**
- Stat system with sourced modifiers
- Effect interpreter and triggers
- Melee and ranged combat, death
- Inventory, equipment, consumables, identification
- Status effects

**Out (later or elsewhere):**
- Heirlooms (see `lineage`)
- Blessings (see `deities`)

## Design refs
- `CLAUDE.md` §5.3: Baseline behavior (combat, inventory)
- `docs/ARCHITECTURE.md` §2.2, §2.3

## Items
- [ ] [ETH-043 Equipment slots and base item types](ETH-043-equipment-slots-base-items.md)
- [ ] [ETH-044 Enchantment, blessed and cursed items, and identification](ETH-044-enchant-curse-identify.md)
- [ ] [ETH-045 Light affixes and named artifacts](ETH-045-affixes-artifacts.md)
- [ ] [ETH-050 Summons and pets](ETH-050-summons-pets.md)
- [ ] [ETH-054 Food as consumables that grant short-term buffs](ETH-054-food-buffs.md)

More items are added when M1 becomes the current milestone.
- [x] [ETH-057 Bundles (modifiers, effects, triggers), stats with sources and timed statuses](ETH-057-bundles-stats-statuses.md)
- [x] [ETH-060 Monsters, melee combat and death](ETH-060-monsters-melee-combat.md)
- [x] [ETH-061 Items on the floor, inventory, pickup and drop, and in-run gold](ETH-061-items-inventory-core.md)
- [ ] [ETH-075 Name the killer in the death log line and the wipe summary](ETH-075-killer-named-death-line.md)
- [ ] [ETH-082 Each weapon type scales damage off its own attribute](ETH-082-weapon-attribute-scaling.md)
- [ ] [ETH-096 Wands that recharge on each new floor](ETH-096-rechargeable-wands.md)
- [ ] [ETH-106 Pets that persist and level up](ETH-106-pets-that-level.md)
