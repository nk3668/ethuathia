---
id: ETH-190
title: Town nodes that raise the quality of dungeon loot
type: feature
status: idea
priority: P2
milestone: M5
epic: town-meta
size: M
depends_on: [ETH-052]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Add town-tree nodes that make the loot found in the dungeon better: more enchanted gear, higher enchantments, or a richer pick from the loot table. No current node touches dungeon loot.

## Why
Nate spotted the gap (2026-11-25): the Guild Hall and Smithy trees improve the party and its starting kit, but nothing improves what the party finds. Better finds are a positive bonus, so they fit a tree node; they don't add danger, so no Omen is needed (`CLAUDE.md` §6).

## How loot works today
- **Floor loot only.** `GEN_LOOT` (`src/sim/items/loot.ts`) places 3–6 items per floor. Each is one weighted pick from `lootTable(depth)` (every item def whose `loot.minDepth`/`maxDepth` allows that depth, by `loot.weight`).
- **Properties:** `rollItemProperties` rolls 10% blessed and 10% cursed, a 25% enchant chance (+1 mostly, up to a cap of 1/2/3 by depth 1/3/6), and a special enchantment at 12% rising 2 points per floor to 25%.
- **Monsters drop nothing** except what an Omen gives them (Stalker's Ledger finds, Armed Warbands gear) through the overlay's `carries`. Elite and mini-boss drops from a better table are ETH-052; affixes and artifacts are ETH-045.
- **Omens already pay in loot:** Cursed Hoards raises enchant chance and cap together with curses; Stalker's Ledger and Deep Surge add finds.

## Possible levers (pick in the planning gate)
1. **Enchant chance:** +N points to `LOOT_ENCHANT_CHANCE` per rank.
2. **Enchant level:** a higher share of +2/+3 rolls (or a lower `ENCHANT_MILD_CHANCE`).
3. **Richer table:** loot drawn as if 1 floor deeper, or rarer defs weighted up.
4. **Special enchantments:** +N points to the special chance or its cap.
5. **Quantity:** +1 item per floor (probably the weakest fit; more pickups to sort, not better ones).
6. **Monster drops:** once ETH-052 exists, a better chance or table for elite drops.

## Open questions
- **Building:** the Smithy (gear knowledge), the Cartographer (knowing where the good finds lie, ETH-174), or a later building. The Smithy has the theme; the Cartographer spreads the bonuses across buildings.
- **Overlap with Omens:** the node must not make Cursed Hoards pointless. One option is that the node improves only un-cursed rolls and leaves the curse rate alone, so the Omen stays the way to trade curse risk for power.
- **Starting point:** if Nate wants a first version before M5, levers 1 and 2 work on today's floor loot and need no ETH-052 (drop the dependency then).

## Acceptance criteria
- [ ] At least one ranked node (or a pick-one-of-two tier with a capability) improves loot, with a tooltip that gives the numbers per rank
- [ ] Loot rolls with the node unowned replay exactly as before (T0, 0 hash diffs)
- [ ] Cursed gear stays secret and the AI's hidden-gear choices don't change when only the hidden roll changes (ETH-142 secrecy guard)
- [ ] Codex and log text describe the bonus

## Log
- 2026-11-25: Created from Nate's suggestion during the M2.2 review.
