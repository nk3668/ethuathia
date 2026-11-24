---
id: ETH-170
title: Building-tier quests open each building's next tier
type: feature
status: done
priority: P2
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-093, ETH-172]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
Once 50% of all of a building's available nodes are bought (from any of its open tiers), a harder quest in that building's theme is offered. Completing it opens the building's next tier.

## Why
Nate (2026-11-24): buildings should grow in stages, each stage opened by a thematic and slightly harder quest (deeper dungeon, tougher foe). Higher tiers hold stronger nodes. See `CLAUDE.md` §4 (Building quests).

## How it fits what exists
- ETH-172 (done) gives buildings `tierGates: { fromTier, unlock: Milestone }[]`; a closed gate locks every row from `fromTier` down.
- ETH-093 makes building quests contracts that open a building through an `objectiveDone` milestone with `exited: true`. A tier quest is the same thing pointed at a gate: the gate's `unlock` names the tier quest's contract.
- No building has gates yet. The deeper Guild Hall (ETH-132) and the Smithy tree (ETH-159) bring the first real gates, so **this item ships the mechanism only**, tested with fixture content. Each building's tier quests (the table below) ship with the item that adds its gates: *The Long Muster* with ETH-132, *Star-Iron* with ETH-159.

## Acceptance criteria
- [x] Spec reviewed by Nate before building (spec gate)
- [x] **Tier quests are contracts** with `opens: { building, fromTier }` (ETH-093's `opens` widened). Each tier gate's `unlock` is the matching `objectiveDone` milestone with `exited: true`.
- [x] **Offered** when the building is open, the gate is closed, and the bought share of the building's nodes **in its open tiers** is at least `TIER_QUEST_SHARE` (default 0.5). A ranked node (ETH-172) counts as bought in proportion to its ranks. Before then the quest shows greyed with its progress ("Buy half of the Smithy's open upgrades: 5 of 10").
- [x] **Counts as a building quest** for the one-per-run limit and uses a contract slot (ETH-093).
- [x] **Harder than the one before:** a content check (in `validateContent`, so ETH-132 and ETH-159 get it for free) that each building's quests ask for a deeper floor than its previous one.
- [x] **Shown:** the run summary line ("The Smithy's second tier is open"), a Town highlight on the newly opened band, and the gate divider's tooltip names the quest.
- [x] **Tests:** the offer threshold with plain and ranked nodes; completing the quest opens exactly that gate; a wipe doesn't; a gate already opened stays open after content changes.

## Proposed quests (for Nate to shape)
| Building | Opens | Quest | Asks |
|---|---|---|---|
| Smithy | building (ETH-093) | *The Cold Anvil* | Bring the guild's anvil back from floor 3 |
| Smithy | tier II | *Star-Iron* | Bring a lump of star-iron back from floor 5 |
| Guild Hall | tier II | *The Long Muster* | Reach floor 6 and walk back out |
| Smithy, Guild Hall | tier III | (later) | Floor 8 or a named foe, once uniques exist (M5) |

The dungeon is 6–10 floors deep, so floors 3, 5 and 6 can always be done. Tier III quests wait for deeper content, so in M2 each building has at most two tiers.

## Notes
Example: all of the Smithy's tier 1 bought and nothing in tier 2 still crosses 50% once tier 2 is open, so the tier 3 quest appears.

Decisions (Nate, 2026-11-24, defaults accepted):
- `TIER_QUEST_SHARE` is 50% of the nodes in the building's open tiers, as in `CLAUDE.md` §4. ETH-161 tunes it.
- A ranked node counts in proportion (2 of 5 ranks = 0.4 of a node).
- The quest table above stands; its quests ship with ETH-132 and ETH-159.

## Log
- 2026-11-24: Created from the progression discussion with Nate.
- 2026-11-24: (spec gate) Detailed spec written on top of ETH-172's tier gates and ETH-093's building quests, with a proposed quest table; awaiting Nate's review.
- 2026-11-24: Nate asked Claude to review and settle #101 with the defaults. Review fix: this item ships the mechanism with fixture tests; each tier quest ships with the tree item that adds its gate (ETH-132, ETH-159). Status ready.
- 2026-11-25: Done (mechanism only; no shipped building has gates). `opens` is a building id or `{ building, fromTier }`. Offer uses `upgradeShare(profile, building)` over that building's nodes in its open tiers; a tier quest is offered only for the topmost closed gate and is hidden while its building is locked. Depth-order content check (building quest, then tier quests in gate order; quests with no set floor are skipped). Shown: run summary line, "New" on the Town tab and band, gate divider tooltip names the quest. Sim: 20 seeds, state hashes identical to origin/main.
