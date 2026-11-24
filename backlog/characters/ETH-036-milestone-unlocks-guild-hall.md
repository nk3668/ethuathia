---
id: ETH-036
title: Milestone-gated class and race unlocks bought at the Guild Hall
type: feature
status: done
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
- [x] Spec reviewed by Nate before building (spec gate)
- [x] **Revealed by a milestone.** `UpgradeNodeDef.reveal?: Milestone`. Until it is met, the node can't be bought; the tree shows it as a sealed node with its milestone ("Revealed when you reach floor 4") and its cost. Met reveals are recorded in the `milestones` slice under the node's id, like building unlocks, and get a run-summary line ("The Guild Hall can now train Reavers").
- [x] **Sold in the town.** One node per class and race beyond the Vanguard and Human, each with an `unlock` grant and a cost, placed in the building the town-tree layout gives it (Nate wants classes spread across buildings by theme): the Outrider, Fenling and Lorekeeper in the Guild Hall (Renown), the Reaver and Stonekin in the Smithy (Trophies). ETH-132 and ETH-159 build the full trees around these nodes; until then they sit in their building's first rows.
- [x] **Teaser recruits.** When the Prepare screen fills empty slots with random recruits, each slot has `TEASER_CHANCE` (default 10%) to draw a revealed-but-unbought class or race, from the seeded RNG. The recruit plays normally and earns Mastery for its class; the party card and Codex say "Not yet trained by the guild".
- [x] **A save only has what it has unlocked** (Nate, 2026-11-24): no grandfathering. Once this lands, every class and race beyond the Vanguard and Human is locked until revealed and bought, whatever a save played during ETH-160's open period. Mastery XP already earned for a class stays banked.
- [x] The Codex entry and tooltip of a locked class or race show how to reveal it and what it costs.
- [x] Tests: a node can't be bought before its reveal; the reveal records once and shows a summary line; buying it makes the class available on the Prepare screen; teaser recruits appear at about the set rate over many seeds and only from revealed classes; an old save that played a now-locked class loads with it locked and its Mastery XP intact.

## Reveals and costs (approved by Nate, 2026-11-24)
| Unlocks | Building | Revealed when | Cost |
|---|---|---|---|
| Outrider | Guild Hall | A run reaches floor 4 | 150 Renown |
| Reaver | Smithy | A run kills 40 monsters (`metInRun`, if a kill-count condition exists; otherwise reach floor 5) | 200 (in Trophies, the Smithy's currency) |
| Lorekeeper | Guild Hall | A run identifies 5 items (`metInRun`; otherwise finish 5 runs) | 250 Renown |
| Stonekin | Smithy | Win a run | 200 (in Trophies) |
| Fenling | Guild Hall | Finish 8 runs | 200 Renown |

Each reveal is meant to come from playing the way that class or race likes to play. The implementer uses the run-scope conditions that exist (ETH-121) and asks before adding a new one.

## Notes
- Decided with Nate (2026-11-24): a milestone **reveals** a class or race, and the Guild Hall **sells** it for Renown. Some classes are unlocked through building trees, others through quests. Revealed but unbought classes sometimes appear as random recruits, as a teaser. Classes met as temporary dungeon companions are ETH-089.
- `CLAUDE.md` §4 says class and race unlocks are "first random, then selectable". With reveal-then-buy and teaser recruits, the random part is already there (teasers), so this item doesn't add a separate random-unlock step. Nate (2026-11-24): companions met during a run who aren't part of the party (ETH-089) are always random.

Decisions (Nate, 2026-11-24): the reveal table above; `TEASER_CHANCE` = 10% per random slot; no grandfathering (a save only has what it has unlocked).

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-19: Added ETH-121 (shared conditions) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Priority P2 to P1 in the backlog reorganization by theme.
- 2026-11-24: Progression discussion with Nate: reveal by milestone, buy at the Guild Hall; some unlocks come from building trees or quests; teaser recruits.
- 2026-11-24: (spec gate) Detailed spec written against the code (upgrade unlock grants, milestones, ETH-160's classes); awaiting Nate's review.
- 2026-11-24: Approved by Nate: reveal table and 10% teasers as proposed; no grandfathering; classes spread across buildings (Reaver and Stonekin to the Smithy, per the town-tree layout). Status ready.
- 2026-11-24: Built. Added UpgradeNodeDef.reveal (a milestone target under the node's id, so the existing milestones slice and run-summary line serve it), five sold nodes, teaser recruits in fillParty, Codex Training row, party-card label. No kill-count or identify-count run condition exists, so Reaver reveals at floor 5 and Lorekeeper at 5 finished runs (the spec fallbacks). Status done.
