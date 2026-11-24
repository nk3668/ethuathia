---
id: ETH-094
title: The AI avoids fountain draughts known to be harmful
type: feature
status: done
priority: P3
milestone: M6
epic: adventurer-ai
size: S
depends_on: [ETH-072]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-24
---

## Summary
The baseline AI still drinks below 50% HP, but never from a fountain whose draught type is identified as harmful.

## Why
Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [x] Identified harmful draught types are skipped by the baseline
- [x] The trace explains the skip
- [x] Sim test with a hand-built map

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Assigned to Antigravity as a low-risk item.
- 2026-11-19: Implemented by Gemini. Added `RuleSkipped` (`{ skipped: string }`) to `RuleActionDef.resolve` so `chooseRule` appends skip explanations (`; skipped fountain (brackish water is harmful)`) to the fired rule's `ruleFired` trace and `intent.detail`; added hand-built map tests in `test/sim/fountains.test.ts` and engine skip-trace tests in `test/sim/ai.test.ts`.
- 2026-11-20: Updated after review to base avoidance on per-fountain observed draughts (`state.domains.floors.observedFountains: Record<EntityId, string>`, `STATE_VERSION` 27) rather than peeking at a fountain's hidden `draughts[0]` queue. Untouched fountains are never peeked at; drinking records the last draught observed from that fountain, and `act.drink_fountain` skips any fountain whose last observed draught has `outcome === 'bane'`.
  - (default) Skip explanations travel as `RuleSkipped` notes appended to the fired `ruleFired.detail` and `ai.memory.intent.detail` (so the party card shows them and consecutive identical decisions still fold in `logLines`) — alternative: emit a separate `ruleSkipped` event each turn.
- 2026-11-23: Rebased onto main (STATE_VERSION 29) and merged to main (PR #81); PENDING REVIEW.
- 2026-11-23: Reviewed; done. No major issues; avoidance reads only draughts the party has seen and doesn't peek at hidden ones.
- 2026-11-24: Moved from M4 to M6 in the backlog reorganization by theme.
