---
epic: town-meta
title: Town, currencies and upgrades
status: active
milestones: [M2, M3, M7, M8, later]
---

## Goal
Between runs the player spends three currencies on branching upgrade trees that change the next run.

## Scope
**In:**
- Profile state and pure update functions
- Currency trackers and run rewards
- Generic upgrade engine with pick-one tiers and respec
- Guild Hall, Smithy and Cartographer trees
- Town screen and Prepare screen

**Out (later or elsewhere):**
- Library tree (see `behavior-rules`)
- Temple (see `deities`)
- Ossuary and Tavern (see `lineage`)

## Design refs
- `CLAUDE.md` §3: Currencies
- `CLAUDE.md` §4: The Town
- `docs/ARCHITECTURE.md` §6
- `docs/VISUAL-DESIGN.md` §5.2, §6.1

## Items
- [x] [ETH-023](ETH-023-at-risk-run-currency.md) Track run earnings as at-risk currency and lose 25% on a wipe
- [x] [ETH-048 Run history list](ETH-048-run-history.md)

More items are added when M2 becomes the current milestone.
- [x] [ETH-063 Upgrade engine and the Town screen with a Guild Hall](ETH-063-upgrade-engine-town.md)
- [ ] [ETH-071 Guild Hall doctrine: prioritize clearing floors or prioritize the stairs](ETH-071-doctrine-clear-or-stairs.md)
- [x] [ETH-074 Town buildings unlocked by milestones](ETH-074-locked-buildings.md)
- [x] [ETH-083 Leftover gold converts to Trophies when the party exits](ETH-083-gold-to-trophies.md)
- [x] [ETH-085 Depth-weighted Renown rewards](ETH-085-depth-weighted-renown.md)
- [x] [ETH-086 Split upgrade trees into permanent Foundations and free Tactics](ETH-086-foundations-and-tactics-trees.md)
- [ ] [ETH-093 Unlock town buildings by finishing a quest for each](ETH-093-building-unlock-quests.md)
- [ ] [ETH-108 Guild trophy room](ETH-108-guild-trophy-room.md)
- [ ] [ETH-124 Retire veterans to Tavern jobs for permanent passive bonuses](ETH-124-tavern-veterans-retirement.md)
- [ ] [ETH-127 Achievements tracked with the objective engine](ETH-127-achievements.md)
- [ ] [ETH-129 Guild Hall upgrade: constant floor respawns on revisit](ETH-129-guild-hall-constant-respawn.md)
- [ ] [ETH-132 Rebuild the Guild Hall tree deeper, with ranked nodes and tiered costs](ETH-132-rescale-guild-hall-renown-costs.md)
- [ ] [ETH-159 Smithy upgrade tree spent in Trophies](ETH-159-smithy-tree.md)
- [ ] [ETH-170 Building-tier quests open each building's next tier](ETH-170-building-tier-quests.md)
- [ ] [ETH-171 Items carried out of the dungeon sell for Trophies](ETH-171-sell-carried-items.md)
- [x] [ETH-172 Upgrade engine supports ranked nodes and quest-locked tiers](ETH-172-upgrade-ranks-and-tiers.md)
- [ ] [ETH-174 The Cartographer building](ETH-174-cartographer.md)
