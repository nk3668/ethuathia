---
id: ETH-189
title: Break the flee-and-return loop against a ranged foe
type: bug
status: pending-review
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
- [x] A fixed-seed test reproduces the loop (hurt adventurer, a ranged foe guarding the route to the goal) and shows the AI now does something else: waits to recover, uses healing, takes another route, or retreats the run.
- [x] Stuck detection notices a repeated flee/return cycle (position and explore percentage alone don't) and changes goals, with a log line.
- [x] T0 with Extraction Drills unowned; a smoke run with ETH-187's nodes on shows no turn-cap endings from this cause.

## Notes
- Field Rations (ETH-187) gives a way to recover out of combat; an adventurer without them still needs a way out.
- Related: ETH-154 (smarter escape direction, M3).

## Log
- 2026-11-25: Created from the ETH-187 implementer's trace of seed 66.
- 2026-11-25: Moved to M3 (Nate, ETH-161 wrap-up): it is AI behavior, M3's theme.
- 2026-11-25: Now ready (M3 kickoff).
- 2026-11-25: Started. Reproduced on current main at seeds 39, 65 and 96 (Drills alone; seed numbers drifted since ETH-187): a tarn spitter guards the way, the hero flees, the 12 calm turns end the flight at about 37% HP, exploring walks back and it flees again, for 5,000+ turns. Recovery is only 1 HP per 12 turns.
- 2026-11-25: Fix: stuck detection counts flights (`AiMemory.fleeCycle`, optional, no STATE_VERSION bump). Three flights near one spot within 150 turns without recovering emit a `stuck` event and the hero rests (`cond.recovering` / `act.rest`, up to 500 turns or until 60% HP). Eight flights in a cycle, or two rests that did not bring HP back (a hunter that keeps finding it, seeds 14 and 86), make it give the run up (`cond.no_recovery` / `act.retreat_run`). Test: `test/sim/fleeCycle.test.ts`. 100 seeds, Drills alone: turn-cap endings 3 to 0; all ETH-187 nodes on: 4 to 0. T0 (20 seeds, no Drills): 5 seeds (4, 5, 6, 12, 13) play out differently because they had flee loops too; win rate unchanged. Pending review.
- 2026-11-25: Nate's decision: one adventurer must never send the whole party home; ending a run early is the player's call (picked stances like Fall back are fine). Removed the `cond.no_recovery` / `act.retreat_run` escalation. A hopeless cycle (8 flights, or 2 rests that did not bring HP back) now blocks the area within 6 tiles of the foe for exploring, picking up and going down (`fleeCycle.blocked`, `combat/zone.ts`), emits one player-facing `stuck` line suggesting Fall back, and otherwise rests up to 90% HP (`cond.cycle_blocked` / `act.rest`) before trying again. The turn cap is the only hard net. Test `fleeCycle.test.ts` now checks the party is never sent home. 100 seeds: solo 0 caps, party of 3 0 caps, all ETH-187 nodes 0 caps, Drills x3 alone 1 cap (seed 95: the only way on is through a pack of gloomchanters and a basalt giant that beats it even at 90% HP; main had 3).
- 2026-11-25: Review fixes. The rest of the party no longer walks off from a resting member (`cond.ally_resting` / `act.wait_for_ally`: walk back within 3 tiles, then "waiting for X to recover"). A flight after a finished or cut-short rest clears `restUntil`, so the next rest can start in the same cycle (`rests` then counts toward hopeless without depending on a gap). The `core.aiMemory` invariant now checks `rests`, `blocked` and `pos`. Note for reviewers: `fleeCycle` is written to the AI memory on every flight, so it shows up in serialized state and in the state hash: hashes differ from main on any seed where an adventurer fled, even when play is identical.
