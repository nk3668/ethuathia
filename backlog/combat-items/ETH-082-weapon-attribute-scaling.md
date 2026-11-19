---
id: ETH-082
title: Each weapon type scales damage off its own attribute
type: feature
status: ready
priority: P1
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-033, ETH-043]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Weapon types name the attribute their damage scales with: swords and daggers use Finesse, axes and maces use Brawn, spells and staves use Wits, and so on.

## Why
Makes attributes and class choices interact with gear. Nate's idea in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] Base weapon types (ETH-043) have a `scalesWith` attribute; unarmed uses Brawn
- [ ] Damage uses that attribute instead of always Brawn; the tooltip shows the breakdown
- [ ] Spells scale with Wits once spells exist (ETH-037)
- [ ] Baseline auto-equip weighs weapons by the wielder's attributes
- [ ] Sim compare in the PR shows the expected change

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
