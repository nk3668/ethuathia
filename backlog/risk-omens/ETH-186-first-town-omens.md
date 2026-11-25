---
id: ETH-186
title: The first four Omens and their town-tree unlock nodes
type: content
status: done
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
- [x] Four Omen defs with 3 ranks each, built on ETH-185; each rank's effect is a run-wide modifier or run parameter, with no bonus percentages of their own beyond the Omen multiplier.
- [x] The four unlock nodes sit in the tiers and rows above in `guildHall.ts` and `smithy.ts`.
- [x] Each Omen's effect is measured: a fixed-seed test shows the change (more templated spawns, denser surge, more curses, armed foes dropping gear).
- [x] Codex, tooltip and log text for each Omen and node.
- [x] **Sim policy (Nate 2026-11-25) instead of T2:** T0 (20 seeds, no Omens) identical, and a 20-seed smoke run per Omen at rank 3; T2 is left to ETH-161. Results in the Log.

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
- 2026-11-25: Done (commit 2a04a76, stacked on ETH-185 f95c8ca). Four Omens with three ranks each in `src/content/townOmens.ts`, one flag per rank, numbers in `src/sim/stats/omenEffects.ts`. Decisions: nodes sit in the free cells (Guild Hall row 1 and row 4, Smithy row 3 and row 4, column 2); rewards +10/20/30% (Stalker's Ledger, Deep Surge, Cursed Hoards) and +12/24/36% (Armed Warbands); "Armed" is a new `template.armed` with the `omen` tag, which `rollTemplates` skips so seeds with no Omen are unchanged; the Armed Warbands skip a monster that already has two templates; a find is one item from the loot table 1 to 3 floors deeper (gear, potions, scrolls, anything but gold, junk and relics); Cursed Hoards moves thresholds in the same draw sequence, so gear on a floor can differ once a roll changes (the layout never does); the baseline AI's hidden-gear margin still assumes the 10% base curse chance. Added the content check (`reachabilityProblems` names an Omen no node unlocks) and `--omens id:rank,...` for `npm run sim` (also in `--compare` and `--json`). Docs: ARCHITECTURE "The first four Omens". Tests: `test/sim/townOmens.test.ts` (content, per-Omen effect on fixed seeds, secrecy of finds and gear, surge wave), reachability and CLI tests.
- 2026-11-25: Sim (commit 2a04a76): T0, 20 seeds, no Omens, `--compare f95c8ca`: every metric identical, all 20 state hashes the same. Smoke, 20 seeds each, rank 3, fresh preset (Omens off: depth 6.20, win 25%, wipe 75%, 5 victories): Stalker's Ledger depth 6.3, win 20%, wipe 80%, items picked up 41.6 (29.6 off); Deep Surge depth 6.2, win 20%, wipe 80%, relic-run return-trip lethality 20% (1/5); Cursed Hoards depth 6.7, win 20%, wipe 80%; Armed Warbands depth 4.9, win 15%, wipe 85%, kills 62 (90 off). No stalls, no crashes, no turn-cap hits. Notes for ETH-161: Cursed Hoards did not cost depth (the enchantments help more than the curses hurt the baseline AI), so it looks underpriced; Armed Warbands is the hardest by far at the same reward bracket.
- 2026-11-25: Review fixes (Gemini, cb96209): the four base enchantments go to +5, so Cursed Hoards' higher cap can reach +4 and +5 as its text says; Armed Warbands carry a weapon or armor piece only, never jewelry; Deep Surge adds twice the rank's patrol count in patrolling monsters, split into at least that many extra groups; Cursed Hoards ranks take scope `all`; flag-only Omens log without a scope; `--party-sweep` passes `--omens` and `--contract`. Gemini also moved Stalker's Ledger to row 3, column 3; Nate had it put back in row 1, column 2 as approved, and the Armed Warbands text now says "weapon or armor piece". Sim (cb96209): T0, 20 seeds, no Omens, `--compare 3ae4660`: all 20 state hashes the same. Smoke, 20 seeds, rank 3: Deep Surge win 20% (same), 5 hashes differ; Cursed Hoards metrics identical, all hashes differ (higher enchantments); Armed Warbands win 10% (15% before), wipe 90%; no stalls or crashes. Note for ETH-161: Deep Surge is now harder at the same reward.
