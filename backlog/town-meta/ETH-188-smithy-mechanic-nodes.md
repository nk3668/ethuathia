---
id: ETH-188
title: Smithy nodes that need new mechanics - Maker's Marks, class-tier kits, Forge Stamps, Apprentice Trinket, Field Salvage Kit
type: feature
status: idea
priority: P1
milestone: M2.1
epic: town-meta
size: M
depends_on: [ETH-159, ETH-176, ETH-142]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Build the Smithy nodes from town trees v4 that need something the sim or the Prepare screen doesn't do yet.

| Node | Effect | Row |
|---|---|---|
| Maker's Marks I–III | +8% chance per rank to identify gear on pickup | Tier I row 1 |
| Artisan Implements / Tailored Attire (pick one) | Each class's starting main-hand / defensive piece upgrades to that class's own Tier-1 item | Tier I row 2 |
| Forge Stamps / Apprentice Trinket (pick one) | Keen, Warding and Nimble stamps assigned per adventurer on Prepare, with class defaults / a class-matched ring or amulet for everyone | Tier II row 6 |
| Field Salvage Kit | Opt-in on Prepare: overloaded adventurers break unwanted plain gear into weightless scrap worth at-risk Trophies; never upgrades or enchanted items | Tier II row 6 |

## Why
Gemini's rework made Smithy kits class-owned so casters benefit too (a staff or focus, not only a sword). That needs a per-class upgrade path in `ClassDef`, a per-adventurer loadout choice on Prepare, and a new AI inventory action.

## Acceptance criteria
- [ ] Every class names its Tier-1 main-hand and defensive kit item in `ClassDef`; `validateContent` checks they exist and fit the class's gear.
- [ ] Maker's Marks rolls on pickup with the seeded RNG, and an identified item logs and reveals as ETH-142 requires (no leak of unidentified state).
- [ ] Forge Stamps: the Prepare loadout step lets each adventurer pick a stamp (defaulting by class); random recruits get the default. Apprentice Trinket picks the class-matched jewelry.
- [ ] Field Salvage Kit is a Prepare toggle; when on and overloaded, the baseline AI salvages the lowest-value plain item instead of dropping it, and the scrap's Trophies join the at-risk total.
- [ ] Codex, tooltip and log text for each; **T2 (100 seeds)** with the nodes on against off.

## Notes
- If the Prepare loadout step proves big, split Forge Stamps into its own item at the planning gate.

## Log
- 2026-11-24: Split out of ETH-159 when town trees v4 was approved.
