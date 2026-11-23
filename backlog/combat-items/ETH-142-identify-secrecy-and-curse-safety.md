---
id: ETH-142
title: Identification secrecy and curse safety for the idle player
type: feature
status: ready
priority: P1
milestone: M1.5
epic: combat-items
size: M
depends_on: [ETH-044]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
Fix two problems found in the ETH-044 review:
- The "unidentified" flag on weapons and armor gives away that the item rolled hidden properties.
- The baseline AI walks blindly into cursed gear and has almost no way to get free of it.

## Why
- **Secrecy.** `rollItemProperties` (`src/sim/items/loot.ts`) sets `identified: false` on gear only when it rolled an enchantment, a blessing or a curse. An unidentified sword is therefore always a special one. The snapshot's `unidentified` flag and the `itemStateNote` tooltip both show this. It breaks the secrecy ETH-131 guards.
- **Blind curses.** `upgradeSlot` and `bestUpgrade` (`src/sim/items/equipment.ts`) compare gear with `knownOnly`, so unidentified gear is judged on its base stats.
  - 10% of gear is cursed: −1/−2 enchantment plus the −1 `gearDelta`. That leaves it 2–3 points worse than the base item, and it locks its slot for the rest of the run.
  - The only fix is `act.use_uncurse`, which needs a scroll whose type is known. The AI never reads unknown scrolls, so those types are learned only through the Wits roll on pickup (`identify` = 3% per Wits point).
  - Until M3 the player has no lever against any of this. That goes against "Risk is a choice" and "Readable" (`CLAUDE.md` §1).
- **Free identification.** `tryIdentifyOnPickup` (`src/sim/items/effects.ts`) rolls again on every pickup, so dropping and picking up an item while possessing an adventurer identifies it for free.

## Acceptance criteria
- [ ] All weapon and armor loot, and gear carried by monsters, starts `identified: false` whether or not it rolled properties. Identifying a plain item logs that it has no enchantment or curse.
- [ ] An invariant and a property guard (ETH-131 style) check that whether an item is identified never depends on its hidden properties.
- [ ] The baseline never puts on unidentified gear while it can identify the item first. Otherwise it puts gear on only when the gain in base stats beats the expected value of hidden properties at that depth. That margin is computed from the roll chances in `loot.ts`, not hard-coded. The AI trace explains the decision.
- [ ] The baseline read-tests unknown scrolls when it is safe: no enemy visible, HP above the heal threshold, a reachable stair. This lets Identify and Uncursing scrolls be learned. Effects stay seeded and logged.
- [ ] A locked slot is readable: the trace and the party card say why the slot is locked, and the run summary lists how many turns cursed gear was worn.
- [ ] The Wits roll on pickup happens once per item instance, so dropping and picking an item up again can't farm identification.
- [ ] Codex, tooltip and log text are updated. `STATE_VERSION` is bumped with a migration if the state changes.
- [ ] Each AI behavior has a sim test with a fixed seed and a hand-built map. `npm run check` passes.

## Notes
- Track "Wits already rolled" with a per-instance flag (an `ITEM_PROPERTIES` kind) or a set in the items slice. The flag must not change how items stack.
- Note `LOOT_CURSE_CHANCE` and the cursed enchantment range as tunables for ETH-080.
- Letting the player set this through rules or doctrine ("never wear unidentified gear", "test scrolls") belongs to M3 (rules editor, ETH-031).

## Log
- 2026-11-23: Created from the review of ETH-044.
