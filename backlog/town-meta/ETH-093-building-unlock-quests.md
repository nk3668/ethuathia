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
updated: 2026-11-19
---

## Summary
Each building opens through its own small quest instead of a milestone, e.g. the Smithy opens after a run brings an anvil back from floor 3.

## Why
Unlocks become story beats. Decided in Nate's interview answers (2026-11-18). Replaces ETH-074's milestone conditions.

## Acceptance criteria
- [ ] Each building has an unlock quest in content (a quest item to bring back, a monster to slay, a depth)
- [ ] The quest is offered automatically while the building is locked and shows on the Prepare screen
- [ ] The run summary and the Town show the unlock
- [ ] Existing profiles keep buildings they already opened

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Added ETH-114 (objective engine), ETH-121 (shared conditions) to `depends_on`: build on the shared system instead of a parallel version.
