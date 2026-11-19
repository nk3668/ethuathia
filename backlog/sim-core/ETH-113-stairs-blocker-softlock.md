---
id: ETH-113
title: A creature that never moves on the stairs soft-locks the run
type: bug
status: done
priority: P1
milestone: M1
epic: sim-core
size: S
depends_on: [ETH-040, ETH-062]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
A monster that never moves, standing on the stairs the party needs, no longer hangs the run: the
baseline walks up to it and fights it, and stuck detection counts long waits so any future
blocker leaves a trace instead of hanging silently.

## Why
Since ETH-040 (monster roles), `npm run sim -- --seeds 50` seed 43 hit the turn cap: on the way
out a Moss tender (a support monster that never moves or attacks) sat on floor 7's stairs up. A
gathered adventurer treated anyone on the stairs as a party member about to take them, so it
waited beside it forever (`act.gather`), and stuck detection ignored `idle` waiting. Breaks the
exit trip (`CLAUDE.md` §2, §5.3 "stuck detection").

## Acceptance criteria
- [x] Only a party member on the stairs makes gathered members wait (`partyMemberAt`, used by
  `act.descend` and `act.retreat_run`); anyone else is walked up to, and attacked if hostile.
  Path blockers off the stairs are routed round (`OCCUPIED_COST`) or attacked when adjacent.
- [x] Stuck detection counts waiting: `WAIT_STUCK_TURNS` (50) decisions in a row waiting by an
  idle rule other than `act.wait` while nobody in the party moves drop that rule with a `stuck`
  event and trace line.
- [x] Fixed-seed sim tests on hand-built floors: a stationary monster on the stairs up during the
  exit trip, an ally that never leaves the stairs, and a moving straggler that keeps the count at 0.
- [x] `npm run sim -- --seeds 50`: 50/50 runs end, seed 43 no longer hits the turn cap. Soak passes.

## Notes
- Other blockers checked: party members on the stairs are still waited for (they take them once
  everyone is gathered); one that never does (possessed and parked, say) is now caught by the
  waiting count. `sharesTile` creatures never share with adventurers, so they block like any
  other monster and are fought. Neutral actors (none exist yet) can't be attacked: one on the
  stairs is walked up to and waited on by a non-idle rule, which the existing `STUCK_TURNS`
  detection already drops, so it loops with traces rather than hangs silently.
- `AiMemory` gained `waited` and `ProgressMark.party`: `STATE_VERSION` 18.

## Log
- 2026-11-19: Created and started (found in the ETH-040 sim compare, seed 43).
- 2026-11-19: Done. `partyMemberAt` for the stairs-occupied checks; waiting counts toward stuck
  (`WAIT_STUCK_TURNS`); `test/sim/stairsBlocker.test.ts`. Sim compare: 50/50 victories (was 49 +
  1 cap), 0 stuck events. Soak 100/100.
