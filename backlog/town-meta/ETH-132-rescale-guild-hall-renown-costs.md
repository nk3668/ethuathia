---
id: ETH-132
title: Rebuild the Guild Hall tree deeper, with ranked nodes and tiered costs
type: content
status: idea
priority: P2
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-085, ETH-172, ETH-170, ETH-036]
created: 2026-11-20
updated: 2026-11-24
---

## Summary
Rescale Guild Hall upgrade costs in `src/content/town/guildHall.ts` to match the higher Renown income introduced by depth-weighted rewards (ETH-085).

## Why
ETH-085 increased banked Renown per 10-floor victory from ~250 to ~1,120 (+348%), while the full Guild Hall tree in `src/content/town/guildHall.ts` still totals ~2,020 Renown (50–600 per node). That drops full tree completion from ~8 victories to ~2. Logged as a follow-up from the PR #82 review so cost tuning can be done deliberately alongside other M2 town-meta work.

## Decided (Nate, 2026-11-24)
Pacing should feel slower than about 2 victories for the whole tree, yet every run should buy something. Trees get deeper (about 15 to 25 nodes) with cheap early nodes, costs growing by tier, and some ranked numeric nodes (ETH-172). So this becomes: rebuild the Guild Hall tree to that shape, not just rescale its costs.

## What exists to build on
- The tree today: 8 nodes, 2,020 Renown (Second, Third and Fourth Berth; Roster Ledger; Hardy Recruits or Contract Board; Drill Yard or Open Muster).
- Ranks (ETH-172), tier gates opened by a tier quest (ETH-170; *The Long Muster*: reach floor 6 and walk out), class and race unlock nodes with reveal milestones (ETH-036).
- Capacities a node can raise: party size, contract slots, rule slots (roster size goes away, below). Bundles can add stats to every adventurer.
- Income today (200 seeds, solo Vanguard): about 340 Renown banked per run on average, about 1,100 per victory.

## Proposed tree (for Nate to shape)
The proposal is the **Guild Hall panel of the town-tree page** Nate reviews (artifact "Ethuathia town trees", https://claude.ai/artifact/GG26YiRZpYzgWLsxfQ5XHP), which replaced the first table here on 2026-11-24. In short:
- **Tier I** (open from the start): Second Berth (party +1), Hardy Recruits I–V, Contract Bounty I–III, Scout's Charter (Outrider), a Contract Board / Drill Yard pick, Marsh Envoy (Fenling).
- **Tier II** (*The Long Muster*): Library Ties (Lorekeeper), Medic's Satchel, a Footwork Drills / Seasoned Hands pick, a Second Contract Board / Rule Clerk pick.
- **Tier III** (M4): Training Grounds, which opens the talent trees (ETH-088).

The Reaver and Stonekin unlock in the Smithy (ETH-036, ETH-159). The third and fourth party berths sit in other buildings, so party size isn't bought in one place; Nate is choosing between a cap of 4 (berths in the Guild Hall, Smithy and Library) and one berth in every building. Costs stay in the range above: the cheapest purchase under 100 Renown, about 4–5 average runs for Tier I and about 18 more for Tier II.

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate): the tree, names and costs above, or his changes
- [ ] `src/content/town/guildHall.ts` holds the new tree: ranks via ETH-172, the Tier II gate with *The Long Muster* via ETH-170 (its contract def ships here), and ETH-036's unlock nodes placed as above
- [ ] Every tier with a numeric node also offers a capability (CLAUDE.md §4); every node has tooltip and Codex text; the `validateContent` checks pass (tree rules, quest depth order)
- [ ] **No roster upgrades** (Nate, 2026-11-24): the roster holds a flat `ROSTER_SIZE` = 50 adventurers. Remove the `rosterSize` capacity key and its nodes (Roster Ledger, Open Muster); Contract Bounty and Medic's Satchel take their places. Medic's Satchel adds a mending draught to every adventurer's starting kit (a kit item, so never sold, ETH-176/171).
- [ ] **Old saves:** owned node ids that no longer exist are refunded at their old price in a migration (today a removed id is silently ignored, which would lose the Renown); nodes that keep their id keep their purchase
- [ ] Tests that pin Guild Hall costs or node ids updated; a test that Tier II is locked until *The Long Muster* is done
- [ ] **T1 (20 seeds):** confirm the harness still runs (it fields a fixed party and doesn't buy upgrades, so no change expected); ETH-161 measures the pacing for real

## Notes
- Current node costs in `src/content/town/guildHall.ts`: 50, 80, 120 / 120 (tier 2 exclusive), 250, 600, 400 / 400 (tier 4 exclusive) — 2,020 total across all nodes (1,500 for one branch per exclusive tier).
- Nate (2026-11-24) isn't worried about fine balance yet: the costs are a starting shape for ETH-161, not a final tuning.

Open decisions:
- (default) The Guild Hall panel of the town-tree page: two tiers plus a later Tier III, about 22 average runs to finish Tiers I and II.
- (default) Rule Clerk sits here now and does nothing until M3's rules editor (its tooltip says so). Alternative: leave the row-7 pick for M3.
- (default) Old saves get a refund for removed nodes rather than a mapping to new ones.

## Log
- 2026-11-20: Created from PR #82 (ETH-085) review balance note.
- 2026-11-23: Renumbered from ETH-129 to ETH-132 on rebase onto main (ETH-129 was claimed by Guild Hall constant respawn in PR #83).
- 2026-11-24: Progression discussion with Nate: slower pacing and deeper trees; this now rebuilds the Guild Hall tree on ETH-172 ranks and tiers.
- 2026-11-24: (spec gate) Proposed tree written (17 nodes, two tiers, ETH-036 unlock nodes and *The Long Muster* gate); awaiting Nate's review.
- 2026-11-24: The proposal moved to the town-tree page (classes spread across buildings, party berths spread out). Nate: drop roster upgrades for a flat roster of 50; Contract Bounty and Medic's Satchel replace the roster nodes.
