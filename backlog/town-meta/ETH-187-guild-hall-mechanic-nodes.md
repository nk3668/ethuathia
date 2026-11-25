---
id: ETH-187
title: Guild Hall nodes that need new mechanics - Field Rations, Extraction Drills, Waymark Lanterns, Mystery Crate
type: feature
status: idea
priority: P1
milestone: M2.1
epic: town-meta
size: M
depends_on: [ETH-132, ETH-176, ETH-148]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Build the four Guild Hall nodes from town trees v4 that need something the sim doesn't do yet, and turn their rows into the pick-one choices the page shows.

| Node | Effect | Row |
|---|---|---|
| Field Rations I–III | Each adventurer starts the run with +1 field ration per rank. Eating one applies Regenerating (1 HP a turn) for 10 turns; another refreshes it | Tier I row 2 |
| Extraction Drills I–III | +10% movement speed per rank while fleeing | Tier I row 3, pick with Contract Board |
| Waymark Lanterns | +2 sight and +10% speed during the return trip | Tier II row 5, pick with Guild Chronicles |
| Quartermaster's Mystery Crate | Opt-in on Prepare: one random unidentified curiosity in the pack each run (a blessed potion, a rare scroll, a ring… or a cursed dud) | Tier II row 6 |

## Why
Nate (2026-11-24) asked that Field Rations and Extraction Drills fit real mechanics: the sim has no out-of-combat regeneration, and fleeing is an HP threshold (`src/sim/combat/fleeConfig.ts`), not a roll.

## Acceptance criteria
- [ ] A field ration food item (category `food`, applies `status.regenerating` for 10 turns) that the baseline AI eats when hurt and out of combat; Field Rations adds it to every starting kit (a kit item, never sold).
- [ ] Extraction Drills raises speed only while an adventurer is fleeing (a conditional modifier the stat tooltip names); a fixed-seed test shows a fleeing adventurer outpacing the same foe.
- [ ] Waymark Lanterns applies only on the return trip, as a run-wide modifier scoped to it (ETH-115).
- [ ] The Mystery Crate is an opt-in toggle on Prepare once bought; its roll uses the run's seeded RNG and draws from a validated table that includes cursed items.
- [ ] Contract Board / Extraction Drills and Guild Chronicles / Waymark Lanterns become pick-one pairs (a save that owned the ETH-132 single node keeps it).
- [ ] Codex, tooltip and log text for each; **T2 (100 seeds)** with all four on against off.

## Notes
- Extraction Drills may need a nerf (Nate); ETH-161 watches it.
- Planning gate: refine against the real food, flee and kit code before starting.

## Log
- 2026-11-24: Split out of ETH-132 when town trees v4 was approved.
