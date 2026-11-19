---
id: ETH-044
title: Enchantment, blessed and cursed items, and identification
type: feature
status: idea
priority: P2
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-043, ETH-118]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Items carry a +N enchantment and a blessed, uncursed or cursed state, and are unidentified until used or identified.

## Why
Classic roguelike item risk and knowledge. The Cursed Hoard Omen and the Smithy's identification tree depend on it. See `CLAUDE.md` §4 and §6.

## Acceptance criteria
- [ ] Enchantment and curse state roll from the loot RNG stream
- [ ] Cursed gear can't be removed until uncursed
- [ ] Unidentified items show a generic name; identification is remembered per item type for the run
- [ ] Codex and tooltip text explain each state

## Notes
- None yet.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-18: Identification chance should read the Wits-based identify stat from ETH-081.
- 2026-11-19: Added ETH-118 (item properties) to `depends_on`: build on the shared system instead of a parallel version.
