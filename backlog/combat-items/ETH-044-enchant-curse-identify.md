---
id: ETH-044
title: Enchantment, blessed and cursed items, and identification
type: feature
status: pending-review
priority: P2
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-043, ETH-118]
created: 2026-11-17
updated: 2026-11-23
---

## Summary
Items carry a data-driven `+N` / `-N` enhancement, extensible special named/effect enchantments (`ENCHANTMENTS`), a blessed, uncursed or cursed beatitude, and start unidentified until revealed by Wits, use, wearing, or a Scroll of Identify.

## Why
Classic roguelike item risk and knowledge. The Cursed Hoard Omen and the Smithy's identification tree depend on it. See `CLAUDE.md` §4 and §6.

## Acceptance criteria
- [x] Enchantment and curse state roll from the loot RNG stream
- [x] Cursed gear can't be removed until uncursed
- [x] Unidentified items show a generic name; identification is remembered per item type for the run
- [x] Codex and tooltip text explain each state

## Notes
- Built on `ETH-118` (`ITEM_PROPERTIES`) and a new `ENCHANTMENTS` content kind (`src/content/enchantments.ts`) so adding new enchantments and effects later is pure data (`ETH-130`).
- Added a domain `effectHandlers` seam on `SimDomain` (`EFFECT_HANDLERS`) hosting `identify` and `uncurse` effects cleanly without circular imports.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-18: Identification chance should read the Wits-based identify stat from ETH-081.
- 2026-11-19: Added ETH-118 (item properties) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-22: Started and done. Added `src/content/enchantments.ts` (`ENCHANTMENTS` registry with 3 base numeric profiles + 5 starter special enchantments, `BLESSING_INFO`, `ITEM_STATE_INFO`, seeded `APPEARANCE_POOLS`); `{ kind: 'identify' }` and `{ kind: 'uncurse' }` effects with `SimDomain.effectHandlers` (`EFFECT_HANDLERS`); `Scroll of identify` and `Scroll of uncursing`; `src/sim/items/identify.ts`, `enchant.ts`, `effects.ts` (`prop.enchant`, `prop.blessing`, `prop.enchantments`, `prop.identified`); loot-RNG property rolling; cursed gear lock + AI handling; Wits `identify` pickup roll + use-ID + wear-ID; non-spoiling UI/Codex tooltips and `src/ui/codex/renderers/enchantment.tsx`; `STATE_VERSION` 27. Filed `ETH-130` for adding more enchantments later.
- 2026-11-23: Rebased onto main (STATE_VERSION 28) and merged to main (PR #84); PENDING REVIEW.
