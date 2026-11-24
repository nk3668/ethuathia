---
id: ETH-112
title: Weighted gear score so auto-equip can take trade-offs
type: feature
status: idea
priority: P3
milestone: M3
epic: combat-items
size: M
depends_on: [ETH-043]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Lets auto-equip weigh gear with trade-offs (more damage but less accuracy) through a weighted gear score, instead of only taking pieces that are at least as good in every stat.

## Why
ETH-043 auto-equips only Pareto upgrades (`compareGear` / `bestUpgrade`), so a piece like the Flanged mace (+3 damage, −1 accuracy) is never put on unless the player does it. Nate tabled this for now: he finds keep-or-swap decisions interesting and wants to revisit it, possibly as a behavior-rule choice (`CLAUDE.md` §5.2) rather than a fixed baseline score.

## Acceptance criteria
- [ ] A gear score with per-stat weights, explainable in the trace ("+3 damage outweighs −1 accuracy")
- [ ] The player chooses how trade-offs are handled, for example a rule action or doctrine setting, with Pareto-only as an option
- [ ] Sim compare shows no flip-flopping between two pieces

## Notes
- ETH-142's `hiddenGearMargin` (`src/sim/items/hiddenValue.ts`) counts one enhancement point the same in every stat. A weighted gear score should feed that margin too, so the unidentified-gear gate weighs gains the same way auto-equip does.
- Decide with Nate whether weights are fixed, per class (ETH-038) or set by the player.

## Log
- 2026-11-18: Created from Nate's answer to the ETH-043 auto-equip question (tabled; keep Pareto-only for now).
- 2026-11-24: Added a note from the M1.5/M1.6 fan-out (Nate approved).
