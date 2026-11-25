---
id: ETH-132
title: Rebuild the Guild Hall tree deeper, with ranked nodes and tiered costs
type: content
status: ready
priority: P1
milestone: M2.1
epic: town-meta
size: M
depends_on: [ETH-085, ETH-172, ETH-170, ETH-036]
created: 2026-11-20
updated: 2026-11-24
---

## Summary
Rebuild the Guild Hall tree in `src/content/town/guildHall.ts` as Tiers I–II of the approved town-tree page (v4): ranked nodes, a quest-locked Tier II, and costs that grow by tier. This item ships the nodes that need no new mechanics; ETH-187 adds the rest and ETH-186 adds the Omen unlocks.

## Why
ETH-085 increased banked Renown per 10-floor victory from ~250 to ~1,120 (+348%), while the whole Guild Hall tree still totals ~2,020 Renown, so it can be finished in about 2 victories. Nate (2026-11-24) wants slower pacing where every run still buys something: deeper trees (about 15 to 25 nodes), cheap early nodes, costs growing by tier and some ranked nodes (`CLAUDE.md` §4).

## The tree (approved v4, 2026-11-24)
The source is the Guild Hall panel of the town-tree page (artifact "Ethuathia town trees", https://claude.ai/artifact/GG26YiRZpYzgWLsxfQ5XHP). Costs are a starting shape for ETH-161, not final tuning.

**Tier I** (open from the start)
| Row | Node | Effect | Cost (Renown) | Item |
|---|---|---|---|---|
| 1 | Second Berth | Party size +1 | 60 | here |
| 1 | Hardy Recruits I–V | +3 max HP per rank | 40, ×1.5 per rank | here |
| 2 | Contract Bounty I–III | +10% contract reward per rank | 80, ×1.5 | here |
| 2 | Scout's Charter | Unlocks the Outrider (ETH-036 reveal) | 150 | here |
| 2 | Field Rations I–III | +1 starting field ration per adventurer per rank | 50, ×1.5 | ETH-187 |
| 3 | pick: Contract Board / Extraction Drills I–III | Contract slot +1 / +10% move speed while fleeing per rank | 250 / 90, ×1.5 | here / ETH-187 |
| 3 | Marsh Envoy | Unlocks the Fenling | 200 | here |
| 3 | Omen: Stalker's Ledger | Unlocks an Omen | 100 | ETH-186 |

**Tier II** (quest: *The Long Muster*, reach floor 6 and walk out)
| Row | Node | Effect | Cost | Item |
|---|---|---|---|---|
| 4 | Library Ties | Unlocks the Lorekeeper | 250 | here |
| 4 | Medic's Satchel | Every adventurer starts with a mending draught (a kit item, never sold) | 450 | here |
| 4 | Omen: Deep Surge | Unlocks an Omen | 500 | ETH-186 |
| 5 | pick: Guild Chronicles I–III / Waymark Lanterns | +10% in-run XP per rank / +2 sight and +10% speed on the return trip | 250, ×1.6 / 600 | here / ETH-187 |
| 5 | Seasoned Constitution I–III | +8 status resistance per rank | 200, ×1.5 | here |
| 6 | pick: Second Contract Board / Rule Clerk | Contract slot +1 / rule slot +1 (inert until M3; its tooltip says so) | 1,200 each | here |
| 6 | Quartermaster's Mystery Crate | Opt-in: one random unidentified curiosity in the pack at the start of each run | 500 | ETH-187 |

Tier III (Training Grounds, Guild Trophy Room, Guild Horn, Warden) and the Retreat threshold doctrine are later milestones and not built here.

**Guild Chronicles is in-run XP only.** Class Mastery still rises with it, because Mastery XP counts the in-run XP each member earned (`src/meta/mastery.ts`); the run-end Mastery bonus is unaffected. Its tooltip says both.

## Acceptance criteria
- [ ] `src/content/town/guildHall.ts` holds the "here" nodes above, with ranks via ETH-172 and the Tier II gate via ETH-170 (*The Long Muster*'s contract def ships here). Pick-one rows whose other half belongs to ETH-187 ship as single nodes; ETH-187 turns them into picks.
- [ ] **No roster upgrades** (Nate, 2026-11-24): the roster is a flat `ROSTER_SIZE` = 50. Remove the `rosterSize` capacity key and its nodes (Roster Ledger, Open Muster), and Drill Yard.
- [ ] Guild Chronicles multiplies XP earned in the run (kills and anything else that grants XP) and nothing else; a test shows Mastery gains follow from it.
- [ ] Every tier with a numeric node also offers a capability (`CLAUDE.md` §4); every node has tooltip and Codex text; `validateContent` passes.
- [ ] **Old saves:** owned node ids that no longer exist are refunded at their old price in a migration; nodes that keep their id keep their purchase.
- [ ] Tests that pin Guild Hall costs or ids are updated, plus a test that Tier II stays locked until *The Long Muster* is done.
- [ ] **T1 (20 seeds):** the harness still runs (it fields a fixed party and buys nothing, so no change is expected); ETH-161 measures pacing.

## Notes
- Defaults: old saves get a refund for removed nodes rather than a mapping to new ones; Rule Clerk ships inert.
- Status resistance already exists as the `statusResist` stat; Seasoned Constitution adds to it.

## Log
- 2026-11-20: Created from PR #82 (ETH-085) review balance note.
- 2026-11-23: Renumbered from ETH-129 to ETH-132 on rebase onto main (ETH-129 was claimed by Guild Hall constant respawn in PR #83).
- 2026-11-24: Progression discussion with Nate: slower pacing and deeper trees; this now rebuilds the Guild Hall tree on ETH-172 ranks and tiers.
- 2026-11-24: (spec gate) Proposed tree written; the proposal moved to the town-tree page. Nate: flat roster of 50.
- 2026-11-24: Town trees v4 approved (Gemini's themed rework merged with doctrines, Omen unlocks and Hardy Recruits). Moved to M2.1 as P1 and `ready`; nodes needing new mechanics split out to ETH-187, Omen nodes to ETH-186.
