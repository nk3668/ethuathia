---
id: ETH-170
title: Building-tier quests open each building's next tier
type: feature
status: idea
priority: P2
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-093, ETH-172]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Once 50% of all of a building's available nodes are bought (from any of its open tiers), a harder quest in that building's theme is offered. Completing it opens the building's next tier.

## Why
Nate (2026-11-24): buildings should grow in stages, each stage opened by a thematic and slightly harder quest (deeper dungeon, tougher foe). Higher tiers hold stronger nodes. See `CLAUDE.md` §4 (Building quests).

## How it fits what exists
- ETH-172 (done) gives buildings `tierGates: { fromTier, unlock: Milestone }[]`; a closed gate locks every row from `fromTier` down.
- ETH-093 makes building quests contracts that open a building through an `objectiveDone` milestone with `exited: true`. A tier quest is the same thing pointed at a gate: the gate's `unlock` names the tier quest's contract.
- No building has gates yet. The deeper Guild Hall (ETH-132) and the Smithy tree (ETH-159) bring the first real gates, so this item ships the mechanism with each building's first tier quest, and those items place the gates.

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] **Tier quests are contracts** with `opens: { building, fromTier }` (ETH-093's `opens` widened). Each tier gate's `unlock` is the matching `objectiveDone` milestone with `exited: true`.
- [ ] **Offered** when the building is open, the gate is closed, and the bought share of the building's nodes **in its open tiers** is at least `TIER_QUEST_SHARE` (default 0.5). A ranked node (ETH-172) counts as bought in proportion to its ranks. Before then the quest shows greyed with its progress ("Buy half of the Smithy's open upgrades: 5 of 10").
- [ ] **Counts as a building quest** for the one-per-run limit and uses a contract slot (ETH-093).
- [ ] **Harder than the one before:** the quest table below, checked by a content test that each building's quests ask for a deeper floor (or a tougher kill) than its previous one.
- [ ] **Shown:** the run summary line ("The Smithy's second tier is open"), a Town highlight on the newly opened band, and the gate divider's tooltip names the quest.
- [ ] **Tests:** the offer threshold with plain and ranked nodes; completing the quest opens exactly that gate; a wipe doesn't; a gate already opened stays open after content changes.

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

Open decisions:
- (default) `TIER_QUEST_SHARE` is 50% of the nodes in the building's open tiers, as in `CLAUDE.md` §4. ETH-161 tunes it.
- (default) A ranked node counts in proportion (2 of 5 ranks = 0.4 of a node). Alternative: a node counts once any rank is bought.

## Log
- 2026-11-24: Created from the progression discussion with Nate.
- 2026-11-24: (spec gate) Detailed spec written on top of ETH-172's tier gates and ETH-093's building quests, with a proposed quest table; awaiting Nate's review.
