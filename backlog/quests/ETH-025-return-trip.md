---
id: ETH-025
title: Return trip: walk back up through explored floors, with light respawns
type: feature
status: idea
priority: P1
milestone: M1
epic: quests
size: M
depends_on: [ETH-024]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
After the contracts are done, the party climbs back to the exit. Floors already explored are crossed quickly along known paths, and a few monsters respawn so the trip back is not free.

## Why
Victory means getting out, which keeps retreat thresholds and rules meaningful after the objective. See `CLAUDE.md` §2 (Ending a run).

## Acceptance criteria
- [ ] Floors keep their layout and party memory, so going up returns to the same floor at its stairs down
- [ ] When all contracts are complete, the baseline AI paths to the stairs up on each floor without exploring
- [ ] Re-entering a floor respawns a small, tunable number of monsters away from the arrival stairs, with a log line ("The dungeon stirs")
- [ ] Reaching the top floor's exit ends the run as a Victory
- [ ] Sim test: a fixed-seed run completes the relic contract and walks out

## Notes
- Speed: explored floors could be resolved with fewer UI updates rather than skipped, so the sim stays honest.
- Retreat (CLAUDE.md §2) can reuse the same return behavior.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
