---
epic: combat-items
title: Combat, items and statuses
status: active
milestones: [M1, M1.6, M2, M5, later]
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
- [x] [ETH-043 Equipment slots and base item types](ETH-043-equipment-slots-base-items.md)
- [x] [ETH-044 Enchantment, blessed and cursed items, and identification](ETH-044-enchant-curse-identify.md)
- [ ] [ETH-045 Light affixes and named artifacts](ETH-045-affixes-artifacts.md)
- [ ] [ETH-050 Summons and pets](ETH-050-summons-pets.md)
- [ ] [ETH-054 Food as consumables that grant short-term buffs](ETH-054-food-buffs.md)

More items are added when M1 becomes the current milestone.
- [x] [ETH-057 Bundles (modifiers, effects, triggers), stats with sources and timed statuses](ETH-057-bundles-stats-statuses.md)
- [x] [ETH-060 Monsters, melee combat and death](ETH-060-monsters-melee-combat.md)
- [x] [ETH-061 Items on the floor, inventory, pickup and drop, and in-run gold](ETH-061-items-inventory-core.md)
- [x] [ETH-075 Name the killer in the death log line and the wipe summary](ETH-075-killer-named-death-line.md)
- [x] [ETH-082 Each weapon type scales damage off its own attribute](ETH-082-weapon-attribute-scaling.md)
- [ ] [ETH-096 Wands that recharge on each new floor](ETH-096-rechargeable-wands.md)
- [ ] [ETH-106 Pets that persist and level up](ETH-106-pets-that-level.md)
- [x] [ETH-111 Ring and neck equipment slots](ETH-111-ring-neck-slots.md)
- [ ] [ETH-112 Weighted gear score so auto-equip can take trade-offs](ETH-112-weighted-gear-score.md)
- [x] [ETH-118 Item properties: per-instance layers that feed gearBundles, value, names and stacking](ETH-118-item-properties.md)
- [ ] [ETH-123 Allied non-party creatures: actors that fight with the party without being members](ETH-123-allied-creatures.md)
- [ ] [ETH-130 Expand the enchantment pool with additional effects and triggers](ETH-130-more-enchantments.md)
- [x] [ETH-142 Identification secrecy and curse safety for the idle player](ETH-142-identify-secrecy-and-curse-safety.md)
