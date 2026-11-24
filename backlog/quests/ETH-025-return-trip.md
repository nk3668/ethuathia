---
id: ETH-025
title: Return trip: walk back up through explored floors, with light respawns
type: feature
status: done
priority: P1
milestone: M1
epic: quests
size: M
depends_on: [ETH-024]
created: 2026-11-17
updated: 2026-11-23
---

## Summary
After the contracts are done, the party climbs back to the exit. Floors already explored are crossed quickly along known paths, and higher-level monsters repopulate visited floors so the trip back is not free.

## Why
Victory means getting out, which keeps retreat thresholds and rules meaningful after the objective. See `CLAUDE.md` §2 (Ending a run).

## Acceptance criteria
- [x] Floors keep their layout and party memory, so going up returns to the same floor at its stairs down
- [x] When all contracts are complete, the baseline AI paths to the stairs up on each floor without exploring
- [x] Re-entering a floor repopulates it with a small, tunable wave of higher-level monsters away from the arrival stairs, announcing "The dungeon stirs." once per run
- [x] Reaching the top floor's exit ends the run as a Victory
- [x] Sim test: a fixed-seed run completes the relic contract and walks out

## Notes
- Speed: explored floors are crossed directly along known paths at normal sim speed for now.
- Retreat (CLAUDE.md §2) reuses the same return behavior.
- Return-trip monster count and `depthShift` (higher-level monster selection) are tunable via `RunConfig.respawn` and deferred for final tuning in `ETH-080`.
- A `floors.constant_respawn` run-modifier flag seam is wired for the planned Guild Hall upgrade (`ETH-129`).

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-22: Started and done. Added `respawnFloor` (`src/sim/combat/monsters.ts`) with tunable `depthShift` (default +1), count and `stairsDistance`; `src/sim/floors/respawn.ts` (`maybeRespawnFloor`, `FLAG_CONSTANT_RESPAWN`, `CONSTANT_RESPAWN_COOLDOWN`); `dungeonStirred` ("The dungeon stirs.", announced once per run) and quiet `floorRespawned` events; `FloorsState` (`respawns`, `stirAnnounced`, `lastVacated`, `STATE_VERSION` 27) and invariants; `test/sim/returnTrip.test.ts` including a generated 3-floor fixed-seed Victory + save/load determinism test. Filed `ETH-129` for the Guild Hall constant-respawn upgrade and noted `depthShift`/density tuning in `ETH-080`.
- 2026-11-23: Merged to main (PR #83); PENDING REVIEW.
- 2026-11-23: Reviewed; done. No major issues beyond ETH-136 (return-trip surge).
