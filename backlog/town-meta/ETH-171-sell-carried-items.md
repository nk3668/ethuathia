---
id: ETH-171
title: Items carried out of the dungeon sell for Trophies
type: feature
status: done
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-083, ETH-061, ETH-118, ETH-176]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Gear does not carry over between runs. When the party leaves the dungeon (victory or retreat), every item it carries is sold for Trophies at its value.

## Why
Nate (2026-11-24): run gear is lost and the Smithy is the gear progression, but every haul should still feel rewarding. See `CLAUDE.md` §3.

## Acceptance criteria
- [x] On victory and retreat, every living member's carried and equipped items convert to Trophies by item value at `VALUE_PER_TROPHY` in `src/content/economy.ts` (default 10, the same as gold), summed over all items and then rounded down. Items on fallen members are lost with them.
- [x] Not sold: **kit items** (`isKitItem`, ETH-176: a run never pays for its own starting gear), items worth 0 (quest relics such as the Ember Reliquary and the guild anvil), and gold (already converted by ETH-083)
- [x] Unidentified and cursed items sell at their def's base value; enchantment and affixes don't change the price yet (M5 may)
- [x] Rides the same post-exit path as gold: `RunResult.converted` gains the item Trophies, `extras['run.items']` records `{ items, value, trophies, rate }`, and the history slice keeps it on the run record (with a migration if the record shape changes)
- [x] The run summary shows an "Items sold" line (count and Trophies) on victory and retreat, and "Items lost" on a wipe; a `goldSettled`-style log line; the Trophies tooltip mentions it
- [x] Conversion follows the same Omen-multiplier rule as gold (ETH-083: not multiplied)
- [x] Heirlooms (M7) will be the exception; leave a hook (one predicate, `soldOnExit(item)`), not the feature
- [x] Tests: victory, retreat and wipe; kit items, zero-value items and a fallen member's items are not sold; the sum is rounded once

## Notes
- **Balance (T1, 20 seeds):** it adds Trophies to every surviving run; report Trophies per run before and after in the PR. Nate isn't worried about fine balance yet; ETH-161 tunes `VALUE_PER_TROPHY`.

## Log
- 2026-11-24: Created from the progression discussion with Nate.
- 2026-11-24: Criteria made exact by Claude (rate, kit and zero-value exclusions, fallen members, result plumbing beside ETH-083's gold). Status ready.
- 2026-11-24: Done. `src/sim/items/sale.ts` (`soldOnExit`, `itemSale`), `VALUE_PER_TROPHY` and `itemValueToTrophies` in `economy.ts`, `itemsSettled` event, `extras['run.items']`, history v6 (`RunRecord.items`), run summary "Items sold" / "Items lost" line, log line and Trophies tooltips. Harness: `trophies converted on exit` and `trophies from sold items` rows in `npm run sim -- --compare`. T1 (20 seeds vs origin/main): state hashes unchanged; sold items add 11.2 Trophies per run on average over all runs (4 of the 20 survived; about 56 per surviving run), against a mean of 201.8 at-risk Trophies before wipe loss.
