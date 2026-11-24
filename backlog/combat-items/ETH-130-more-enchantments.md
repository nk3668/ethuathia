---
id: ETH-130
title: Expand the enchantment pool with additional effects and triggers
type: content
status: idea
priority: P3
milestone: M5
epic: combat-items
size: M
depends_on: [ETH-044]
created: 2026-11-22
updated: 2026-11-24
---

## Summary
Add more special enchantments (and any new reusable `Effect` kinds they call for) to `ENCHANTMENTS` (`src/content/enchantments.ts`) beyond ETH-044's 5 starters (Keen, Venomous, Draining, Nimble, Warding), giving weapons, armor, shields and jewelry a richer variety of stat bonuses and combat/turn triggers.

## Why
ETH-044 established the data-driven `ENCHANTMENTS` registry and domain `effectHandlers` seam specifically so expanding the enchantment pool is mostly pure data entries.

## Acceptance criteria
- [ ] New special `EnchantmentDef` entries in `src/content/enchantments.ts` across weapons, armor, shields and jewelry
- [ ] Any new effect kinds added to `Effect` (`src/content/bundles.ts`) and registered via `SimDomain.effectHandlers`
- [ ] All entries pass `npm run validate:content` and render cleanly in the Enchantments Codex section
- [ ] Tests cover new trigger/effect behaviors and `npm run sim -- --seeds 50 --compare origin/main` checks balance impact

## Notes
- Examples to consider: flaming/frost on-hit damage, thorns (`trigger.struck`), swiftness/haste, light/sight, carry capacity, mana/Wits resonance, and gear-type-specific base profiles.

## Log
- 2026-11-22: Created alongside ETH-044 per Nate's request to expand the enchantment pool later.
- 2026-11-24: Moved from M2 to M5 in the backlog reorganization by theme.
