---
id: ETH-082
title: Each weapon type scales damage off its own attribute
type: feature
status: done
priority: P1
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-033, ETH-043, ETH-118]
created: 2026-11-18
updated: 2026-11-19
---

## Summary
Weapon types name the attribute their damage scales with: swords and daggers use Finesse, axes and maces use Brawn, spells and staves use Wits, and so on.

## Why
Makes attributes and class choices interact with gear. Nate's idea in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [x] Base weapon types (ETH-043) have a `scalesWith` attribute; unarmed uses Brawn
- [x] Damage uses that attribute instead of always Brawn; the tooltip shows the breakdown
- [x] Spells scale with Wits once spells exist (ETH-037): no spells yet; staves use Wits, and ARCHITECTURE notes that ETH-037 uses the same `DAMAGE_FORMULA` with Wits
- [x] Baseline auto-equip weighs weapons by the wielder's attributes
- [x] Sim compare in the PR shows the expected change

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-118 (item properties) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-19: Started.
- 2026-11-19: Done. Weapon scaling is a derived item property (`src/sim/items/scaling.ts`, new `ItemDerivedProperty` in the ETH-118 system) that adds the weapon attribute's damage and removes Brawn's, each credited to its attribute with a tooltip label. Sword/dagger Finesse, axe/mace Brawn, staff Wits, unarmed Brawn (`UNARMED_ATTRIBUTE`). Same formula as before (+0.5 per point above 10). Auto-equip is still Pareto through `compareGear`, now wielder-weighted. Item tooltips show the wielder's scaling line, the Codex shows "Scales with".
- 2026-11-19: (default) The weapon's attribute replaces Brawn for damage entirely, with the same formula; alternatives: a weapon attribute on top of Brawn, or a different per-point rate per weapon type.
- 2026-11-19: (default) Brawn still gives Carry, HP and Force doors with any weapon; only the damage row swaps.
