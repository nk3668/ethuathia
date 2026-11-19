---
id: ETH-079
title: runStarted carries the first floor's type
type: chore
status: ready
priority: P3
milestone: M1
epic: sim-core
size: S
depends_on: [ETH-062, ETH-064]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
The `runStarted` event includes the floor type id of the first floor, like `floorEntered` already does.

## Why
Follow-up from ETH-064: the Codex and the log can then treat the first floor like every other floor.

## Acceptance criteria
- [ ] `runStarted` has `floorType`
- [ ] Consumers that special-case the first floor use it
- [ ] Determinism test still passes

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
