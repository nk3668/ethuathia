---
id: ETH-190
title: Cartographer Tier I node that raises the quality of dungeon loot
type: feature
status: idea
priority: P2
milestone: M8
epic: town-meta
size: S
depends_on: [ETH-174]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
A Tier I node in the Cartographer tree that gives a flat, modest increase in the quality of the loot found on dungeon floors. No current node touches dungeon loot.

## Why
Nate spotted the gap (2026-11-25): the Guild Hall and Smithy trees improve the party and its starting kit, but nothing improves what the party finds. A Cartographer knows where the good finds lie, so the node fits that building.

## Decisions (Nate, 2026-11-25)
- **Building:** the Cartographer (ETH-174), so it waits for that building.
- **Tier I node.** A flat increase, nothing game-breaking, so it suits an early node.
- **Not an Omen.** It adds no danger and has no reward multiplier; it is an ordinary tree node (ranked or single).

## How loot works today
- **Floor loot only.** `GEN_LOOT` (`src/sim/items/loot.ts`) places 3–6 items per floor. Each is one weighted pick from `lootTable(depth)` (every item def whose `loot.minDepth`/`maxDepth` allows that depth, by `loot.weight`).
- **Properties:** `rollItemProperties` rolls 10% blessed and 10% cursed, a 25% enchant chance (+1 mostly, up to a cap of 1/2/3 by depth 1/3/6), and a special enchantment at 12% rising 2 points per floor to 25%.
- **Monsters drop nothing** except what an Omen gives them (Stalker's Ledger finds, Armed Warbands gear) through the overlay's `carries`. Elite and mini-boss drops from a better table are ETH-052; affixes and artifacts are ETH-045.
- **Omens already pay in loot:** Cursed Hoards raises enchant chance and cap together with curses; Stalker's Ledger and Deep Surge add finds.

## Possible levers (pick in the planning gate)
1. **Enchant chance:** +N points to `LOOT_ENCHANT_CHANCE` (per rank, if ranked).
2. **Enchant level:** a higher share of +2/+3 rolls (a lower `ENCHANT_MILD_CHANCE`), within today's cap.
3. **Richer table:** rarer defs weighted up a little.
4. **Special enchantments:** +N points to the special chance.

Keep it flat and small: no cap raise (that stays Cursed Hoards' reward) and no change to the curse rate, so Cursed Hoards stays the way to trade curse risk for power.

## Acceptance criteria
- [ ] A Cartographer Tier I node improves floor loot, with a tooltip that gives the numbers
- [ ] Loot rolls with the node unowned replay exactly as before (T0, 0 hash diffs)
- [ ] Cursed gear stays secret and the AI's hidden-gear choices don't change when only the hidden roll changes (ETH-142 secrecy guard)
- [ ] Codex and log text describe the bonus

## Log
- 2026-11-25: Created from Nate's suggestion during the M2.2 review.
- 2026-11-25: Nate: a Cartographer Tier I node, a flat increase, not an Omen. Moved to M8 with the Cartographer (ETH-174); dropped the ETH-052 dependency.
