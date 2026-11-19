---
id: ETH-075
title: Name the killer in the death log line and the wipe summary
type: feature
status: done
priority: P2
milestone: M1
epic: combat-items
size: S
depends_on: [ETH-060, ETH-062]
created: 2026-11-18
updated: 2026-11-19
---

## Summary
When an adventurer dies, the log says what killed them, and the run summary of a wipe names the killer of each fallen adventurer.

## Why
Design principle 3 in `CLAUDE.md` §1: every death has a clear cause in the log. Follow-up from ETH-060.

## Acceptance criteria
- [x] The `fell` event (or the death event) carries the killer's id, name and kind (monster, trap, status)
- [x] The log line reads e.g. "Mira is slain by a cave hound on floor 4"
- [x] The wipe run summary lists each fallen adventurer with their killer
- [x] Sim test with a fixed seed and hand-built map checks the event and the text

## Notes
Status deaths (poison) should name the source of the status when known.

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Started (in-progress).
- 2026-11-19: Done. `fell` carries `killer: Killer | null` (`kind` monster / adventurer / status / trap / other, `id`, `def`, `name`; `ranged` and `bolt` for a bolt; `source` for a status's inflicter, kept in the new `ActiveStatus.by`). The log reads "Mira is slain by a slate hound on floor 4." (the killer as a Codex mention), the wipe cause "Mira was slain by …", and the run summary's party list names each fallen adventurer's killer; `track.deaths` and the run history keep it. `STATE_VERSION` 20. Tests in `test/sim/killer.test.ts`.
- 2026-11-19: (default) A status death reads "dies poisoned by a mire toad" (the status name used as an adjective, since status defs have no noun form) — alternatives: add a death noun to status content ("dies of poison"), or "succumbs to Poisoned".
- 2026-11-19: (default) A status's source is its latest applier (a refreshed or extended status takes the new one) — alternative: keep the first applier.
