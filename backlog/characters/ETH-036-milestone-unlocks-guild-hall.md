---
id: ETH-036
title: Milestone-gated class and race unlocks bought at the Guild Hall
type: feature
status: idea
priority: P1
milestone: M2
epic: characters
size: M
depends_on: [ETH-034, ETH-063, ETH-121, ETH-160]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
Reaching a milestone in a run (find a spellbook, reach floor 10) makes a class or race available; the player then buys it at the Guild Hall.

## Why
Discovery plus a spending choice. See `CLAUDE.md` §4 (Guild Hall).

## What exists today
- A content id that some upgrade node unlocks (`{ kind: 'unlock', id }`) is locked until that node is owned, and open otherwise (`src/meta/prepare/available.ts`). So "the Guild Hall sells a class" is already just a node with an unlock grant.
- Milestones (ETH-074, ETH-093) already open things on a run's end and record the unlock in the `milestones` slice, with run-summary lines.
- ETH-160 added the Outrider, Lorekeeper, Reaver, Stonekin and Fenling, all open from the start for now. Random recruits draw from the available set.

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] **Revealed by a milestone.** `UpgradeNodeDef.reveal?: Milestone`. Until it is met, the node can't be bought; the tree shows it as a sealed node with its milestone ("Revealed when you reach floor 4") and its cost. Met reveals are recorded in the `milestones` slice under the node's id, like building unlocks, and get a run-summary line ("The Guild Hall can now train Reavers").
- [ ] **Sold at the Guild Hall.** One node per class and race beyond the Vanguard and Human, each with an `unlock` grant and a Renown cost (proposal below), placed in the Guild Hall tree. ETH-132 re-lays the tree later and keeps these nodes.
- [ ] **Teaser recruits.** When the Prepare screen fills empty slots with random recruits, each slot has `TEASER_CHANCE` (default 10%) to draw a revealed-but-unbought class or race, from the seeded RNG. The recruit plays normally and earns Mastery for its class; the party card and Codex say "Not yet trained by the guild".
- [ ] **Existing saves keep what they've played.** On migration, any class or race that already has Mastery XP or an adventurer record in the profile is recorded as bought for free, so ETH-160's open-by-default period never takes anything away.
- [ ] The Codex entry and tooltip of a locked class or race show how to reveal it and what it costs.
- [ ] Tests: a node can't be bought before its reveal; the reveal records once and shows a summary line; buying it makes the class available on the Prepare screen; teaser recruits appear at about the set rate over many seeds and only from revealed classes; the migration grandfathers played classes.

## Proposal (for Nate to shape)
| Unlocks | Revealed when | Cost |
|---|---|---|
| Outrider | A run reaches floor 4 | 150 Renown |
| Reaver | A run kills 40 monsters (`metInRun`, if a kill-count condition exists; otherwise reach floor 5) | 200 Renown |
| Lorekeeper | A run identifies 5 items (`metInRun`; otherwise finish 5 runs) | 250 Renown |
| Stonekin | Win a run | 200 Renown |
| Fenling | Finish 8 runs | 200 Renown |

Each reveal is meant to come from playing the way that class or race likes to play. The implementer uses the run-scope conditions that exist (ETH-121) and asks before adding a new one.

## Notes
- Decided with Nate (2026-11-24): a milestone **reveals** a class or race, and the Guild Hall **sells** it for Renown. Some classes are unlocked through building trees, others through quests. Revealed but unbought classes sometimes appear as random recruits, as a teaser. Classes met as temporary dungeon companions are ETH-089.
- `CLAUDE.md` §4 says class and race unlocks are "first random, then selectable". With reveal-then-buy and teaser recruits, the random part is already there (teasers), so this item doesn't add a separate random-unlock step.

Open decisions:
- (default) The reveal conditions and costs in the table above.
- (default) `TEASER_CHANCE` = 10% per random slot.
- (default) Played classes are grandfathered on migration. Alternative: everything new locks again.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Added ETH-121 (shared conditions) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Priority P2 to P1 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: reveal by milestone, buy at the Guild Hall; some unlocks come from building trees or quests; teaser recruits.
- 2026-11-24: (spec gate) Detailed spec written against the code (upgrade unlock grants, milestones, ETH-160's classes); awaiting Nate's review.
