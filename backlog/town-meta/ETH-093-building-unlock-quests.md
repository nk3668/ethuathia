---
id: ETH-093
title: Unlock town buildings by finishing a quest for each
type: feature
status: done
priority: P2
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-074, ETH-024, ETH-114, ETH-121]
created: 2026-11-18
updated: 2026-11-25
---

## Summary
Each building opens through its own **building quest**, a contract themed on the building (e.g. the Smithy opens after a run brings an anvil back from floor 3). It takes a contract slot, pays currency like any contract, and only one building quest can be taken per run. Quests open in a chain starting with the Smithy: a new building's quest is offered once a set share of the nodes in the open buildings is bought, so the player alternates between spending and questing.

## Why
Unlocks become story beats. Decided in Nate's interview answers (2026-11-18). Replaces ETH-074's milestone conditions.

## What exists today
- Buildings: the Guild Hall (open from the start) and the Smithy (a placeholder that opens on `reachDepth 3`, ETH-074). The other buildings arrive with their milestones (Library M3, Ossuary and Tavern M7, Temple and Cartographer M8).
- Contracts: one, *Recover the relic* (a `recover` objective whose item is placed on the bottom floor). One contract slot to start; the Guild Hall sells a second.
- Milestones already open buildings and record the unlock, and an `objectiveDone` milestone counts once some run ended with that objective complete.
- The dungeon is 6–10 floors deep, so any quest up to floor 6 can always be done.

## Acceptance criteria
- [x] Spec reviewed by Nate before building (spec gate)
- [x] **A recover objective at a set depth.** `RecoverObjective.depth?: number` (default: the bottom floor, as today). The quest item is placed on that floor, so a quest can ask for an item from floor 3.
- [x] **Building quests are contracts.** `ContractDef.opens?: string` names the building it opens. A building with a quest has `unlock: { kind: 'objectiveDone', owner: { kind: 'contract', id }, exited: true }`: the milestone counts only when the run ends with the party out of the dungeon (victory or retreat) and the objective complete. `exited` is a new optional flag on the `objectiveDone` milestone.
- [x] **Quests stay doable as dungeons change.** Dungeon depth will vary (new dungeon variants, and options that make a dungeon deeper or shallower), so a content check fails if a building quest's floor is deeper than the shallowest dungeon the player could take it into (`depth.min` of every dungeon def). A quest may later name the dungeon it belongs to; that's out of scope here.
- [x] **The Smithy's quest** replaces its `reachDepth 3` milestone: *The Cold Anvil*: bring the guild's lost anvil back from floor 3 (a new heavy relic item, `item.guild_anvil`). It pays a Trophies reward.
- [x] **When a quest is offered** (Prepare screen contract list): its building is still locked, and the share of bought nodes across open buildings is at least the quest's `offerAt` (0 to 1; the Smithy's is 0). `BUILDING_QUEST_SHARE` (default 0.3) is the shared default for later buildings. A locked quest shows in the list, greyed, with what it needs ("Buy 30% of the open buildings' upgrades: 4 of 13").
- [x] **One building quest per run**: the Prepare screen refuses a second one with a reason. It still uses a contract slot, and the run still needs every chosen contract done for a victory.
- [x] **Background quests** (the Ossuary's "bury the first fallen" and the Tavern's "an adventurer survives five runs") are milestones, not contracts. Their buildings don't exist in M2, so this item only checks that the milestone system can express them (a test with fixture content), and they are built with their buildings.
- [x] **Shown:** the run summary has an unlock line ("The Smithy is open: you brought the anvil home") and the Town tab highlights the newly opened building; the contract tooltip and Codex entry say which building it opens.
- [x] **Existing profiles keep buildings they already opened** (the unlock record in the `milestones` slice stays, whatever the building's milestone becomes).
- [x] **Tests:** recover at a set depth places the item there; a victory or retreat with the quest done opens the building, a wipe does not; the offer gate at 0, below and at the threshold; a second building quest is refused; an old save with the Smithy open keeps it open; the quest is gone from the list once its building is open.

## Notes
- Tier quests (a building's next tier) are ETH-170 and reuse all of this.
- The anvil is heavy on purpose: carrying it out is the quest's risk, like the relic.
- **T1 balance check** (20 seeds): only a new contract is added; check the Smithy quest is completed in a plausible share of runs that take it (`npm run sim` may need a `--contract` flag; add it if it doesn't exist).

Decisions (Nate, 2026-11-24, defaults accepted):
- A retreat with the quest item carried out counts, like a victory.
- The Smithy quest is offered from the first run.
- `BUILDING_QUEST_SHARE` = 30% of the open buildings' nodes. ETH-161 tunes it.
- Quest rewards: about the relic contract's reward, paid in the building's own currency where it has one (Smithy: Trophies).

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-114 (objective engine), ETH-121 (shared conditions) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Progression discussion with Nate: building quests are contracts (one per run, uses a slot, pays currency), chained from the Smithy, gated by the share of nodes bought. Tier quests split out to ETH-170.
- 2026-11-24: (spec gate) Detailed spec written against the code (contracts, objectives, milestones, the 6–10 floor dungeon); awaiting Nate's review.
- 2026-11-24: Nate asked Claude to review and settle #101 with the defaults. Added a content check that quest floors stay within the shallowest dungeon (dungeon depth will vary). Status ready.
- 2026-11-25: Done. Offer share counts nodes of open buildings in open tiers: plain node 1, ranked node by ranks/max, a pick-one group once. Added `--contract` to the sim harness; T1 (20 seeds, Smithy quest): 14 victories, 6 wipes (the party always reached floor 3 and found the anvil; wipes were on the walk out or on floor 3). Test-only note: the full test run timed out on some long tests under machine load; they pass alone.
