---
epic: town-meta
title: Town, currencies and upgrades
status: active
milestones: [M2, M3, M5]
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
- [ ] [ETH-023](ETH-023-at-risk-run-currency.md) Track run earnings as at-risk currency and lose 25% on a wipe
- [ ] [ETH-048 Run history list](ETH-048-run-history.md)

More items are added when M2 becomes the current milestone.
