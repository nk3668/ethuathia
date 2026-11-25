---
id: ETH-186
title: The first four Omens and their town-tree unlock nodes
type: content
status: in-progress
priority: P1
milestone: M2.2
epic: risk-omens
size: M
depends_on: [ETH-185, ETH-132, ETH-159, ETH-117, ETH-044]
created: 2026-11-24
updated: 2026-11-25
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

## Plan (planning gate, 2026-11-25)
Ranks are the whole effect at that rank; `reward` is the total at that rank (ETH-185). Every number is a starting shape for ETH-161. Mechanism: each rank carries a named flag `omen.<id>.<rank>` (scope `monsters`), read by one module, `src/sim/stats/omenEffects.ts`, which turns the highest rank flag into a parameter table. Floors are planned after the run modifiers exist (`initDomains` runs first), so `planFloor` reads the table and passes `FloorRisk` into generation and a post-pass. With no Omen on, nothing is drawn or changed, so seeds replay identically.

| Omen (id) | Rank 1 / 2 / 3 | Reward 1 / 2 / 3 | Mechanism |
|---|---|---|---|
| Stalker's Ledger (`omen.stalkers_ledger`) | Templates roll as if 1 / 2 / 3 Danger deeper; out-of-depth chance +5 / +10 / +15 points; a templated or out-of-depth monster carries a find (one item rolled 1 / 2 / 3 floors deeper) with 30 / 50 / 70% | +10 / +20 / +30% | `templateChanceFor` and `rollOodDanger` read `draft.risk`; a post-pass on the plan's spawns adds `overlay.carries` |
| Deep Surge (`omen.deep_surge`) | The return-trip surge wave is x1.25 / x1.5 / x2 larger, rolls +10 / +20 / +30 points more templates, and has 1 / 2 / 3 more hunter patrols; each pursuer carries a find with 30 / 50 / 70% | +10 / +20 / +30% | `resolveSurgeWavePlan`, the template chance and the patrol split in `encounterSurge.ts`; carries added in `placeMonster` |
| Cursed Hoards (`omen.cursed_hoards`) | Gear is cursed with +10 / +20 / +30 points more chance (potions and scrolls +4 / +8 / +12); un-cursed gear is enchanted with +15 / +30 / +45 points more chance and the enchantment cap is +0 / +1 / +2 higher | +10 / +20 / +30% | `rollItemProperties(def, depth, rng, risk)`: the same draws with shifted thresholds, so secrecy (ETH-142: `identified: false` on every piece of gear) is unchanged |
| Armed Warbands (`omen.armed_warbands`) | A monster with threat 3 or more is armed with 25 / 45 / 65%: it gains the new Armed template (+1 armor, plus 0 / 1 / 2 from the overlay) and carries one piece of gear enchanted +1 / +2 / +3 (unidentified), dropped where it falls | +12 / +24 / +36% | post-pass on spawns and in `surgeFloor`; `template.armed` (tag `omen`) never rolls on its own |

Unlock nodes (nodes only unlock): Stalker's Ledger, Guild Hall row 1 column 2, 100 Renown; Deep Surge, Guild Hall row 4 column 2 (Tier II), 500 Renown; Cursed Hoards, Smithy row 3 column 2, 75 Trophies; Armed Warbands, Smithy row 4 column 2 (Tier II), 450 Trophies. Those are the free cells the tree headers name.

Also: a content check that every Omen has an unlock node, and `--omens id:rank,...` for `npm run sim`.

Sim policy (Nate 2026-11-25) replaces the T2 criterion for this item: T0, 20 seeds, no Omens, against f95c8ca (identical hashes expected), plus a 20-seed smoke run per Omen at rank 3. T2 is left to ETH-161.

## Log
- 2026-11-24: Created from town trees v4 (Nate approved): Gemini's risk toggles became Omen unlocks.
- 2026-11-25: Started (branch eth-186-first-town-omens, stacked on ETH-185). Planning gate done: see Plan.
