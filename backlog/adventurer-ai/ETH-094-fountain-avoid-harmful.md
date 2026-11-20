---
id: ETH-094
title: The AI avoids fountain draughts known to be harmful
type: feature
status: pending-review
priority: P3
milestone: M4
epic: adventurer-ai
size: S
depends_on: [ETH-072]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-19
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
- 2026-11-19: Implemented by Gemini. Added per-run `identifiedDraughts: string[]` to `FloorsState` (and optional `FloorsConfig.identifiedDraughts`, `STATE_VERSION` 27, invariant in `floors.fountains`), recorded on party `drink` execution; updated `act.drink_fountain` to skip fountains whose next draught is identified with `outcome === 'bane'`; added `RuleSkipped` (`{ skipped: string }`) to `RuleActionDef.resolve` so `chooseRule` appends skip explanations (`; skipped fountain (brackish water is harmful)`) to the fired rule's `ruleFired` trace and `intent.detail`; added hand-built map tests in `test/sim/fountains.test.ts` and engine skip-trace tests in `test/sim/ai.test.ts`.
  - (default) Draught identification is per-run in `state.domains.floors.identifiedDraughts` (a draught type is identified as soon as any party member drinks it; `RunConfig.identifiedDraughts` lets callers or future meta/Codex/Smithy upgrades pre-seed it) — alternative: automatically seed from profile Codex across runs in `buildRunConfig`.
  - (default) Skip explanations travel as `RuleSkipped` notes appended to the fired `ruleFired.detail` and `ai.memory.intent.detail` (so the party card shows them and consecutive identical decisions still fold in `logLines`) — alternative: emit a separate `ruleSkipped` event each turn.
