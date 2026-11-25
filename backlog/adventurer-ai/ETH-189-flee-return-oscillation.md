---
id: ETH-189
title: Break the flee-and-return loop against a ranged foe
type: bug
status: idea
priority: P2
milestone: M3
epic: adventurer-ai
size: S
depends_on: [ETH-148, ETH-187]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
A hurt adventurer flees a ranged foe, calms down without regaining HP, walks back toward its goal past the same foe and flees again, for thousands of turns until the turn cap. Stuck detection doesn't catch the oscillation.

## Why
Found while building ETH-187: with Extraction Drills the fleeing hero always escapes, which makes the loop reachable (seed 66, Drills alone, fresh solo). In a 100-seed all-on vs off run, turn-cap endings rose from 0 to 3 (seeds 17, 66, 86). `CLAUDE.md` §5.3 says the baseline must not wander or stall. ETH-161's numbers are skewed by it.

## Acceptance criteria
- [ ] A fixed-seed test reproduces the loop (hurt adventurer, a ranged foe guarding the route to the goal) and shows the AI now does something else: waits to recover, uses healing, takes another route, or retreats the run.
- [ ] Stuck detection notices a repeated flee/return cycle (position and explore percentage alone don't) and changes goals, with a log line.
- [ ] T0 with Extraction Drills unowned; a smoke run with ETH-187's nodes on shows no turn-cap endings from this cause.

## Notes
- Field Rations (ETH-187) gives a way to recover out of combat; an adventurer without them still needs a way out.
- Related: ETH-154 (smarter escape direction, M3).

## Log
- 2026-11-25: Created from the ETH-187 implementer's trace of seed 66.
- 2026-11-25: Moved to M3 (Nate, ETH-161 wrap-up): it is AI behavior, M3's theme.
