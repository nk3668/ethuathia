---
id: ETH-179
title: A woodland race that heals by consuming the fallen but can't drink healing potions
type: content
status: idea
priority: P3
milestone: M4
epic: characters
size: M
depends_on: [ETH-160]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
A fourth race, an elf-like woodland folk (name and lore to be written, original), that regains HP by consuming the bodies of slain foes and cannot use healing potions.

## Why
Nate (2026-11-24): a race with a real tradeoff that changes how a run plays, not just its numbers. Tabled because it needs systems that don't exist yet.

## What it needs first
- **Corpses.** A monster's death removes it today (`src/sim/combat/death.ts`); there is no body to consume. Corpses would be a floor feature or item that decays after some turns.
- **Race traits that change rules**, not only attributes and speed: "can consume corpses", "healing potions don't work". The race innate-bundle and aptitude work (ETH-035, survey 1.1) is the natural home.
- **AI support.** The baseline must know to consume a nearby body when hurt instead of reaching for a potion, and the potion-quaffing logic must skip a race that can't use them. That fits M3 (behavior rules: a "consume corpse" action and condition) or M4 (class- and race-aware AI, ETH-038).

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate): name, lore, numbers, and how consuming works (time taken, HP per body, decay, monster types that can't be consumed)

## Log
- 2026-11-24: Created from Nate's idea; tabled to M4 because corpses, rule-changing race traits and AI support come first.
