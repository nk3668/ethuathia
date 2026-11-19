---
id: ETH-079
title: runStarted carries the first floor's type
type: chore
status: done
priority: P3
milestone: M1
epic: sim-core
size: S
depends_on: [ETH-062, ETH-064]
created: 2026-11-18
updated: 2026-11-19
---

## Summary
The `runStarted` event includes the floor type id of the first floor, like `floorEntered` already does.

## Why
Follow-up from ETH-064: the Codex and the log can then treat the first floor like every other floor.

## Acceptance criteria
- [x] `runStarted` has `floorType`
- [x] Consumers that special-case the first floor use it
- [x] Determinism test still passes

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: (default) `runStarted` log text names `floorType` as a Codex mention in parentheses (`"enters the dungeon (Hewn Halls, 10 floors deep)."`) and keeps the plain wording when `floorType` is `null` — alternative: `"enters Hewn Halls, 10 floors deep."` or omitting it from the log line.
- 2026-11-19: Implemented by Gemini; marked pending-review (PR opened, not merged).
- 2026-11-19: Reviewed by Claude and merged as PR #71. Done.
