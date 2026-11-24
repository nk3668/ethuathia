---
id: ETH-093
title: Unlock town buildings by finishing a quest for each
type: feature
status: idea
priority: P2
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-074, ETH-024, ETH-114, ETH-121]
created: 2026-11-18
updated: 2026-11-24
---

## Summary
Each building opens through its own **building quest**, a contract themed on the building (e.g. the Smithy opens after a run brings an anvil back from floor 3). It takes a contract slot, pays currency like any contract, and only one building quest can be taken per run. Quests open in a chain starting with the Smithy: a new building's quest is offered once a set share of the nodes in the open buildings is bought, so the player alternates between spending and questing.

## Why
Unlocks become story beats. Decided in Nate's interview answers (2026-11-18). Replaces ETH-074's milestone conditions.

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] Each building has a building quest in content (a quest item to bring back, a named foe, a depth), as a contract kind on the objective engine
- [ ] The quest is offered on the Prepare screen as a contract once its gate is met: the Smithy from the start; others when the bought share of open-building nodes reaches a tunable threshold
- [ ] At most one building quest per run; it uses a contract slot and pays a currency reward
- [ ] A failed building quest can be taken again on a later run
- [ ] Background quests (Ossuary: bury the first fallen; Tavern: an adventurer survives five runs) open their building when the condition is met, with no contract needed
- [ ] The run summary and the Town show the unlock
- [ ] Existing profiles keep buildings they already opened

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-114 (objective engine), ETH-121 (shared conditions) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Progression discussion with Nate: building quests are contracts (one per run, uses a slot, pays currency), chained from the Smithy, gated by the share of nodes bought. Tier quests split out to ETH-170.
