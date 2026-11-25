---
id: ETH-154
title: Smarter escape direction: flee toward allies, stairs or home instead of just away
type: feature
status: pending-review
priority: P2
milestone: M3
epic: adventurer-ai
size: M
depends_on: [ETH-148]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
ETH-148 made fleeing decide *when* to flee and *from what*. This item improves *where to*:
- A fleeing adventurer prefers escape routes toward a living ally or the stairs up, instead of just
  "away".
- A wounded adventurer with no healing, whose every way forward passes a remembered threat, heads
  home (`act.retreat_run`) instead of exploring or descending.

## Why
The ETH-148 and ETH-080 agents found three problems:
- **Breaking away mid-fight:** an adventurer that flees while the party is still fighting leaves the
  others behind.
- **Pressing on while wounded:** an adventurer with low HP, no healing and no safe ground still
  explores or goes down the stairs.
- **Aimless direction:** flee takes the steepest way out and ignores whether it leads anywhere
  useful.

`CLAUDE.md` §5.3 says to flee when an escape route exists. An escape into a dead end, or away from
help, wastes it.

## Acceptance criteria
- [x] The flee map breaks ties toward a living ally on the same floor, then toward the stairs up.
      This builds on the existing flee map, not a new pathing system.
- [x] A wounded adventurer rests (`act.rest`, never a retreat: Nate, 2026-11-25) when every unexplored tile and every way
      down is near a remembered threat. Wounded means below `FLEE_RELEASE_PERCENT` with no healing
      potion. Any new threshold is a named constant in `src/sim/combat/fleeConfig.ts`.
- [x] The trace says why: "fleeing toward Mira", "fleeing toward the stairs up", "resting:
      wounded, no healing, threats on every way forward".
- [x] The Codex and tooltip text for flee and retreat mention the new preferences.
- [x] Sim tests on a fixed seed with a hand-built map:
  - an adventurer flees toward an ally when two escapes are otherwise equal;
  - a boxed-in, wounded adventurer rests where it is and never ends the run;
  - a healthy one in the same spot doesn't.
- [x] Sim gate per `docs/DIFFICULTY_PHILOSOPHY.md` §9 as tightened 2026-11-25 (work items run T0
      and a 20-seed smoke run only; T1–T3 wait for the capstone): a 20-seed smoke run for party 1
      and party 4. `npm run check` passes.

## Notes
- Reuse `isThreat`, `freshThreats` and `isWounded` from `src/sim/combat/threat.ts` (ETH-148).
- Filed from the out-of-scope ideas of ETH-148 and ETH-080 (Nate approved, 2026-11-24).

## Log
- 2026-11-24: Created (Nate approved filing).
- 2026-11-24: Moved from M2 to M3 in the backlog reorganization by theme.
- 2026-11-25: Now `ready` (M3 kickoff). The sim gate now matches the 2026-11-25 policy (no T2 in work items).
- 2026-11-25: Implemented, `pending-review`. `src/sim/combat/escape.ts`: `escapeStep` (tie-break among flee steps within `ESCAPE_TIE_MARGIN`, toward an ally, then the stairs up) and `cond.boxed_in`. Tests in `test/sim/escape.test.ts`.
- 2026-11-25: Nate decided that one adventurer must never send the whole party home; ending a run early is the player's decision (a picked stance such as Fall back). Rebased on ETH-189 (e7cc372). `cond.boxed_in` now rests (`act.rest`, latch `AiMemory.boxedIn`) and logs one line per episode ending "Consider the Fall back stance", instead of retreating. Also added `cond.cycle_blocked_leaving → act.rest` above `act.retreat_run`: on the way out, flee and retreat_run looped to the turn cap in party-3 seeds 6 and 27 (60-seed run). Party 3 seed 30 still caps at 60 seeds: chronically wounded party on floor 9, ETH-189 rest/flee cycles never recover (see the PR).
