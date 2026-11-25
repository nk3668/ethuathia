---
id: ETH-165
title: Tactics balance pass (M3 capstone)
type: chore
status: idea
priority: P1
milestone: M3
epic: tools-balance
size: M
depends_on: [ETH-162, ETH-163, ETH-164, ETH-071, ETH-151, ETH-154, ETH-189, ETH-193, ETH-194, ETH-195]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
Check three things:
- class default builds play sensibly
- good tactic choices beat the defaults by a visible margin with a set limit
- no single build or stance dominates

Also settle the habit-slot count by experiment.

## Why
"Idle decisions matter" (`CLAUDE.md` §1): tactics must pay off without making the defaults useless. This is M3's milestone balance check (`docs/DIFFICULTY_PHILOSOPHY.md` §9.1).

## Acceptance criteria
- [ ] The harness can run tactic picks as a sweep: no tactics (baseline only), class defaults, each shipped loadout, and each stance.
- [ ] Target margins are written down in `docs/DIFFICULTY_PHILOSOPHY.md` and met. A starting proposal for Nate: the best loadout beats class defaults by +8 to +15 points of win rate, and no loadout is best at every party size.
- [ ] A habit-slot experiment (1, 2 and 3 slots) is reported to Nate, with the cap and costs he picks.
- [ ] The Controller role is worth taking in at least one party shape.
- [ ] T3 acceptance sweep recorded in the Log.

## Log
- 2026-11-24: Created in the backlog reorganization by theme.
- 2026-11-25: Retargeted to the tactics design (Nate, 2026-11-25). Added the habit-slot experiment and the new M3 items to `depends_on`.
