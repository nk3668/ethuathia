---
id: ETH-186
title: The first four Omens and their town-tree unlock nodes
type: content
status: idea
priority: P1
milestone: M2.2
epic: risk-omens
size: M
depends_on: [ETH-185, ETH-132, ETH-159, ETH-117, ETH-044]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Add four Omens and the Guild Hall and Smithy nodes that unlock them, from the approved town-tree page (v4).

| Omen | Effect per rank | Unlock node | Node cost |
|---|---|---|---|
| Stalker's Ledger | Templated and out-of-depth monsters appear earlier and more often, and drop better loot | Guild Hall Tier I | 100 Renown |
| Deep Surge | The return-trip surge sends denser hunter patrols; pursuers carry better loot | Guild Hall Tier II | 500 Renown |
| Cursed Hoards | Dungeon gear rolls cursed more often, but finds carry stronger enchantments | Smithy Tier I | 75 Trophies |
| Armed Warbands | Tougher monsters spawn armored with enchanted gear, which they drop when slain | Smithy Tier II | 450 Trophies |

## Why
The town trees pay for risk through Omens (`CLAUDE.md` §6, principle 3). These four use systems that already exist: monster templates (ETH-117), the return-trip surge, curses (ETH-044) and enchantments.

## Acceptance criteria
- [ ] Four Omen defs with 3 ranks each, built on ETH-185; each rank's effect is a run-wide modifier or run parameter, with no bonus percentages of their own beyond the Omen multiplier.
- [ ] The four unlock nodes sit in the tiers and rows above in `guildHall.ts` and `smithy.ts`.
- [ ] Each Omen's effect is measured: a fixed-seed test shows the change (more templated spawns, denser surge, more curses, armed foes dropping gear).
- [ ] Codex, tooltip and log text for each Omen and node.
- [ ] **T2 (100 seeds)** per Omen at rank 3 against Omens off, pasted in the PR.

## Notes
- Cursed Hoards replaces the Cursed Hoard Omen that ETH-067 listed for M6.
- Planning gate: refine the per-rank numbers against the real spawn, surge and loot code before starting.

## Log
- 2026-11-24: Created from town trees v4 (Nate approved): Gemini's risk toggles became Omen unlocks.
