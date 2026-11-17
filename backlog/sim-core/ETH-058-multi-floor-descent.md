---
id: ETH-058
title: Multiple floors: stairs, lazily generated floors and a baseline descend rule
type: feature
status: done
priority: P0
milestone: M1
epic: sim-core
size: M
depends_on: [ETH-055]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
The dungeon grows beyond one floor. A `stairs` action moves an actor between floors; floors are generated when first reached; the baseline AI descends once a floor is explored.

## Why
Almost every M1 item (contracts, return trip, depth rewards) needs depth. See `CLAUDE.md` §5.3 and `docs/ARCHITECTURE.md` §3.6.

## Acceptance criteria
- [x] A run has a dungeon depth (default 10, in the run config). The dungeon graph is a straight line of that length; floor N+1 is generated with the dungeon RNG stream the first time someone reaches it, and floors keep layout and memory
- [x] `stairs` action (up/down) on a matching stairs tile moves the actor to the linked stairs on the other floor; events + log text
- [x] Party stays together: the baseline only takes the stairs when the party is gathered (or regroups first); a split party still works in the scheduler
- [x] Baseline rules: descend when the floor is explored or exploration value is gone, with a per-floor turn cap as a safety net; on the bottom floor, wait (until quests/run-end replace this)
- [x] Snapshot and top bar show "Floor x/N"; the map follows the selected adventurer's floor
- [x] Headless harness: report per-floor turns and max depth; a run ends when the party is idle on the bottom floor or hits the cap
- [x] Fixed-seed sim tests: descend, arrive at the right stairs, revisit a floor unchanged

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-17: Started.
- 2026-11-17: Done. Floors domain in `src/sim/floors/`: `buildDungeon`, `ensureFloor` (each floor's RNG is derived from the seed and the floor id, so the order floors are first reached never changes one), the `stairs` action with `tookStairs` and `floorEntered` events (the arrival hook for later items), `act.descend` / `act.gather` with chained gathering at the stairs, `cond.floor_overstayed` (per-floor turn cap, default 1000 game turns) and `cond.bottom_floor`. Snapshots take `ViewOptions.follow` and hosts `setView`, so the map follows the selected adventurer. Headless harness runs whole dungeons and reports depth and turns per floor. `STATE_VERSION` 6. Also sped up the AI frontier scan and the plain-data invariant, so the soak is faster than before.
- 2026-11-17: (default) Generated floors are all Hewn Halls and the bottom floor's stairs down are removed — floor variety is M6; the relic contract may want a marker there instead.
- 2026-11-17: (default) The baseline explores each floor fully before descending, and the party regroups at the stairs down (members on other floors aren't waited for) — alternatives: descend as soon as the stairs are known, or wait for members on shallower floors too.
- 2026-11-17: (default) Taking the first floor's up stairs is refused ("leaving isn't possible yet") until the return trip (ETH-025) and run end (ETH-062) define leaving.
